/**
 * Deploys perennial-move to Aptos devnet.
 * Funds the demo accounts, publishes the package (shelled out to the Aptos CLI, which handles compilation and BCS-encoding far more robustly than reimplementing that in TS), then initializes `registry` and `pricing` via the TS SDK.
 *
 * Idempotent-ish: reuses .aptos/keys.json accounts across runs.
 * Devnet wipes roughly weekly, so a fresh `pnpm run deploy` must always be able to stand the whole system back up from nothing.
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { Aptos } from "@aptos-labs/ts-sdk";
import { loadOrCreateAccounts } from "./lib/accounts.js";
import { DEMO_CONFIG, aptosClient, saveDeployment } from "./lib/env.js";

const execFileAsync = promisify(execFile);

const MOVE_DIR = path.resolve(process.cwd(), "move/perennial");
// Devnet, not testnet, see the comment in scripts/lib/env.ts.
// api.devnet, not fullnode.devnet: the Aptos Build gateway that actually honors NODE_API_KEY.
const FULLNODE_URL = "https://api.devnet.aptoslabs.com/v1";
const FAUCET_URL = "https://faucet.devnet.aptoslabs.com";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Devnet's public fullnode rate-limits anonymous IPs, and the Aptos CLI itself carries no retry logic.
// Same idea as scripts/lib/entry.ts's withRetry, just wrapping the CLI's own error text instead of a typed SDK error.
async function aptosCli(args: string[], maxAttempts = 10): Promise<string> {
  let attempt = 0;
  for (;;) {
    try {
      const { stdout } = await execFileAsync("aptos", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      return stdout;
    } catch (err) {
      const text = String((err as { stdout?: string; message?: string }).stdout ?? (err as Error).message ?? "");
      attempt += 1;
      if (attempt >= maxAttempts || !text.includes("rate limit")) throw err;
      // Capped, not pure exponential: devnet's public rate limit has shown sustained contention lasting minutes, not seconds, so a few capped-length retries cover more real time than a few huge ones.
      const delayMs = Math.min(90_000, 5000 * 2 ** (attempt - 1));
      console.warn(`aptos CLI rate-limited, retrying in ${delayMs / 1000}s (attempt ${attempt}/${maxAttempts}) ...`);
      await sleep(delayMs);
    }
  }
}

async function fund(aptos: Aptos, address: string, label: string): Promise<void> {
  try {
    await aptosCli([
      "account",
      "fund-with-faucet",
      "--account",
      address,
      "--url",
      FULLNODE_URL,
      "--faucet-url",
      FAUCET_URL,
      "--amount",
      "100000000", // 1 APT
    ]);
    console.log(`funded ${label} (${address})`);
  } catch (err) {
    console.warn(`faucet funding failed for ${label} (${address}); it may already be funded. ${err}`);
  }
}

async function main() {
  const accounts = loadOrCreateAccounts();
  const aptos = aptosClient();

  console.log("Accounts:");
  for (const [role, account] of Object.entries(accounts)) {
    console.log(`  ${role}: ${account.accountAddress.toString()}`);
  }

  for (const [role, account] of Object.entries(accounts)) {
    await fund(aptos, account.accountAddress.toString(), role);
  }

  const admin = accounts.admin;
  const packageAddress = admin.accountAddress.toString();

  console.log("\nPublishing move/perennial ...");
  await aptosCli([
    "move",
    "publish",
    "--package-dir",
    MOVE_DIR,
    "--named-addresses",
    `perennial=${packageAddress}`,
    "--private-key",
    admin.privateKey.toString(),
    "--url",
    FULLNODE_URL,
    "--assume-yes",
    "--skip-fetch-latest-git-deps",
  ]);
  console.log("Published.");

  console.log("\nInitializing registry ...");
  const initRegistryTxn = await aptos.transaction.build.simple({
    sender: admin.accountAddress,
    data: {
      function: `${packageAddress}::registry::initialize`,
      functionArguments: [
        accounts.gateway.accountAddress,
        admin.accountAddress, // treasury: admin account for the demo
        7000, // default_rent_bps
        2750, // default_creator_bps
        250, // default_protocol_bps
        DEMO_CONFIG.defaultTargetRunwaySecs,
        DEMO_CONFIG.renewalLeadSecs,
        DEMO_CONFIG.maxRenewalPeriodSecs,
        DEMO_CONFIG.graceSecs,
        DEMO_CONFIG.minEndowment,
        DEMO_CONFIG.keeperBountyBps,
        DEMO_CONFIG.minKeeperBounty,
        DEMO_CONFIG.protocolBps,
      ],
    },
  });
  const registryPending = await aptos.signAndSubmitTransaction({ signer: admin, transaction: initRegistryTxn });
  await aptos.waitForTransaction({ transactionHash: registryPending.hash });
  console.log(`registry::initialize -> ${registryPending.hash}`);

  console.log("\nInitializing pricing ...");
  const initPriceTxn = await aptos.transaction.build.simple({
    sender: admin.accountAddress,
    data: {
      function: `${packageAddress}::pricing::init_price`,
      functionArguments: [
        DEMO_CONFIG.pricePerBytePerSecScaled,
        86_400, // max_staleness_secs
        2_000, // max_deviation_bps
        admin.accountAddress, // feeder
      ],
    },
  });
  const pricePending = await aptos.signAndSubmitTransaction({ signer: admin, transaction: initPriceTxn });
  await aptos.waitForTransaction({ transactionHash: pricePending.hash });
  console.log(`pricing::init_price -> ${pricePending.hash}`);

  saveDeployment({
    packageAddress,
    adminAddress: admin.accountAddress.toString(),
    gatewayAddress: accounts.gateway.accountAddress.toString(),
    keeperAddress: accounts.keeper.accountAddress.toString(),
    creatorAddress: accounts.creator.accountAddress.toString(),
    deployedAtSecs: Math.floor(Date.now() / 1000),
    demoConfig: DEMO_CONFIG,
  });

  console.log("\nDeployment saved to .aptos/deployment.json");
  console.log(`Package address: ${packageAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
