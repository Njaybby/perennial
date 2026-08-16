import fs from "node:fs";
import path from "node:path";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

// Minimal .env loader rather than a dependency, since the only variable that matters here is NODE_API_KEY.
// Existing environment variables win, so an explicitly exported value isn't silently overridden by the file.
function loadEnvFile(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!(key in process.env)) {
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}
loadEnvFile();

const DEPLOYMENT_PATH = path.resolve(process.cwd(), ".aptos/deployment.json");

export interface Deployment {
  packageAddress: string;
  adminAddress: string;
  gatewayAddress: string;
  keeperAddress: string;
  creatorAddress: string;
  deployedAtSecs: number;
  demoConfig: DemoConfig;
}

/**
 * Timing for the demo deployment, in minutes rather than the intended production scale of 90 days / 24h / 7d.
 * Devnet runs on real wall-clock time and won't fast-forward, so a watchable demo needs a compressed lifecycle.
 * These are deployment parameters passed to `registry::initialize`, not protocol constants.
 */
export interface DemoConfig {
  renewalLeadSecs: number;
  maxRenewalPeriodSecs: number;
  graceSecs: number;
  minEndowment: number;
  defaultTargetRunwaySecs: number;
  keeperBountyBps: number;
  minKeeperBounty: number;
  protocolBps: number;
  pricePerBytePerSecScaled: string; // bigint as string
}

export const DEMO_CONFIG: DemoConfig = {
  // The renewal lead has to comfortably exceed how long a rate-limited retry can stall.
  // At 30s a backed-off keeper missed the window entirely and well-funded blobs expired anyway, which says more about the keeper than the design, but it kills a demo either way.
  renewalLeadSecs: 120,
  maxRenewalPeriodSecs: 180,
  graceSecs: 90,
  minEndowment: 200,
  defaultTargetRunwaySecs: 300,
  keeperBountyBps: 200,
  minKeeperBounty: 50,
  protocolBps: 250,
  // Scaled by pricing.move's PRICE_SCALE of 1e12, so this is 0.001 octa per byte per second.
  // Chosen so a 5000 byte demo blob burns at a rate the eye can follow over a few minutes.
  pricePerBytePerSecScaled: "1000000000",
};

/**
 * Devnet rather than testnet: testnet's faucet now requires a browser-issued JWT no script can produce, while devnet's is still open.
 * NODE_API_KEY is optional but strongly recommended, since it lifts the public per-IP rate limit that otherwise interrupts a demo run.
 */
export function aptosClient(): Aptos {
  const apiKey = process.env.NODE_API_KEY;
  const config = new AptosConfig({
    network: Network.DEVNET,
    clientConfig: apiKey ? { API_KEY: apiKey } : undefined,
  });
  return new Aptos(config);
}

export function saveDeployment(d: Deployment): void {
  fs.mkdirSync(path.dirname(DEPLOYMENT_PATH), { recursive: true });
  fs.writeFileSync(DEPLOYMENT_PATH, JSON.stringify(d, null, 2));
}

export function loadDeployment(): Deployment {
  if (!fs.existsSync(DEPLOYMENT_PATH)) {
    throw new Error(`No deployment found at ${DEPLOYMENT_PATH}. Run \`pnpm run deploy\` first.`);
  }
  return JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
}
