/**
 * Server-side chain access shared by the API routes.
 * Next.js runs with apps/web as the cwd, so .aptos/ (written by the deploy and seed scripts at the repo root) is two levels up.
 *
 * Nothing here may be imported into a client component: it reads the demo signing keys off disk.
 */
import fs from "node:fs";
import path from "node:path";
import {
  Account,
  Aptos,
  AptosConfig,
  Ed25519PrivateKey,
  type InputEntryFunctionData,
  Network,
} from "@aptos-labs/ts-sdk";

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

// Read from the repo root rather than apps/web, so the dashboard and the scripts share one key and one rate limit.
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

/**
 * Loads a demo signing key from the same .aptos/keys.json the scripts write.
 * This is what stands in for a wallet connection: the server signs on the visitor's behalf, which only works because these are throwaway devnet keys that happen to own the demo blobs.
 */
export function loadSigner(role: "admin" | "gateway" | "keeper" | "creator"): Account {
  const p = path.join(ROOT, ".aptos/keys.json");
  const keys = JSON.parse(fs.readFileSync(p, "utf8"));
  return Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(keys[role]) });
}

/** The raw shape `endowment::get` returns, before renaming. Every integer arrives as a string. */
interface RawEndowmentView {
  blob_id: string;
  owner: string;
  size_bytes: string;
  created_at_secs: string;
  expires_at_secs: string;
  last_renewed_at_secs: string;
  last_read_at_secs: string;
  state: string;
  balance: string;
  creator_claimable: string;
  lifetime_revenue: string;
  lifetime_rent: string;
  lifetime_creator: string;
  lifetime_protocol: string;
  lifetime_renewal_spend: string;
  reads: string;
  bytes_served: string;
  renewals: string;
  runway_secs: string;
  target_runway_secs: string;
  rent_bps: string;
  creator_bps: string;
  protocol_bps: string;
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
  args: InputEntryFunctionData["functionArguments"],
): Promise<string> {
  const txn = await aptos.transaction.build.simple({
    sender: signer.accountAddress,
    data: { function: fn, functionArguments: args },
  });
  const pending = await aptos.signAndSubmitTransaction({ signer, transaction: txn });
  await aptos.waitForTransaction({ transactionHash: pending.hash });
  return pending.hash;
}

/** Mirrors appendEvent in scripts/lib/eventLog.ts, kept separate so the web app doesn't reach into the scripts package for one function. */
export function appendBlobEvent(entry: { blobAddress: string; type: string; txHash: string; atSecs: number }): void {
  const p = path.join(ROOT, ".aptos/events.json");
  const events = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : [];
  events.push(entry);
  fs.writeFileSync(p, JSON.stringify(events, null, 2));
}

/** Field names are the Move struct's, so this is also where snake_case from the chain becomes camelCase for the UI. */
export async function fetchBlobSummary(packageAddress: string, endowmentAddress: string): Promise<BlobSummary> {
  // Numbers stay strings all the way to the browser: u64 and u128 values routinely exceed what a JS number holds exactly.
  const [v] = await aptos.view<[RawEndowmentView]>({
    payload: {
      function: `${packageAddress}::endowment::get`,
      functionArguments: [endowmentAddress],
    },
  });
  return {
    endowmentAddress,
    blobId: v.blob_id, // vector<u8> arrives already 0x-prefixed
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
