/**
 * Uploads the demo blobs to the MockAdapter (standing in for Shelby, see
 * docs/DECISIONS.md) and seeds an on-chain endowment for each. Run
 * standalone (`pnpm seed`) or imported by scripts/demo.ts.
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

  // Fresh demo state: old blob addresses from a previous run aren't reachable from the newly seeded blobs.json below, so their event history is dead weight.
  // Same lifecycle as blobs.json itself.
  fs.mkdirSync(path.dirname(EVENTS_PATH), { recursive: true });
  fs.writeFileSync(EVENTS_PATH, "[]");

  const nowSecs = Math.floor(Date.now() / 1000);
  const seeded: SeededBlob[] = [];

  for (const profile of BLOB_PROFILES) {
    const bytes = new Uint8Array(profile.sizeBytes);
    crypto.getRandomValues(bytes.subarray(0, Math.min(65536, bytes.length)));
    // MockAdapter content-addresses by hash; salt with label+run time so re-runs get a fresh blobId.
    const name = `${profile.label}-${nowSecs}.bin`;

    // Must clear renewalLeadSecs (120s) with margin, see scripts/lib/env.ts.
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

    // Pure and offline, per @perennial/core's address.ts doc comment.
    // No network round trip, which also sidesteps devnet's public-IP rate limit that a `registry::endowment_address` view call would count against.
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
