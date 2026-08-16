import fs from "node:fs";
import path from "node:path";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

// Minimal, dependency-free .env loader (no `dotenv` package needed for one key).
// Devnet's public per-IP rate limit made this necessary, see docs/DECISIONS.md.
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
 * Devnet timestamps are real wall-clock time and the chain will not fast-forward, so these are minutes, not the intended production defaults (90 days / 24h / 7d).
 * Deployment parameter only, not a protocol change.
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
  // Widened from an initial 30s/60s/40s pass, after that run showed the hot and warm blobs expiring despite large balances.
  // Devnet's public rate limit occasionally pushes a retry/backoff past a tight lead window, so a briefly rate-limited keeper misses the renewal even though the vault could easily afford it.
  // See docs/DECISIONS.md.
  renewalLeadSecs: 120,
  maxRenewalPeriodSecs: 180,
  graceSecs: 90,
  minEndowment: 200,
  defaultTargetRunwaySecs: 300,
  keeperBountyBps: 200,
  minKeeperBounty: 50,
  protocolBps: 250,
  pricePerBytePerSecScaled: "1000000000", // 1e9, tuned for a ~5000 byte demo blob; see scripts/demo.ts
};

export function aptosClient(): Aptos {
  // Devnet, not testnet.
  // Testnet's faucet now requires a browser JWT ("x-is-jwt") that no CLI/scripted flow can provide.
  // Devnet's faucet is still open.
  // NODE_API_KEY (from .env, an Aptos Build / geomi.dev key) lifts devnet's public per-IP rate limit. Optional but strongly recommended, see .env.example.
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
