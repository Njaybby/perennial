/**
 * Shared server-side chain access for the API routes.
 * apps/web is run as the Next.js cwd, so the repo root (where scripts/deploy.ts and scripts/seed.ts write .aptos/) is two levels up. See docs/RUNBOOK.md.
 */
import fs from "node:fs";
import path from "node:path";
import { Account, Aptos, AptosConfig, Ed25519PrivateKey, Network } from "@aptos-labs/ts-sdk";

export const ROOT = path.resolve(process.cwd(), "../..");

function readRootEnvKey(name: string): string | undefined {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return undefined;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = new RegExp(`^\\s*${name}\\s*=\\s*(.*)\\s*$`).exec(line);
    if (match) return match[1].replace(/^["']|["']$/g, "");
  }
  return undefined;
}

const apiKey = process.env.NODE_API_KEY ?? readRootEnvKey("NODE_API_KEY");

// Devnet, not testnet, see scripts/lib/env.ts and docs/DECISIONS.md.
export const aptos = new Aptos(
  new AptosConfig({ network: Network.DEVNET, clientConfig: apiKey ? { API_KEY: apiKey } : undefined }),
);

export interface Deployment {
  packageAddress: string;
  adminAddress: string;
  gatewayAddress: string;
  keeperAddress: string;
  creatorAddress: string;
  deployedAtSecs: number;
  demoConfig: {
    renewalLeadSecs: number;
    maxRenewalPeriodSecs: number;
    graceSecs: number;
    minEndowment: number;
    defaultTargetRunwaySecs: number;
    keeperBountyBps: number;
    minKeeperBounty: number;
    protocolBps: number;
    pricePerBytePerSecScaled: string;
  };
}

export interface SeededBlob {
  label: string;
  blobIdHex: string;
  endowmentAddress: string;
  sizeBytes: number;
  profile: unknown;
}

export function loadDeployment(): Deployment | null {
  const p = path.join(ROOT, ".aptos/deployment.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function loadBlobs(): SeededBlob[] {
  const p = path.join(ROOT, ".aptos/blobs.json");
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** Same .aptos/keys.json scripts/lib/accounts.ts writes. Server-side only, never sent to the client. */
export function loadSigner(role: "admin" | "gateway" | "keeper" | "creator"): Account {
  const p = path.join(ROOT, ".aptos/keys.json");
  const keys = JSON.parse(fs.readFileSync(p, "utf8"));
  return Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(keys[role]) });
}

export interface BlobSummary {
  endowmentAddress: string;
  blobId: string;
  owner: string;
  sizeBytes: string;
  createdAtSecs: string;
  expiresAtSecs: string;
  lastRenewedAtSecs: string;
  lastReadAtSecs: string;
  state: number;
  balance: string;
  creatorClaimable: string;
  lifetimeRevenue: string;
  lifetimeRent: string;
  lifetimeCreator: string;
  lifetimeProtocol: string;
  lifetimeRenewalSpend: string;
  reads: string;
  bytesServed: string;
  renewals: string;
  runwaySecs: string;
  targetRunwaySecs: string;
  rentBps: number;
  creatorBps: number;
  protocolBps: number;
}

export async function submitEntry(
  signer: Account,
  fn: `${string}::${string}::${string}`,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK's InputEntryFunctionData accepts a broad set of JS-friendly arg shapes; typing this narrowly would just re-describe the SDK's own union.
  args: any[],
): Promise<string> {
  const txn = await aptos.transaction.build.simple({
    sender: signer.accountAddress,
    data: { function: fn, functionArguments: args },
  });
  const pending = await aptos.signAndSubmitTransaction({ signer, transaction: txn });
  await aptos.waitForTransaction({ transactionHash: pending.hash });
  return pending.hash;
}

export function appendBlobEvent(entry: { blobAddress: string; type: string; txHash: string; atSecs: number }): void {
  const p = path.join(ROOT, ".aptos/events.json");
  const events = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : [];
  events.push(entry);
  fs.writeFileSync(p, JSON.stringify(events, null, 2));
}

export async function fetchBlobSummary(packageAddress: string, endowmentAddress: string): Promise<BlobSummary> {
  const [v]: any[] = await aptos.view({
    payload: {
      function: `${packageAddress}::endowment::get`,
      functionArguments: [endowmentAddress],
    },
  });
  return {
    endowmentAddress,
    blobId: v.blob_id as string, // vector<u8> serializes as a 0x-prefixed hex string already
    owner: v.owner,
    sizeBytes: v.size_bytes,
    createdAtSecs: v.created_at_secs,
    expiresAtSecs: v.expires_at_secs,
    lastRenewedAtSecs: v.last_renewed_at_secs,
    lastReadAtSecs: v.last_read_at_secs,
    state: Number(v.state),
    balance: v.balance,
    creatorClaimable: v.creator_claimable,
    lifetimeRevenue: v.lifetime_revenue,
    lifetimeRent: v.lifetime_rent,
    lifetimeCreator: v.lifetime_creator,
    lifetimeProtocol: v.lifetime_protocol,
    lifetimeRenewalSpend: v.lifetime_renewal_spend,
    reads: v.reads,
    bytesServed: v.bytes_served,
    renewals: v.renewals,
    runwaySecs: v.runway_secs,
    targetRunwaySecs: v.target_runway_secs,
    rentBps: Number(v.rent_bps),
    creatorBps: Number(v.creator_bps),
    protocolBps: Number(v.protocol_bps),
  };
}
