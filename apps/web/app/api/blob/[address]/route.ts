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

function loadEventsFor(address: string): BlobEvent[] {
  const p = path.join(ROOT, ".aptos/events.json");
  if (!fs.existsSync(p)) return [];
  const all: BlobEvent[] = JSON.parse(fs.readFileSync(p, "utf8"));
  return all.filter((e) => e.blobAddress.toLowerCase() === address.toLowerCase()).sort((a, b) => a.atSecs - b.atSecs);
}

function findEventData(txEvents: { type: string; data: any }[], suffix: string): any | null {
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
        const txn: any = await aptos.getTransactionByHash({ transactionHash: entry.txHash });
        const events = (txn.events ?? []) as { type: string; data: any }[];
        let data: any = null;
        if (entry.type === "seed") data = findEventData(events, "EndowmentSeeded");
        else if (entry.type === "credit") data = findEventData(events, "RevenueCredited");
        else if (entry.type === "renew") data = findEventData(events, "Renewed");
        else if (entry.type === "top_up") data = findEventData(events, "ToppedUp");
        else if (entry.type === "claim") data = findEventData(events, "CreatorClaimed");
        else if (entry.type === "archive") data = findEventData(events, "EndowmentArchived");
        return { ...entry, data, success: txn.success };
      } catch {
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
