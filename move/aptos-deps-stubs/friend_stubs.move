/// Compile-only placeholders.
/// Several vendored framework modules declare `friend` relationships with modules we don't otherwise need, such as genesis, coin and stake.
/// Move requires a friend declaration's target to resolve to some module, even one we never call into.
/// These empty stubs satisfy that without pulling in the real, much larger modules.
/// Never deployed.
/// See docs/DECISIONS.md.
module aptos_framework::genesis {}
module aptos_framework::coin {}
module aptos_framework::aptos_account {}
module aptos_framework::account_abstraction {}
module aptos_framework::multisig_account {}
module aptos_framework::reconfiguration_with_dkg {}
module aptos_framework::transaction_validation {}
module aptos_framework::stake {}
module aptos_std::any {}
module aptos_std::copyable_any {}
module aptos_std::storage_slots_allocator {}
