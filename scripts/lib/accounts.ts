/**
 * The four throwaway devnet keypairs the demo runs as.
 * Admin owns the package and the treasury, gateway is the only address allowed to credit revenue, keeper renews leases for the bounty, and creator owns the seeded blobs.
 *
 * Persisted to .aptos/keys.json so a re-run keeps the same address in each role.
 * These fund from a public faucet and are worthless off devnet, but the file is still written owner-only.
 */
import fs from "node:fs";
import path from "node:path";
import { Account, Ed25519Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";

const KEYS_PATH = path.resolve(process.cwd(), ".aptos/keys.json");

export type Role = "admin" | "gateway" | "keeper" | "creator";

type KeyFile = Record<Role, string>;

function readKeyFile(): Partial<KeyFile> {
  if (!fs.existsSync(KEYS_PATH)) return {};
  return JSON.parse(fs.readFileSync(KEYS_PATH, "utf8"));
}

function writeKeyFile(keys: Partial<KeyFile>): void {
  fs.mkdirSync(path.dirname(KEYS_PATH), { recursive: true });
  fs.writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2), { mode: 0o600 });
}

export function loadOrCreateAccounts(): Record<Role, Ed25519Account> {
  const roles: Role[] = ["admin", "gateway", "keeper", "creator"];
  const stored = readKeyFile();
  const updated: Partial<KeyFile> = { ...stored };
  const accounts = {} as Record<Role, Ed25519Account>;

  for (const role of roles) {
    if (stored[role]) {
      accounts[role] = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(stored[role]!) });
    } else {
      const account = Account.generate();
      accounts[role] = account;
      updated[role] = account.privateKey.toString();
    }
  }

  writeKeyFile(updated);
  return accounts;
}
