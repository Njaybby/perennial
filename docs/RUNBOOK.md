# RUNBOOK

How to operate this build. See `docs/DECISIONS.md` for what's in scope and why.

## One-time setup

```
pnpm install
```

The Aptos CLI must be on PATH (used by `pnpm run deploy` to compile and publish `move/perennial`). Install it with:

```
curl -fsSL "https://aptos.dev/scripts/install_cli.py" -o install_cli.py
python3 install_cli.py
export PATH="$HOME/.local/bin:$PATH"
```

`move/perennial/Move.toml` depends on `.vendor/aptos-deps`, a hand-picked local copy of the Aptos framework sources. It's gitignored because it's large-ish and fully reproducible. Rebuild it with:

```
./scripts/vendor-framework.sh
```

Devnet's public fullnode rate-limits anonymous IPs (`40000 compute units per 300 seconds`), and on a shared connection that limit can be gone before you get through one deploy. Get a free key at [geomi.dev](https://geomi.dev) (Aptos Build, network: Devnet, no waitlist) and put it in `.env`:

```
cp .env.example .env
# edit .env, set NODE_API_KEY=aptoslabs_...
```

Every script picks it up automatically. Not required, but strongly recommended, see `docs/DECISIONS.md`.

## Deploy to Aptos devnet

```
pnpm run deploy
```

Generates, or reuses, four local keypairs (admin, gateway, keeper, creator) in `.aptos/keys.json`, funds each from the devnet faucet, compiles and publishes `move/perennial`, then calls `registry::initialize` and `pricing::init_price`. Writes `.aptos/deployment.json`: package address, role addresses, and the demo's time-compressed config constants.

Safe to re-run: keys persist, only the publish and init steps re-run. Faucet funding is best-effort, a warning, not a failure, if an account is already funded.

## Run the demo

```
pnpm demo
```

Seeds three fresh blobs (hot / warm / cold read profiles, see `scripts/lib/blobProfiles.ts`) and drives them forward for ~7.5 minutes of real devnet time, playing gateway (crediting simulated read revenue) and keeper (renewing leases, sweeping state transitions) by hand. Prints a state table every 4 ticks. By the end, the hot blob should have renewed, paid its creator, and be growing; the cold blob should have expired and, past its grace window, gone `Dead`.

To seed blobs without running the full demo loop:

```
pnpm seed
```

## Run the dashboard

```
pnpm --filter @perennial/web dev
```

Opens on `localhost:3000`. Reads `.aptos/deployment.json` and `.aptos/blobs.json` server-side (`apps/web/app/api/state/route.ts`) and polls Move view functions directly. No indexer in this build, design-only, see `docs/DECISIONS.md`. Run `pnpm run deploy` first (once), or the page shows a "no deployment found" banner.

Once deployed, the page itself has a **Run demo** button. Click it to seed three fresh blobs and drive them forward live, no terminal needed. It spawns `pnpm demo` server-side (`apps/web/app/api/demo/route.ts`) and streams its output into an activity panel while the runway meters and table update alongside it. This is what makes a good live demo: hit the button right before showing someone, and watch ~7.5 minutes of real devnet activity land in front of them instead of a static snapshot from a run that already finished.

## Reset

```
pnpm reset
```

Deletes `.aptos/` (keys, deployment record, seeded blob list) so the next `pnpm run deploy` starts clean. Mirrors what a devnet wipe does to on-chain state, since devnet wipes roughly weekly. On-chain state itself needs no separate reconstruction step in this build: there's no indexer database in front of it.

## Tests

```
pnpm test
```

Runs `packages/core`'s vitest suite: the runway, cost and split math, checked against `packages/core/fixtures/runway.json` and against the same rounding and threshold behaviour `pricing.move` and `endowment.move` implement. The two sides share fixtures rather than code, so the tests exist to catch them drifting apart.

There are no Move unit tests. `aptos move compile` is exercised directly instead, and the contracts are verified against a live devnet deployment. `aptos move test` would need the compile-only stub in `move/aptos-deps-stubs/account.move` to stop colliding with the test harness's own `Account` resource first, so it's flagged here rather than left looking like it was skipped by accident.

