/**
 * A local index of which transactions touched which blob, in order.
 * Aptos deprecated the Events v1 table this would otherwise query, so `getModuleEventsByEventType` now fails with "Request for Deprecated Resource: events".
 *
 * Stores hashes only, never amounts.
 * The blob detail route fetches each transaction from the fullnode and reads the real event fields off it, so the chain stays the only source of truth for any number the UI shows.
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
