/**
 * A local, file-backed index of blob activity: which transaction hashes touched which blob, in order.
 * Exists because Aptos deprecated the Events v1 indexer table this build would otherwise have queried for the blob detail page's revenue chart and renewal ledger (confirmed live: `getModuleEventsByEventType` now 400s with "Request for Deprecated Resource: events").
 * Deliberately minimal: just enough to look up "which transactions touched this blob," not a copy of the amounts.
 * The blob detail API route fetches each transaction by hash and reads the real emitted event fields from it, the fullnode's direct transaction lookup doesn't go through the deprecated indexer, so there is exactly one source of truth for amounts.
 * A real indexer is design-only in this build anyway, see docs/DECISIONS.md.
 */
import fs from "node:fs";
import path from "node:path";

const LOG_PATH = path.resolve(process.cwd(), ".aptos/events.json");

export type EventType = "seed" | "credit" | "renew" | "top_up" | "claim" | "archive";

export interface BlobEvent {
  blobAddress: string;
  type: EventType;
  txHash: string;
  atSecs: number;
}

export function appendEvent(entry: BlobEvent): void {
  const events = readAllEvents();
  events.push(entry);
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(events, null, 2));
}

export function readAllEvents(): BlobEvent[] {
  if (!fs.existsSync(LOG_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, "utf8"));
  } catch {
    return [];
  }
}

export function readEventsFor(blobAddress: string): BlobEvent[] {
  return readAllEvents()
    .filter((e) => e.blobAddress.toLowerCase() === blobAddress.toLowerCase())
    .sort((a, b) => a.atSecs - b.atSecs);
}
