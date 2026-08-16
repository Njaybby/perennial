/**
 * Clears local state (keys, deployment record, seeded blob list) so the next deploy starts from nothing.
 * Nothing on chain needs rebuilding to match, because the dashboard reads Move view functions directly rather than a database that could drift out of sync.
 */
import fs from "node:fs";
import path from "node:path";

const APTOS_DIR = path.resolve(process.cwd(), ".aptos");

if (fs.existsSync(APTOS_DIR)) {
  fs.rmSync(APTOS_DIR, { recursive: true, force: true });
  console.log(`Removed ${APTOS_DIR}`);
} else {
  console.log("Nothing to reset.");
}
