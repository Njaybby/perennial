/**
 * Scripted end-to-end demo against live devnet.
 * Seeds three blobs with different read profiles and runs them forward until one dies and one pays for itself.
 *
 * Stands in for the two services this build doesn't have.
 * As gateway it credits simulated read revenue, as keeper it renews leases and sweeps lifecycle state.
 * Both are done by hand here on a fixed tick rather than by anything autonomous.
 *
 * Run: `pnpm demo` (after `pnpm run deploy`). Unattended, ~7.5 minutes.
 */
import { LIFECYCLE_STATES } from "@perennial/core";
import { loadOrCreateAccounts } from "./lib/accounts.js";
import { aptosClient, loadDeployment } from "./lib/env.js";
import { submit, view } from "./lib/entry.js";
import { appendEvent } from "./lib/eventLog.js";
import { seedDemoBlobs, type SeededBlob } from "./seed.js";

const TICK_MS = 5000;
// Long enough to outlast the lease and grace windows in scripts/lib/env.ts, so the cold blob actually reaches Dead before the run ends.
const TOTAL_TICKS = 90;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Past this, the value is `runway_secs`'s u64::MAX sentinel for a zero burn rate rather than a real duration. */
const EFFECTIVELY_INFINITE_SECS = 3_000_000_000n;

function fmtDuration(secs: bigint): string {
  if (secs > EFFECTIVELY_INFINITE_SECS) return "∞";
  const s = Number(secs);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${String(r).padStart(2, "0")}s`;
}


interface EndowmentSnapshot {
  balance: bigint;
  creatorClaimable: bigint;
  lifetimeRevenue: bigint;
  renewals: bigint;
  state: number;
  runwaySecs: bigint;
}

/** Every integer field comes back as a string, so each one is parsed as a bigint rather than risking precision loss on u128 totals. */
async function fetchSnapshot(aptos: ReturnType<typeof aptosClient>, packageAddress: string, endowmentAddr: string): Promise<EndowmentSnapshot> {
  const [v] = await view<[Record<string, string>]>(aptos, {
    function: `${packageAddress}::endowment::get`,
    functionArguments: [endowmentAddr],
  });
  return {
    balance: BigInt(v.balance),
    creatorClaimable: BigInt(v.creator_claimable),
    lifetimeRevenue: BigInt(v.lifetime_revenue),
    renewals: BigInt(v.renewals),
    state: Number(v.state),
    runwaySecs: BigInt(v.runway_secs),
  };
}

function logRow(blob: SeededBlob, snap: EndowmentSnapshot): void {
  console.log(
    `  ${blob.label.padEnd(5)} state=${LIFECYCLE_STATES[snap.state].padEnd(9)} ` +
      `balance=${snap.balance.toString().padStart(6)} ` +
      `runway=${fmtDuration(snap.runwaySecs).padStart(7)} ` +
      `renewals=${snap.renewals} ` +
      `revenue=${snap.lifetimeRevenue} ` +
      `creatorClaimable=${snap.creatorClaimable}`,
  );
}

async function main() {
  const deployment = loadDeployment();
  const accounts = loadOrCreateAccounts();
  const aptos = aptosClient();
  const pkg = deployment.packageAddress;

  console.log("Seeding three demo blobs (hot / warm / cold) ...\n");
  const blobs = await seedDemoBlobs();

  console.log(`\nRunning ${TOTAL_TICKS} ticks of ${TICK_MS / 1000}s (~${(TOTAL_TICKS * TICK_MS) / 60000} min) ...\n`);

  let claimedHotCreator = false;

  for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
    await sleep(TICK_MS);

    for (const blob of blobs) {
      const { creditEveryTicks, creditAmount } = blob.profile;
      if (creditEveryTicks !== null && tick % creditEveryTicks === 0) {
        try {
          // Args are (blob, gross revenue, bytes served, read count).
          // Bytes are a plausible stand-in rather than a measurement; only the revenue figure drives the economics.
          const hash = await submit(aptos, accounts.gateway, `${pkg}::endowment::credit`, [
            blob.endowmentAddress,
            creditAmount,
            creditAmount * 10,
            1,
          ]);
          appendEvent({ blobAddress: blob.endowmentAddress, type: "credit", txHash: hash, atSecs: Math.floor(Date.now() / 1000) });
        } catch (err) {
          console.log(`  [credit failed] ${blob.label}: ${(err as Error).message.split("\n")[0]}`);
        }
      }
    }

    // Demonstrates that top_up has no owner check: admin funds a blob it doesn't own, and the contract accepts it.
    if (tick === 20) {
      const warm = blobs.find((b) => b.label === "warm")!;
      const hash = await submit(aptos, accounts.admin, `${pkg}::endowment::top_up`, [warm.endowmentAddress, 300]);
      appendEvent({ blobAddress: warm.endowmentAddress, type: "top_up", txHash: hash, atSecs: Math.floor(Date.now() / 1000) });
      console.log(`  [top_up] anyone (here: admin) topped up "warm" by 300 octas`);
    }

    for (const blob of blobs) {
      try {
        await submit(aptos, accounts.keeper, `${pkg}::endowment::sweep`, [blob.endowmentAddress]);
      } catch {
        // Sweep only records transitions that already happened, so a missed call costs nothing but a later state update.
      }

      const shouldRenew = await view<[boolean]>(aptos, {
        function: `${pkg}::endowment::should_renew`,
        functionArguments: [blob.endowmentAddress],
      }).then((r) => r[0]);

      if (shouldRenew) {
        try {
          const hash = await submit(aptos, accounts.keeper, `${pkg}::endowment::renew`, [
            blob.endowmentAddress,
            deployment.demoConfig.maxRenewalPeriodSecs,
          ]);
          appendEvent({ blobAddress: blob.endowmentAddress, type: "renew", txHash: hash, atSecs: Math.floor(Date.now() / 1000) });
          console.log(`  [renew] ${blob.label} -> ${hash}`);
        } catch (err) {
          console.log(`  [renew failed] ${blob.label}: ${(err as Error).message.split("\n")[0]}`);
        }
      }
    }

    if (!claimedHotCreator) {
      const hot = blobs.find((b) => b.label === "hot")!;
      const snap = await fetchSnapshot(aptos, pkg, hot.endowmentAddress);
      if (snap.creatorClaimable > 0n) {
        const hash = await submit(aptos, accounts.creator, `${pkg}::endowment::claim_creator`, [hot.endowmentAddress]);
        appendEvent({ blobAddress: hot.endowmentAddress, type: "claim", txHash: hash, atSecs: Math.floor(Date.now() / 1000) });
        console.log(`  [claim_creator] hot's creator claimed ${snap.creatorClaimable} octas -> ${hash}`);
        claimedHotCreator = true;
      }
    }

    if (tick % 4 === 0 || tick === TOTAL_TICKS) {
      console.log(`\n-- tick ${tick}/${TOTAL_TICKS} --`);
      for (const blob of blobs) {
        const snap = await fetchSnapshot(aptos, pkg, blob.endowmentAddress);
        logRow(blob, snap);
      }
      console.log("");
    }
  }

  console.log("Demo complete. Final state:");
  for (const blob of blobs) {
    const snap = await fetchSnapshot(aptos, pkg, blob.endowmentAddress);
    logRow(blob, snap);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
