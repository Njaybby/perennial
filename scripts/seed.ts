/**
 * Uploads the three demo blobs to the MockAdapter and seeds an on-chain endowment for each.
 * Run on its own with `pnpm seed`, or imported by scripts/demo.ts as the first step of a full run.
 */
import fs from "node:fs";
import path from "node:path";
import { MockAdapter } from "@perennial/adapters";
import { endowmentAddress as computeEndowmentAddress } from "@perennial/core";
import { loadOrCreateAccounts } from "./lib/accounts.js";
import { BLOB_PROFILES, type BlobProfile } from "./lib/blobProfiles.js";
import { aptosClient, loadDeployment } from "./lib/env.js";
import { submit } from "./lib/entry.js";
import { appendEvent } from "./lib/eventLog.js";

const BLOBS_PATH = path.resolve(process.cwd(), ".aptos/blobs.json");
const EVENTS_PATH = path.resolve(process.cwd(), ".aptos/events.json");

export interface SeededBlob {
  label: string;
  blobIdHex: string;
  endowmentAddress: string;
  sizeBytes: number;
  profile: BlobProfile;
}

export async function seedDemoBlobs(): Promise<SeededBlob[]> {
  const deployment = loadDeployment();
  const accounts = loadOrCreateAccounts();
  const aptos = aptosClient();
  const adapter = new MockAdapter({ owner: accounts.creator.accountAddress.toString() });

  // Seeding replaces blobs.json wholesale, so any event history for the previous run's blobs is now unreachable and gets cleared with it.
  fs.mkdirSync(path.dirname(EVENTS_PATH), { recursive: true });
  fs.writeFileSync(EVENTS_PATH, "[]");

  const nowSecs = Math.floor(Date.now() / 1000);
  const seeded: SeededBlob[] = [];

  for (const profile of BLOB_PROFILES) {
    const bytes = new Uint8Array(profile.sizeBytes);
    // getRandomValues rejects requests over 65536 bytes, and the blob's contents don't matter here beyond being distinct, so only the first chunk is randomized.
    crypto.getRandomValues(bytes.subarray(0, Math.min(65536, bytes.length)));
    // MockAdapter derives the blobId from content and name, so stamping the run time keeps repeat runs from colliding with an already-seeded endowment.
    const name = `${profile.label}-${nowSecs}.bin`;

    // Opens with more runway than one renewal lead, so the first renewal is triggered by the clock rather than by the blob starting out already behind.
    const expiresAtSecs = nowSecs + 240;
    const ref = await adapter.upload(bytes, name, expiresAtSecs);
    const blobIdHex = `0x${Buffer.from(ref.blobId).toString("hex")}`;

    const hash = await submit(aptos, accounts.creator, `${deployment.packageAddress}::endowment::seed`, [
      ref.blobId,
      profile.sizeBytes,
      expiresAtSecs,
      profile.initialEndowment,
      profile.rentBps,
      profile.creatorBps,
      profile.protocolBps,
      deployment.demoConfig.defaultTargetRunwaySecs,
    ]);

    // Derived locally rather than read back from the chain, which is the whole point of the resource-account addressing in registry.move.
    const endowmentAddress = computeEndowmentAddress(deployment.packageAddress, ref.blobId);

    appendEvent({ blobAddress: endowmentAddress, type: "seed", txHash: hash, atSecs: nowSecs });

    console.log(`seeded "${profile.label}" blobId=${blobIdHex} endowment=${endowmentAddress} tx=${hash}`);
    seeded.push({ label: profile.label, blobIdHex, endowmentAddress, sizeBytes: profile.sizeBytes, profile });
  }

  fs.mkdirSync(path.dirname(BLOBS_PATH), { recursive: true });
  fs.writeFileSync(BLOBS_PATH, JSON.stringify(seeded, null, 2));
  return seeded;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoBlobs()
    .then(() => console.log("\nSaved .aptos/blobs.json"))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
