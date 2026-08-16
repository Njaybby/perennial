/// One object per blob, holding the vault that pays for that blob's own storage lease.
/// Revenue flows in through `credit` and out through `renew`, and a blob lives exactly as long as the first outpaces the second.
///
/// Two things here stand in for pieces that need Shelby access to build properly.
/// `credit` trusts a single registered gateway instead of settling against proven read receipts.
/// `renew` advances `expires_at_secs` locally instead of calling Shelby's lease extension, and sends the cost to treasury.
/// Both are flagged at their call sites and in docs/THREATS.md.
///
/// Settlement is in APT via its paired fungible asset at 0xA, standing in for ShelbyUSD.
module perennial::endowment {
    use std::signer;
    use aptos_framework::object::{Self, Object, ExtendRef, TransferRef};
    use aptos_framework::timestamp;
    use aptos_framework::fungible_asset::{Self, Metadata};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::event;
    use perennial::errors;
    use perennial::registry;
    use perennial::pricing;

    /// Decaying means the runway fell below the renewal lead while the lease is still valid.
    /// Expired means the lease itself lapsed, leaving `grace_secs` to recover before Dead.
    /// Dead and Archived are terminal; everything before them can still be revived by revenue or a top up.
    const STATE_SEEDED: u8 = 0;
    const STATE_ACTIVE: u8 = 1;
    const STATE_DECAYING: u8 = 2;
    const STATE_EXPIRED: u8 = 3;
    const STATE_DEAD: u8 = 4;
    const STATE_ARCHIVED: u8 = 5;

    struct Endowment has key {
        blob_id: vector<u8>,
        owner: address,
        size_bytes: u64,
        created_at_secs: u64,
        expires_at_secs: u64,
        last_renewed_at_secs: u64,
        last_read_at_secs: u64,

        creator_claimable: u64,

        lifetime_revenue: u128,
        lifetime_rent: u128,
        lifetime_creator: u128,
        lifetime_protocol: u128,
        lifetime_renewal_spend: u128,

        reads: u64,
        bytes_served: u128,
        renewals: u64,

        state: u8,
        rent_bps: u64,
        creator_bps: u64,
        protocol_bps: u64,
        target_runway_secs: u64,

        extend_ref: ExtendRef,
        transfer_ref: TransferRef,
    }

    struct EndowmentView has drop, store {
        blob_id: vector<u8>,
        endowment: address,
        owner: address,
        size_bytes: u64,
        created_at_secs: u64,
        expires_at_secs: u64,
        last_renewed_at_secs: u64,
        last_read_at_secs: u64,
        balance: u64,
        creator_claimable: u64,
        lifetime_revenue: u128,
        lifetime_rent: u128,
        lifetime_creator: u128,
        lifetime_protocol: u128,
        lifetime_renewal_spend: u128,
        reads: u64,
        bytes_served: u128,
        renewals: u64,
        state: u8,
        rent_bps: u64,
        creator_bps: u64,
        protocol_bps: u64,
        target_runway_secs: u64,
        runway_secs: u64,
    }

    #[event]
    struct EndowmentSeeded has drop, store {
        blob_id: vector<u8>, endowment: address, owner: address,
        size_bytes: u64, expires_at_secs: u64, amount: u64,
    }

    #[event]
    struct ToppedUp has drop, store {
        blob_id: vector<u8>, endowment: address, payer: address,
        amount: u64, new_balance: u64, new_runway_secs: u64,
    }

    #[event]
    struct RevenueCredited has drop, store {
        blob_id: vector<u8>, endowment: address, gross: u64, rent: u64,
        creator: u64, protocol: u64, bytes: u64, reads: u64, new_runway_secs: u64,
    }

    #[event]
    struct Renewed has drop, store {
        blob_id: vector<u8>, endowment: address, cost: u64, bounty: u64,
        old_expires_at_secs: u64, new_expires_at_secs: u64, duration_secs: u64,
    }

    #[event]
    struct StateChanged has drop, store {
        blob_id: vector<u8>, endowment: address, from: u8, to: u8, at_secs: u64,
    }

    #[event]
    struct CreatorClaimed has drop, store {
        blob_id: vector<u8>, endowment: address, owner: address, amount: u64,
    }

    #[event]
    struct EndowmentArchived has drop, store {
        blob_id: vector<u8>, endowment: address, owner: address, refunded: u64,
    }

    fun apt_metadata(): Object<Metadata> {
        object::address_to_object<Metadata>(@0xa)
    }

    fun balance_of(addr: address): u64 {
        primary_fungible_store::balance(addr, apt_metadata())
    }

    /// Creator earnings accumulate in the same fungible store as the vault, so every spending path has to net them out first.
    /// Without this a renewal would quietly pay itself with money the creator has already earned.
    fun spendable_balance(e: &Endowment, blob_addr: address): u64 {
        balance_of(blob_addr) - e.creator_claimable
    }

    /// Creates a blob's endowment and funds it with the creator's opening deposit.
    /// Everything after this point is meant to be paid for by the blob's own readers.
    public entry fun seed(
        creator: &signer,
        blob_id: vector<u8>,
        size_bytes: u64,
        expires_at_secs: u64,
        endowment_amount: u64,
        rent_bps: u64,
        creator_bps: u64,
        protocol_bps: u64,
        target_runway_secs: u64,
    ) {
        assert!(!registry::paused(), errors::paused());
        assert!(endowment_amount >= registry::min_endowment(), errors::below_min_endowment());
        assert!(target_runway_secs >= registry::renewal_lead_secs() * 2, errors::target_runway_too_low());

        // All three zero means "use the registry defaults", not an actual 0/0/0 split, which make_split would reject anyway.
        let (rb, cb, pb) = if (rent_bps == 0 && creator_bps == 0 && protocol_bps == 0) {
            registry::split_bps(&registry::default_split())
        } else {
            registry::split_bps(&registry::make_split(rent_bps, creator_bps, protocol_bps))
        };

        // Created under the registry's resource account rather than `creator`, so the object address stays a pure function of blob_id.
        // See registry::endowment_address.
        let resource_signer = registry::resource_signer();
        let constructor_ref = object::create_named_object(&resource_signer, blob_id);
        let obj_signer = object::generate_signer(&constructor_ref);
        let extend_ref = object::generate_extend_ref(&constructor_ref);
        let transfer_ref = object::generate_transfer_ref(&constructor_ref);
        let obj_addr = signer::address_of(&obj_signer);

        let fa = primary_fungible_store::withdraw(creator, apt_metadata(), endowment_amount);
        primary_fungible_store::deposit(obj_addr, fa);

        let now = timestamp::now_seconds();
        move_to(&obj_signer, Endowment {
            blob_id,
            owner: signer::address_of(creator),
            size_bytes,
            created_at_secs: now,
            expires_at_secs,
            last_renewed_at_secs: now,
            last_read_at_secs: now,
            creator_claimable: 0,
            lifetime_revenue: 0,
            lifetime_rent: 0,
            lifetime_creator: 0,
            lifetime_protocol: 0,
            lifetime_renewal_spend: 0,
            reads: 0,
            bytes_served: 0,
            renewals: 0,
            state: STATE_SEEDED,
            rent_bps: rb,
            creator_bps: cb,
            protocol_bps: pb,
            target_runway_secs,
            extend_ref,
            transfer_ref,
        });

        registry::register_blob(blob_id, obj_addr);

        event::emit(EndowmentSeeded {
            blob_id, endowment: obj_addr, owner: signer::address_of(creator),
            size_bytes, expires_at_secs, amount: endowment_amount,
        });
    }

    /// Anyone can extend anyone's blob.
    /// There is no owner check here on purpose: keeping data alive is a public good, and the payer gets nothing back for it.
    public entry fun top_up(payer: &signer, blob_addr: address, amount: u64) acquires Endowment {
        let e = borrow_global_mut<Endowment>(blob_addr);
        let fa = primary_fungible_store::withdraw(payer, apt_metadata(), amount);
        primary_fungible_store::deposit(blob_addr, fa);

        let now = timestamp::now_seconds();
        let new_runway = pricing::runway_secs(@perennial, spendable_balance(e, blob_addr), e.size_bytes);

        // Topping up during grace is the recovery path for an expired blob.
        // It only revives the blob if the money actually buys back enough runway to be worth renewing.
        if (e.state == STATE_EXPIRED) {
            assert!(now <= e.expires_at_secs + registry::grace_secs(), errors::grace_elapsed());
            if (new_runway >= registry::renewal_lead_secs()) {
                let from = e.state;
                e.state = STATE_ACTIVE;
                event::emit(StateChanged { blob_id: e.blob_id, endowment: blob_addr, from, to: STATE_ACTIVE, at_secs: now });
            };
        };

        event::emit(ToppedUp {
            blob_id: e.blob_id, endowment: blob_addr, payer: signer::address_of(payer),
            amount, new_balance: spendable_balance(e, blob_addr), new_runway_secs: new_runway,
        });
    }

    /// Books read revenue against a blob and splits it between rent, creator and protocol.
    /// The gateway is trusted to report honestly here, which is the weakest assumption in the system. See docs/THREATS.md.
    public entry fun credit(gateway: &signer, blob_addr: address, gross_amount: u64, bytes: u64, reads: u64) acquires Endowment {
        assert!(registry::is_gateway(signer::address_of(gateway)), errors::unauthorized_gateway());
        let e = borrow_global_mut<Endowment>(blob_addr);

        let runway = pricing::runway_secs(@perennial, spendable_balance(e, blob_addr), e.size_bytes);
        let starved = runway < e.target_runway_secs;

        // Below target runway the owner's configured split is overridden and the creator's cut drops to zero.
        // This is what makes an endowment self-correcting: a blob that falls behind stops paying its creator until it has caught back up.
        // rent_bps is destructured but unused on purpose, because rent is whatever survives the other two, so rounding dust falls into rent rather than out of the vault.
        let (_rent_bps, creator_bps, protocol_bps) = if (starved) {
            let p_bps = registry::protocol_bps();
            (10_000 - p_bps, 0, p_bps)
        } else {
            (e.rent_bps, e.creator_bps, e.protocol_bps)
        };

        let protocol_amt = (gross_amount * protocol_bps) / 10_000;
        let creator_amt = (gross_amount * creator_bps) / 10_000;
        let rent_amt = gross_amount - protocol_amt - creator_amt;

        // Revenue is paid from the gateway's own balance, so a gateway crediting a blob is spending real money, not minting a number.
        // That bounds the damage a compromised gateway can do, though it does not prevent misattribution. See docs/THREATS.md.
        let fa = primary_fungible_store::withdraw(gateway, apt_metadata(), gross_amount);
        if (protocol_amt > 0) {
            let protocol_fa = fungible_asset::extract(&mut fa, protocol_amt);
            primary_fungible_store::deposit(registry::treasury_addr(), protocol_fa);
        };
        // Rent and the creator's cut both land in the object's store; only `creator_claimable` distinguishes them.
        primary_fungible_store::deposit(blob_addr, fa);

        e.creator_claimable = e.creator_claimable + creator_amt;
        e.lifetime_revenue = e.lifetime_revenue + (gross_amount as u128);
        e.lifetime_rent = e.lifetime_rent + (rent_amt as u128);
        e.lifetime_creator = e.lifetime_creator + (creator_amt as u128);
        e.lifetime_protocol = e.lifetime_protocol + (protocol_amt as u128);
        e.reads = e.reads + reads;
        e.bytes_served = e.bytes_served + (bytes as u128);
        let now = timestamp::now_seconds();
        e.last_read_at_secs = now;

        if (e.state == STATE_SEEDED || e.state == STATE_DECAYING) {
            let from = e.state;
            e.state = STATE_ACTIVE;
            event::emit(StateChanged { blob_id: e.blob_id, endowment: blob_addr, from, to: STATE_ACTIVE, at_secs: now });
        };

        let new_runway = pricing::runway_secs(@perennial, spendable_balance(e, blob_addr), e.size_bytes);
        event::emit(RevenueCredited {
            blob_id: e.blob_id, endowment: blob_addr, gross: gross_amount, rent: rent_amt,
            creator: creator_amt, protocol: protocol_amt, bytes, reads, new_runway_secs: new_runway,
        });
    }

    /// Buys the blob more time out of its own vault, paying the caller a bounty for doing it.
    /// Permissionless and unscheduled: a funded blob still dies if nobody calls this before the lease lapses.
    public entry fun renew(keeper: &signer, blob_addr: address, requested_duration_secs: u64) acquires Endowment {
        let e = borrow_global_mut<Endowment>(blob_addr);
        let now = timestamp::now_seconds();

        assert!(
            e.state == STATE_ACTIVE || e.state == STATE_SEEDED || e.state == STATE_DECAYING,
            errors::wrong_state(),
        );
        assert!(now + registry::renewal_lead_secs() >= e.expires_at_secs, errors::too_early_to_renew());

        let max_period = registry::max_renewal_period_secs();
        let duration = if (requested_duration_secs > max_period) { max_period } else { requested_duration_secs };

        let cost = pricing::cost(@perennial, e.size_bytes, duration);
        // A percentage bounty on a small blob rounds down to nearly nothing, and nobody spends gas to earn nothing.
        // The floor is what keeps renewal worth calling at every blob size, since renewal only happens if someone chooses to call it.
        let bounty = {
            let b = (cost * registry::keeper_bounty_bps()) / 10_000;
            let min_b = registry::min_keeper_bounty();
            if (b < min_b) { min_b } else { b }
        };
        let total_cost = cost + bounty;

        assert!(spendable_balance(e, blob_addr) >= total_cost, errors::insufficient_balance());

        let obj_signer = object::generate_signer_for_extending(&e.extend_ref);
        let fa = primary_fungible_store::withdraw(&obj_signer, apt_metadata(), total_cost);
        let bounty_fa = fungible_asset::extract(&mut fa, bounty);
        primary_fungible_store::deposit(signer::address_of(keeper), bounty_fa);
        // `fa` now holds `cost`, which under a real integration would pay Shelby to extend the lease.
        // Shelby isn't reachable yet, so it goes to treasury instead, which keeps the accounting honest without pretending the payment happened.
        primary_fungible_store::deposit(registry::treasury_addr(), fa);

        let old_expiry = e.expires_at_secs;
        e.expires_at_secs = e.expires_at_secs + duration;
        e.last_renewed_at_secs = now;
        e.renewals = e.renewals + 1;
        e.lifetime_renewal_spend = e.lifetime_renewal_spend + (cost as u128);

        if (e.state != STATE_ACTIVE) {
            let from = e.state;
            e.state = STATE_ACTIVE;
            event::emit(StateChanged { blob_id: e.blob_id, endowment: blob_addr, from, to: STATE_ACTIVE, at_secs: now });
        };

        event::emit(Renewed {
            blob_id: e.blob_id, endowment: blob_addr, cost, bounty,
            old_expires_at_secs: old_expiry, new_expires_at_secs: e.expires_at_secs, duration_secs: duration,
        });
    }

    /// Moves a blob's lifecycle state to match what its own numbers and the clock already imply.
    /// Permissionless because it can only ever record a transition that has already happened, never cause one.
    public entry fun sweep(_anyone: &signer, blob_addr: address) acquires Endowment {
        let e = borrow_global_mut<Endowment>(blob_addr);
        let now = timestamp::now_seconds();

        // The three checks cascade on purpose, so a blob nobody has touched since well before its grace window reaches Dead in a single call.
        if (e.state == STATE_ACTIVE || e.state == STATE_SEEDED) {
            let runway = pricing::runway_secs(@perennial, spendable_balance(e, blob_addr), e.size_bytes);
            if (runway < registry::renewal_lead_secs()) {
                let from = e.state;
                e.state = STATE_DECAYING;
                event::emit(StateChanged { blob_id: e.blob_id, endowment: blob_addr, from, to: STATE_DECAYING, at_secs: now });
            };
        };

        if (
            (e.state == STATE_ACTIVE || e.state == STATE_SEEDED || e.state == STATE_DECAYING)
                && now > e.expires_at_secs
        ) {
            let from = e.state;
            e.state = STATE_EXPIRED;
            event::emit(StateChanged { blob_id: e.blob_id, endowment: blob_addr, from, to: STATE_EXPIRED, at_secs: now });
        };

        if (e.state == STATE_EXPIRED && now > e.expires_at_secs + registry::grace_secs()) {
            let from = e.state;
            e.state = STATE_DEAD;
            event::emit(StateChanged { blob_id: e.blob_id, endowment: blob_addr, from, to: STATE_DEAD, at_secs: now });
        };
    }

    /// Withdraws the creator's accumulated share.
    /// Zeroed before the transfer so a re-entrant claim would find nothing left to take.
    public entry fun claim_creator(owner: &signer, blob_addr: address) acquires Endowment {
        let e = borrow_global_mut<Endowment>(blob_addr);
        assert!(signer::address_of(owner) == e.owner, errors::not_owner());
        let amount = e.creator_claimable;
        assert!(amount > 0, errors::insufficient_balance());
        e.creator_claimable = 0;
        let obj_signer = object::generate_signer_for_extending(&e.extend_ref);
        let fa = primary_fungible_store::withdraw(&obj_signer, apt_metadata(), amount);
        primary_fungible_store::deposit(e.owner, fa);
        event::emit(CreatorClaimed { blob_id: e.blob_id, endowment: blob_addr, owner: e.owner, amount });
    }

    /// Closes the position and returns everything left.
    /// Deliberately allowed from any non-archived state, including Dead, so an owner can always recover a blob's remaining funds.
    public entry fun archive(owner: &signer, blob_addr: address) acquires Endowment {
        let e = borrow_global_mut<Endowment>(blob_addr);
        assert!(signer::address_of(owner) == e.owner, errors::not_owner());
        assert!(e.state != STATE_ARCHIVED, errors::wrong_state());
        // The full store, not `spendable_balance`: unclaimed creator earnings are refunded too, since they are owed to the same address either way.
        let balance = balance_of(blob_addr);
        e.creator_claimable = 0;
        let from = e.state;
        e.state = STATE_ARCHIVED;
        if (balance > 0) {
            let obj_signer = object::generate_signer_for_extending(&e.extend_ref);
            let fa = primary_fungible_store::withdraw(&obj_signer, apt_metadata(), balance);
            primary_fungible_store::deposit(e.owner, fa);
        };
        let now = timestamp::now_seconds();
        event::emit(StateChanged { blob_id: e.blob_id, endowment: blob_addr, from, to: STATE_ARCHIVED, at_secs: now });
        event::emit(EndowmentArchived { blob_id: e.blob_id, endowment: blob_addr, owner: e.owner, refunded: balance });
    }

    /// Only affects revenue credited after this point, never retroactively, so an owner cannot reach back for rent already banked.
    public entry fun set_split(owner: &signer, blob_addr: address, rent_bps: u64, creator_bps: u64, protocol_bps: u64) acquires Endowment {
        let e = borrow_global_mut<Endowment>(blob_addr);
        assert!(signer::address_of(owner) == e.owner, errors::not_owner());
        let (rb, cb, pb) = registry::split_bps(&registry::make_split(rent_bps, creator_bps, protocol_bps));
        e.rent_bps = rb;
        e.creator_bps = cb;
        e.protocol_bps = pb;
    }

    public entry fun set_target_runway(owner: &signer, blob_addr: address, secs: u64) acquires Endowment {
        let e = borrow_global_mut<Endowment>(blob_addr);
        assert!(signer::address_of(owner) == e.owner, errors::not_owner());
        // The floor stops an owner from setting a target so low the blob is never considered starved, which would disable the rent-first override entirely.
        assert!(secs >= registry::renewal_lead_secs() * 2, errors::target_runway_too_low());
        e.target_runway_secs = secs;
    }

    /// `balance` in the returned view is the spendable balance, with creator earnings already excluded.
    #[view]
    public fun get(blob_addr: address): EndowmentView acquires Endowment {
        let e = borrow_global<Endowment>(blob_addr);
        let vault_balance = spendable_balance(e, blob_addr);
        let runway = pricing::runway_secs(@perennial, vault_balance, e.size_bytes);
        EndowmentView {
            blob_id: e.blob_id,
            endowment: blob_addr,
            owner: e.owner,
            size_bytes: e.size_bytes,
            created_at_secs: e.created_at_secs,
            expires_at_secs: e.expires_at_secs,
            last_renewed_at_secs: e.last_renewed_at_secs,
            last_read_at_secs: e.last_read_at_secs,
            balance: vault_balance,
            creator_claimable: e.creator_claimable,
            lifetime_revenue: e.lifetime_revenue,
            lifetime_rent: e.lifetime_rent,
            lifetime_creator: e.lifetime_creator,
            lifetime_protocol: e.lifetime_protocol,
            lifetime_renewal_spend: e.lifetime_renewal_spend,
            reads: e.reads,
            bytes_served: e.bytes_served,
            renewals: e.renewals,
            state: e.state,
            rent_bps: e.rent_bps,
            creator_bps: e.creator_bps,
            protocol_bps: e.protocol_bps,
            target_runway_secs: e.target_runway_secs,
            runway_secs: runway,
        }
    }

    #[view]
    public fun get_by_blob_id(blob_id: vector<u8>): EndowmentView acquires Endowment {
        get(registry::endowment_address(blob_id))
    }

    #[view]
    public fun runway(blob_addr: address): u64 acquires Endowment {
        let e = borrow_global<Endowment>(blob_addr);
        pricing::runway_secs(@perennial, spendable_balance(e, blob_addr), e.size_bytes)
    }

    /// What a keeper polls to decide whether calling `renew` would succeed and be paid for.
    /// Prices the worst case, a full-length renewal, so a true answer stays true for any shorter duration.
    #[view]
    public fun should_renew(blob_addr: address): bool acquires Endowment {
        let e = borrow_global<Endowment>(blob_addr);
        if (!(e.state == STATE_ACTIVE || e.state == STATE_SEEDED || e.state == STATE_DECAYING)) {
            return false
        };
        let now = timestamp::now_seconds();
        if (now + registry::renewal_lead_secs() < e.expires_at_secs) {
            return false
        };
        let cost = pricing::cost(@perennial, e.size_bytes, registry::max_renewal_period_secs());
        let bounty = registry::min_keeper_bounty();
        spendable_balance(e, blob_addr) >= cost + bounty
    }

    #[view]
    public fun state(blob_addr: address): u8 acquires Endowment {
        borrow_global<Endowment>(blob_addr).state
    }
}
