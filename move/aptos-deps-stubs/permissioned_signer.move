/// Compile-only stub.
/// The real aptos_framework::permissioned_signer pulls in copyable_any, big_ordered_map, ordered_map, cmp and storage_slots_allocator, none of which our own code needs.
/// object.move and fungible_asset.move only call these six `public(package)` functions outside test code, and Perennial always signs with plain, non-permissioned signers, so "always behave as a master signer" is exactly correct, not just compileable.
/// This file is never deployed.
/// At publish time only move/perennial's own modules are submitted, and calls into aptos_framework resolve against the real module already on chain.
/// See docs/DECISIONS.md.
module aptos_framework::permissioned_signer {
    public(package) fun check_permission_exists<PermKey: copy + drop + store>(
        _s: &signer, _perm: PermKey
    ): bool {
        true
    }

    public(package) fun check_permission_consume<PermKey: copy + drop + store>(
        _s: &signer, _threshold: u256, _perm: PermKey
    ): bool {
        true
    }

    public(package) fun authorize_increase<PermKey: copy + drop + store>(
        _master: &signer,
        _permissioned: &signer,
        _capacity: u256,
        _perm: PermKey
    ) {}

    public(package) fun authorize_unlimited<PermKey: copy + drop + store>(
        _master: &signer,
        _permissioned: &signer,
        _perm: PermKey
    ) {}

    public(package) fun grant_unlimited_with_permissioned_signer<PermKey: copy + drop + store>(
        _permissioned: &signer,
        _perm: PermKey
    ) {}

    public(package) fun increase_limit<PermKey: copy + drop + store>(
        _permissioned: &signer,
        _capacity: u256,
        _perm: PermKey
    ) {}
}
