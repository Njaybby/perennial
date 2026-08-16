# Perennial

Self-funding storage on Shelby. Blobs that pay their own rent from the revenue their own reads generate.

## The idea

Storage today is prepaid: you pay upfront, and if you stop paying, the data dies, regardless of whether anyone still wants it. Perennial flips that. Every stored blob gets its own on-chain endowment. Every read generates revenue, and that revenue is split three ways: rent first (so the blob renews itself), then a cut to the creator, then a cut to the protocol. A blob that gets read enough eventually earns more than its own upkeep costs and becomes self-sustaining, permanently, with no one needing to pay for it again. A blob nobody reads burns down its endowment and expires.

The split is adaptive: while a blob's runway is short, essentially all revenue goes to rent. Once it's built up a comfortable buffer, more of each read starts flowing to the creator instead. Demand doesn't just keep data alive, it eventually pays the person who put it there.

## What's actually built

This is a working proof of concept, not the full protocol:

- **`move/perennial`**, a Move package deployed live on Aptos devnet: `registry`, `pricing`, `endowment`, `errors`. Real entry points (`seed`, `credit`, `renew`, `top_up`, `sweep`, `claim_creator`, `archive`), real fungible-asset vaults, real lifecycle states (Seeded, Active, Decaying, Expired, Dead, Archived).
- **`packages/core`**, the runway and adaptive-split math, mirrored against the Move logic with shared fixtures.
- **`packages/adapters`**, a `ShelbyAdapter` interface with a `MockAdapter` standing in for Shelby, since live Shelby access wasn't available while building this. The rest of the system, contracts, math, demo, dashboard, is written against that interface either way, so one file changes when real access lands.
- **`apps/web`**, a four-page dashboard (landing, demand index, decay watch, blob detail) reading live on-chain state and driving real transactions.
- **`scripts/demo.ts`**, an end-to-end demo: seeds three blobs with different read profiles (hot, warm, cold) and runs them forward on real devnet time until one dies and one goes self-sustaining.

`docs/DECISIONS.md` has the engineering detail behind these; `docs/THREATS.md` has the threat model, including what this build doesn't defend against yet.

## Simulation / demo results

A real run against Aptos devnet, package [`0xf28fa513b658b2d0d0d725dd5f667927f933412339fa1c947ae3546f3352d4c3`](https://explorer.aptoslabs.com/account/0xf28fa513b658b2d0d0d725dd5f667927f933412339fa1c947ae3546f3352d4c3?network=devnet). Three blobs seeded with different read profiles and run forward until one dies and one goes self-sustaining.

| Blob | Reads | State at end | Renewals | Lifetime revenue | Creator claimable |
|---|---|---|---|---|---|
| **hot** | frequent | Active | 7 | 270,000 octas | 72,600 octas |
| **warm** | moderate + 1 top-up | Active | 7 | 17,600 octas | 4,180 octas |
| **cold** | none | Dead | 0 | 0 | 0 |

- **Hot**: renewed itself seven times from its own read revenue, past its original lease, with no outside funding after the initial seed. Creator claimed against it once, a real transaction.
- **Warm**: stayed alive on its own revenue plus a single permissionless top-up from an unrelated caller, the "anyone can extend any blob" mechanic.
- **Cold**: never credited a single read, so it never earned enough to fund a renewal. Its lease ran out on schedule and it went `Dead` after the grace window, with its original endowment still sitting untouched in the vault. No one paid for it, so it stopped existing.

Representative transactions (Aptos devnet explorer links):

| Blob | seed | renew | credit | top_up | claim |
|---|---|---|---|---|---|
| hot | [`0x8bf47d76…`](https://explorer.aptoslabs.com/txn/0x8bf47d7695f613777f1d18e41f4300d6abcae1a4a26d8fc4b3c745a494b39761?network=devnet) | [`0x706c29c4…`](https://explorer.aptoslabs.com/txn/0x706c29c4b475700ca8e990b42b795f0a923142ed2d2bd1270825c64238cd78c9?network=devnet) | [`0x86b3bf7a…`](https://explorer.aptoslabs.com/txn/0x86b3bf7a07e1ca54e5d2596235e652679f2fa4dae7e412989a493c5cde04318d?network=devnet) | — | [`0x63659914…`](https://explorer.aptoslabs.com/txn/0x6365991460b939804b249a490060042542266fbd2d22759fa7982fd431523b2b?network=devnet) |
| warm | [`0x725b0fe4…`](https://explorer.aptoslabs.com/txn/0x725b0fe4c4feb2ce203e6e0552ec4786c81d43ba65f3c767a373c3f6d0226f24?network=devnet) | [`0x91c6816e…`](https://explorer.aptoslabs.com/txn/0x91c6816e76d0018cdb899e3ae5c131bd7dccf6cd7886aa0333139eb85a289935?network=devnet) | [`0x2a45b25c…`](https://explorer.aptoslabs.com/txn/0x2a45b25c2e2094d539242c226b6109d345007ba2d9c998c57e000d40de3922fc?network=devnet) | [`0xf3063672…`](https://explorer.aptoslabs.com/txn/0xf30636722ee6be7bc1399973c496eed272062d6e759e65e942551ae4ae28c72d?network=devnet) | — |
| cold | [`0xb73d7ed8…`](https://explorer.aptoslabs.com/txn/0xb73d7ed87361fc46313eb79291fa0210545de17f53635d971738541098121ae7?network=devnet) | — | — | — | — |

131 transactions total across the run: 3 seeds, 112 credits, 14 renewals, 1 top-up, 1 claim, all against real Aptos devnet, none simulated locally.

The dashboard's "Run demo" button re-runs this live, seeding fresh blobs and streaming real devnet activity into the UI as it happens.

## Quickstart

```
pnpm install
pnpm run deploy   # publishes move/perennial to Aptos devnet
pnpm demo         # seeds 3 blobs, runs them forward ~7 minutes
```

Then, in another terminal:

```
pnpm --filter @perennial/web dev
```

Full instructions: `docs/RUNBOOK.md`.

## Limitations

- **No wallet connection.** Actions in the dashboard sign with demo server-side keys, not a connected browser wallet. The underlying transactions are real and unrestricted on chain; the signing UX is the part that's a stand-in.
- **Single trusted gateway.** Revenue is credited by one registered address in this build. A trust-minimised metering layer is designed but not implemented here. See `docs/THREATS.md`.
- **No real Shelby integration yet.** `renew()` and cost pricing run entirely on Aptos math today; `MockAdapter` stands in for the real Shelby calls.
- **Devnet only**, with demo timing compressed to minutes so a live run is watchable in one sitting, not the intended production defaults.

## Layout

```
move/perennial/          the Move package: registry, pricing, endowment, errors
move/aptos-deps-stubs/   hand-written compile-only framework stubs (see docs/DECISIONS.md)
packages/core/           runway + split math, shared with pricing.move via fixtures
packages/adapters/       ShelbyAdapter interface + MockAdapter
apps/web/                the dashboard: landing, demand index, decay ledger, blob detail
scripts/                 deploy, seed, demo, reset, vendor-framework
docs/                    DECISIONS, RUNBOOK, THREATS
```
