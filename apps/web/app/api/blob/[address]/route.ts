import { NextResponse } from "next/server";
import { aptos, fetchBlobSummary, loadBlobs, loadDeployment, ROOT } from "../../../lib/chain";
import fs from "node:fs";
import path from "node:path";

interface BlobEvent {
  blobAddress: string;
  type: "seed" | "credit" | "renew" | "top_up" | "claim" | "archive";
  txHash: string;
  atSecs: number;
}

/** Move event payloads arrive as flat records of strings, since u64 and u128 fields are serialized rather than narrowed to JS numbers. */
type MoveEventData = Record<string, string>;

/** Which emitted event carries the interesting numbers for each kind of logged activity. */
const EVENT_STRUCT_BY_TYPE: Record<BlobEvent["type"], string> = {
  seed: "EndowmentSeeded",
  credit: "RevenueCredited",
  renew: "Renewed",
  top_up: "ToppedUp",
  claim: "CreatorClaimed",
  archive: "EndowmentArchived",
};

function loadEventsFor(address: string): BlobEvent[] {
  const p = path.join(ROOT, ".aptos/events.json");
  if (!fs.existsSync(p)) return [];
  const all: BlobEvent[] = JSON.parse(fs.readFileSync(p, "utf8"));
  return all.filter((e) => e.blobAddress.toLowerCase() === address.toLowerCase()).sort((a, b) => a.atSecs - b.atSecs);
}

function findEventData(txEvents: { type: string; data: MoveEventData }[], suffix: string): MoveEventData | null {
  const match = txEvents.find((e) => e.type.endsWith(`::${suffix}`));
  return match ? match.data : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const deployment = loadDeployment();
  if (!deployment) {
    return NextResponse.json({ error: "No deployment found. Run `pnpm run deploy` first." }, { status: 404 });
  }

  const blobs = loadBlobs();
  const tracked = blobs.find((b) => b.endowmentAddress.toLowerCase() === address.toLowerCase());

  let summary;
  try {
    summary = await fetchBlobSummary(deployment.packageAddress, address);
  } catch (err) {
    return NextResponse.json({ error: `No endowment found at ${address}: ${String(err)}` }, { status: 404 });
  }

  const logEntries = loadEventsFor(address);

  // Each transaction already carries its own emitted events.
  // Fetching by hash reads directly off the fullnode and doesn't depend on the deprecated Events v1 indexer table.
  // See scripts/lib/eventLog.ts.
  const enriched = await Promise.all(
    logEntries.map(async (entry) => {
      try {
        const txn = await aptos.getTransactionByHash({ transactionHash: entry.txHash });
        // Only committed user transactions carry events; anything else legitimately has none.
        const events = ("events" in txn ? txn.events : []) as { type: string; data: MoveEventData }[];
        const data = findEventData(events, EVENT_STRUCT_BY_TYPE[entry.type]);
        return { ...entry, data, success: "success" in txn ? txn.success : null };
      } catch {
        // A hash that no longer resolves (a devnet wipe, most likely) shouldn't take down the whole ledger view.
        return { ...entry, data: null, success: null };
      }
    }),
  );

  return NextResponse.json({
    label: tracked?.label ?? null,
    packageAddress: deployment.packageAddress,
    summary,
    events: enriched,
  });
}
