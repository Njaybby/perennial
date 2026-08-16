/**
 * Devnet wipes roughly weekly.
 * This clears local state (accounts, deployment record, seeded blob list) so the next `pnpm run deploy && pnpm seed` starts from nothing, same as after a wipe.
 * On-chain state itself needs no reconstruction in this build.
 * There's no indexer database standing in front of it, design-only for now; the dashboard reads Move view functions directly.
 */
import fs from "node:fs";
import path from "node:path";

const AAPTOS_DIR = path.resolve(process.cwd(), ".aptos");

if (fs.existsSync(AAPTOS_DIR)) {
  fs.rmSync(AAPTOS_DIR, { recursive: true, force: true });
  console.log(`Removed ${AAPTOS_DIR}`);
} else {
  console.log("Nothing to reset.");
}
