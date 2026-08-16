/// The heart of the system, one object per blob, holding a vault funded by read revenue that pays for its own lease renewal.
/// Simplified for the 36 hour build per docs/DECISIONS.md.
/// `credit` stands in for what `receipts::finalize_epoch` would do once the Merkle/fraud-proof epoch pipeline exists (design only for now).
/// It is gated to a single registered gateway address.
/// `renew` is self-contained on Aptos.
/// It debits the vault and advances `expires_at_secs` directly, standing in for the atomic inline call into Shelby's payment function that a real integration would make, which isn't reachable yet.
/// The settlement asset is APT, via its paired fungible asset at 0xA, standing in for ShelbyUSD until that FA address is known.
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

    fun spendable_balance(e: &Endowment, blob_addr: address): u64 {
        balance_of(blob_addr) - e.creator_claimable
    }

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

        let (rb, cb, pb) = if (rent_bps == 0 && creator_bps == 0 && protocol_bps == 0) {
            registry::split_bps(&registry::default_split())
        } else {
            registry::split_bps(&registry::make_split(rent_bps, creator_bps, protocol_bps))
        };

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

    public entry fun top_up(payer: &signer, blob_addr: address, amount: u64) acquires Endowment {
        let e = borrow_global_mut<Endowment>(blob_addr);
        let fa = primary_fungible_store::withdraw(payer, apt_metadata(), amount);
        primary_fungible_store::deposit(blob_addr, fa);

        let now = timestamp::now_seconds();
        let new_runway = pricing::runway_secs(@perennial, spendable_balance(e, blob_addr), e.size_bytes);

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

    public entry fun credit(gateway: &signer, blob_addr: address, gross_amount: u64, bytes: u64, reads: u64) acquires Endowment {
        assert!(registry::is_gateway(signer::address_of(gateway)), errors::unauthorized_gateway());
        let e = borrow_global_mut<Endowment>(blob_addr);

        let runway = pricing::runway_secs(@perennial, spendable_balance(e, blob_addr), e.size_bytes);
        let starved = runway < e.target_runway_secs;

        // rent_bps is intentionally unused.
        // Rent is whatever's left after protocol and creator are taken, so dust rounds into rent, never out.
        let (_rent_bps, creator_bps, protocol_bps) = if (starved) {
            let p_bps = registry::protocol_bps();
            (10_000 - p_bps, 0, p_bps)
        } else {
            (e.rent_bps, e.creator_bps, e.protocol_bps)
        };

        let protocol_amt = (gross_amount * protocol_bps) / 10_000;
        let creator_amt = (gross_amount * creator_bps) / 10_000;
        let rent_amt = gross_amount - protocol_amt - creator_amt;

        let fa = primary_fungible_store::withdraw(gateway, apt_metadata(), gross_amount);
        if (protocol_amt > 0) {
            let protocol_fa = fungible_asset::extract(&mut fa, protocol_amt);
            primary_fungible_store::deposit(registry::treasury_addr(), protocol_fa);
        };
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
        // `fa` now holds `cost`, the payment that would go to Shelby's lease extension.
        // Shelby isn't reachable yet, so it's routed to treasury rather than burned.
        // See module doc comment.
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

    public entry fun sweep(_anyone: &signer, blob_addr: address) acquires Endowment {
        let e = borrow_global_mut<Endowment>(blob_addr);
        let now = timestamp::now_seconds();

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

    public entry fun archive(owner: &signer, blob_addr: address) acquires Endowment {
        let e = borrow_global_mut<Endowment>(blob_addr);
        assert!(signer::address_of(owner) == e.owner, errors::not_owner());
        assert!(e.state != STATE_ARCHIVED, errors::wrong_state());
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
        assert!(secs >= registry::renewal_lead_secs() * 2, errors::target_runway_too_low());
        e.target_runway_secs = secs;
    }

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
