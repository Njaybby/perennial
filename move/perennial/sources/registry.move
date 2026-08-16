/// Global configuration and the blob index.
/// Simplified for the 36 hour build: a single authorized gateway address, not a bonded gateway registry (that's `receipts.move` territory, design-only for now, see docs/DECISIONS.md).
/// Endowment objects are still created under a resource account, not the admin account directly, because `endowment_address` must be a pure function of `blob_id` alone.
/// Object addresses are derived from (creator_address, seed), so the "creator" of every endowment object has to be a fixed address independent of who actually calls `endowment::seed`.
module perennial::registry {
    use std::signer;
    use aptos_framework::account;
    use aptos_framework::object;
    use aptos_std::smart_table::{Self, SmartTable};
    use perennial::errors;

    friend perennial::endowment;

    const RESOURCE_SEED: vector<u8> = b"perennial_v1";

    struct Split has store, copy, drop {
        rent_bps: u64,
        creator_bps: u64,
        protocol_bps: u64,
    }

    struct Config has key {
        admin: address,
        paused: bool,
        signer_cap: account::SignerCapability,

        default_rent_bps: u64,
        default_creator_bps: u64,
        default_protocol_bps: u64,
        default_target_runway_secs: u64,
        renewal_lead_secs: u64,
        max_renewal_period_secs: u64,
        grace_secs: u64,
        min_endowment: u64,
        keeper_bounty_bps: u64,
        min_keeper_bounty: u64,
        protocol_bps: u64,

        gateway: address,
        treasury: address,

        blob_count: u64,
    }

    struct BlobIndex has key {
        by_blob: SmartTable<vector<u8>, address>,
    }

    #[event]
    struct GatewaySet has drop, store { gateway: address }

    public entry fun initialize(
        admin: &signer,
        gateway: address,
        treasury: address,
        default_rent_bps: u64,
        default_creator_bps: u64,
        default_protocol_bps: u64,
        default_target_runway_secs: u64,
        renewal_lead_secs: u64,
        max_renewal_period_secs: u64,
        grace_secs: u64,
        min_endowment: u64,
        keeper_bounty_bps: u64,
        min_keeper_bounty: u64,
        protocol_bps: u64,
    ) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<Config>(admin_addr), errors::already_initialized());
        assert!(
            default_rent_bps + default_creator_bps + default_protocol_bps == 10_000,
            errors::bad_split(),
        );

        let (_resource_signer, signer_cap) = account::create_resource_account(admin, RESOURCE_SEED);

        move_to(admin, Config {
            admin: admin_addr,
            paused: false,
            signer_cap,
            default_rent_bps,
            default_creator_bps,
            default_protocol_bps,
            default_target_runway_secs,
            renewal_lead_secs,
            max_renewal_period_secs,
            grace_secs,
            min_endowment,
            keeper_bounty_bps,
            min_keeper_bounty,
            protocol_bps,
            gateway,
            treasury,
            blob_count: 0,
        });

        move_to(admin, BlobIndex { by_blob: smart_table::new() });
    }

    public entry fun set_paused(admin: &signer, paused: bool) acquires Config {
        let cfg = borrow_global_mut<Config>(@perennial);
        assert!(signer::address_of(admin) == cfg.admin, errors::not_admin());
        cfg.paused = paused;
    }

    public entry fun set_gateway(admin: &signer, gateway: address) acquires Config {
        let cfg = borrow_global_mut<Config>(@perennial);
        assert!(signer::address_of(admin) == cfg.admin, errors::not_admin());
        cfg.gateway = gateway;
        aptos_framework::event::emit(GatewaySet { gateway });
    }

    public entry fun set_params(
        admin: &signer,
        renewal_lead_secs: u64,
        max_renewal_period_secs: u64,
        grace_secs: u64,
        min_endowment: u64,
    ) acquires Config {
        let cfg = borrow_global_mut<Config>(@perennial);
        assert!(signer::address_of(admin) == cfg.admin, errors::not_admin());
        cfg.renewal_lead_secs = renewal_lead_secs;
        cfg.max_renewal_period_secs = max_renewal_period_secs;
        cfg.grace_secs = grace_secs;
        cfg.min_endowment = min_endowment;
    }

    public(friend) fun register_blob(blob_id: vector<u8>, endowment_addr: address) acquires Config, BlobIndex {
        let cfg = borrow_global_mut<Config>(@perennial);
        cfg.blob_count = cfg.blob_count + 1;
        let idx = borrow_global_mut<BlobIndex>(@perennial);
        smart_table::add(&mut idx.by_blob, blob_id, endowment_addr);
    }

    public(friend) fun resource_signer(): signer acquires Config {
        account::create_signer_with_capability(&borrow_global<Config>(@perennial).signer_cap)
    }

    public(friend) fun is_gateway(addr: address): bool acquires Config {
        borrow_global<Config>(@perennial).gateway == addr
    }

    public(friend) fun treasury_addr(): address acquires Config {
        borrow_global<Config>(@perennial).treasury
    }

    public(friend) fun default_split(): Split acquires Config {
        let cfg = borrow_global<Config>(@perennial);
        Split { rent_bps: cfg.default_rent_bps, creator_bps: cfg.default_creator_bps, protocol_bps: cfg.default_protocol_bps }
    }

    public(friend) fun protocol_bps(): u64 acquires Config {
        borrow_global<Config>(@perennial).protocol_bps
    }

    public(friend) fun default_target_runway_secs(): u64 acquires Config {
        borrow_global<Config>(@perennial).default_target_runway_secs
    }

    public(friend) fun renewal_lead_secs(): u64 acquires Config {
        borrow_global<Config>(@perennial).renewal_lead_secs
    }

    public(friend) fun max_renewal_period_secs(): u64 acquires Config {
        borrow_global<Config>(@perennial).max_renewal_period_secs
    }

    public(friend) fun grace_secs(): u64 acquires Config {
        borrow_global<Config>(@perennial).grace_secs
    }

    public(friend) fun min_endowment(): u64 acquires Config {
        borrow_global<Config>(@perennial).min_endowment
    }

    public(friend) fun keeper_bounty_bps(): u64 acquires Config {
        borrow_global<Config>(@perennial).keeper_bounty_bps
    }

    public(friend) fun min_keeper_bounty(): u64 acquires Config {
        borrow_global<Config>(@perennial).min_keeper_bounty
    }

    public(friend) fun make_split(rent_bps: u64, creator_bps: u64, protocol_bps: u64): Split {
        assert!(rent_bps + creator_bps + protocol_bps == 10_000, errors::bad_split());
        Split { rent_bps, creator_bps, protocol_bps }
    }

    public(friend) fun split_bps(s: &Split): (u64, u64, u64) {
        (s.rent_bps, s.creator_bps, s.protocol_bps)
    }

    #[view]
    public fun endowment_address(blob_id: vector<u8>): address {
        let resource_addr = account::create_resource_address(&@perennial, RESOURCE_SEED);
        object::create_object_address(&resource_addr, blob_id)
    }

    #[view]
    public fun is_registered_gateway(addr: address): bool acquires Config {
        borrow_global<Config>(@perennial).gateway == addr
    }

    #[view]
    public fun blob_count(): u64 acquires Config {
        borrow_global<Config>(@perennial).blob_count
    }

    #[view]
    public fun paused(): bool acquires Config {
        borrow_global<Config>(@perennial).paused
    }
}
