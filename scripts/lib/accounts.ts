/**
 * Named local keypairs for the demo deployment: admin, gateway, keeper, creator.
 * Persisted to .aptos/keys.json so `pnpm demo` can be re-run after a devnet wipe without losing which address is which role, since only the on-chain state is disposable.
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
