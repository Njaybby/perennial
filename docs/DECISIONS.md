# DECISIONS

Engineering decisions made while building this, and why.

## Shelby access, and why MockAdapter exists

Live Shelby access wasn't available while building this, so a real `ShelbyAdapter` implementation isn't buildable or verifiable yet.

Everything else runs on Aptos alone, and Aptos devnet is permissionless. So the build proceeds against a `MockAdapter` behind the same `ShelbyAdapter` interface a real integration would use. `ShelbyAdapter.ts` is the only place in the codebase that knows how Shelby works; when real access lands, one file changes and nothing else needs to.

## What's built versus what isn't

Built and deployed to Aptos devnet:

- `move/perennial`: `registry`, `pricing`, `endowment`, `errors`. Entry points `seed`, `credit`, `renew`, `top_up`, `sweep`, `claim_creator`, `archive`. Real fungible-asset vaults, real lifecycle state machine.
- `packages/core`: runway and adaptive-split math, checked against the Move logic with shared fixtures.
- `packages/adapters`: the `ShelbyAdapter` interface and `MockAdapter`.
- `scripts/demo.ts`: seeds three blobs with different read profiles and drives them forward on real devnet time until one dies and one goes self-sustaining.
- `apps/web`: four pages reading live view-function state and submitting real transactions.

Not built:

- **Trust-minimised metering.** `credit` is called directly by one registered gateway address. A metering layer that would make credited revenue provable rather than trusted is designed but not implemented. `docs/THREATS.md` is explicit about what that means.
- **Gateway, keeper, indexer services.** The demo script plays gateway and keeper by hand for three blobs.
- **The Shelby call in `renew`.** `renew` debits the vault and advances `expires_at_secs` entirely on Aptos. It doesn't call out to Shelby, because Shelby isn't reachable yet.

## Local framework vendoring

`aptos move compile` needs source, not just bytecode, for every dependency to type-check against, but a `git` dependency on `aptos-core` in `Move.toml` clones the entire monorepo, which stalled badly on the connection available while building this. Individual file fetches were fast. So `.vendor/aptos-deps/` is a hand-assembled flat local package holding only the framework `.move` sources `move/perennial` actually needs, fetched individually and reproducible via `scripts/vendor-framework.sh`.

Two files in that tree are compile-only stubs rather than real framework source: `account.move` (the real one drags in ed25519/multi_ed25519/single_key/multi_key for auth-key rotation, which none of our calls touch) and `permissioned_signer.move` (the real one drags in copyable_any, big_ordered_map, ordered_map, cmp and storage_slots_allocator; the only non-test call sites in `object.move`/`fungible_asset.move` are six `public(package)` permission checks, stubbed to behave as a master signer, which is correct since Perennial never signs with a permissioned sub-signer). `friend_stubs.move` holds empty modules that other vendored files declare as `friend` but never call; Move requires a friend target to resolve even when unused.

None of this is deployed. `aptos move publish` submits only `move/perennial`'s own compiled modules, and every `aptos_framework::*` call resolves at runtime against the real modules already on devnet at `0x1`. `.vendor/` is gitignored and disposable.

## Endowment addresses need a resource account

First live seed attempt: transactions succeeded, but reading back `endowment::get` at the predicted address failed with "Failed to borrow global resource." `endowment::seed` created the object via `object::create_named_object(creator, blob_id)`, deriving the address from `(creator_address, blob_id)`, while `registry::endowment_address` computed `create_object_address(&@perennial, blob_id)`, assuming the package address as creator. The demo's `creator` account differs from `admin`, so the two diverged; the object existed, just not where the pure view function predicted.

Fix: `registry::initialize` creates a resource account and stores its `SignerCapability`. `endowment::seed` creates objects under that resource signer, so the address is independent of who calls `seed` and stays purely derivable off-chain. Verified live: the TypeScript-side derivation in `packages/core/src/address.ts` matches the real on-chain object address exactly, which also let a network round trip come out of `scripts/seed.ts`.

## Devnet, not testnet

`faucet.testnet.aptoslabs.com` returns `HTTP 500` with `Error(46): The x-is-jwt header must be present and set to 'true'`. The public testnet faucet now requires a browser-issued JWT that no CLI or script can provide. The devnet faucet is still open, so devnet is the deployment target.

## Demo timing

Real devnet timestamps are real wall-clock time and the chain will not fast-forward, so `target_runway_secs`, `renewal_lead_secs` and `grace_secs` are configured in minutes rather than the intended production defaults (90 days / 24 hours / 7 days). This is a deployment parameter, not a protocol change.

An early run used a 30 second renewal lead and hit devnet's public per-IP rate limit (`40000 compute units per 300 seconds`). Retry backoff takes real wall-clock time, which ate the entire lead window, and two comfortably funded blobs expired anyway because `renew()` wasn't called in time. That's a real property of the design rather than a bug in it: money in the vault doesn't buy time by itself, someone has to call `renew()` before the deadline. Constants were widened to give several minutes of slack, and an API key (`NODE_API_KEY`, see `.env.example`) lifts the rate limit.

## No wallet connection

`top_up`, `claim_creator` and `archive` in the dashboard are real transactions, not mocked, but signed server-side with the demo keys rather than a connected browser wallet. `top_up` is genuinely permissionless on chain regardless of who signs it. `claim_creator` and `archive` work only because the demo's `creator` key owns the demo blobs; a real deployment needs a wallet adapter for these to work for an arbitrary visitor.

## Event history without the deprecated indexer

The blob detail page's revenue chart and renewal ledger were going to read event history via `getModuleEventsByEventType`, which now returns `400 Request for Deprecated Resource: events`. Instead, `scripts/lib/eventLog.ts` keeps a local file-backed index of which transaction hashes touched which blob, and the blob detail route fetches each transaction by hash directly from the fullnode and reads the real emitted event fields off it. No dependency on any external event index.
