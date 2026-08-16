/// Compile-only stub.
/// The real aptos_framework::account pulls in ed25519/multi_ed25519/single_key/multi_key for authentication-key rotation, none of which object.move or move/perennial actually need.
/// The only non-test calls used are `create_guid` (via object.move) and the resource-account trio below, used directly by move/perennial/sources/registry.move to make endowment addresses purely derivable from a blob_id, independent of who calls `seed`.
/// This file is never deployed.
/// At publish time only move/perennial's own modules are submitted, and calls into aptos_framework resolve against the real module already on chain.
/// See docs/DECISIONS.md.
module aptos_framework::account {
    use std::signer;
    use aptos_framework::create_signer;
    use aptos_framework::guid;

    struct Account has key {
        guid_creation_num: u64,
    }

    struct SignerCapability has drop, store {
        account: address,
    }

    public fun create_guid(account_signer: &signer): guid::GUID acquires Account {
        let addr = signer::address_of(account_signer);
        if (!exists<Account>(addr)) {
            move_to(account_signer, Account { guid_creation_num: 0 });
        };
        let account = borrow_global_mut<Account>(addr);
        let guid = guid::create(addr, &mut account.guid_creation_num);
        guid
    }

    // Body is irrelevant at runtime.
    // `registry.move`'s calls into this function resolve against the real deployed account module, not this stub.
    // Only the signature needs to match.
    public fun create_resource_address(source: &address, seed: vector<u8>): address {
        let _ = seed;
        *source
    }

    public fun create_resource_account(source: &signer, seed: vector<u8>): (signer, SignerCapability) {
        let resource_addr = create_resource_address(&signer::address_of(source), seed);
        let resource_signer = create_signer::create_signer(resource_addr);
        (resource_signer, SignerCapability { account: resource_addr })
    }

    public fun create_signer_with_capability(capability: &SignerCapability): signer {
        create_signer::create_signer(capability.account)
    }

    public fun get_signer_capability_address(capability: &SignerCapability): address {
        capability.account
    }
}
