import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Runs `pnpm demo` as a detached background process so the dashboard can drive a live run.
 * The demo takes about seven and a half minutes, far longer than any request should stay open, so progress is tracked through a pid file and a log file rather than a held connection.
 */
const ROOT = path.resolve(process.cwd(), "../..");
const PID_PATH = path.join(ROOT, ".aptos/demo-run.pid");
const LOG_PATH = path.join(ROOT, ".aptos/demo-run.log");

function isRunning(pid: number): boolean {
  try {
    // Signal 0 doesn't kill anything, it just checks the process exists.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Returns null for a stale pid file too, so a crashed or killed run doesn't block the next one forever. */
function currentPid(): number | null {
  if (!fs.existsSync(PID_PATH)) return null;
  const pid = Number(fs.readFileSync(PID_PATH, "utf8").trim());
  if (!Number.isFinite(pid) || !isRunning(pid)) return null;
  return pid;
}

// Strips the noisy per-call SDK notice so the activity feed reads like scripts/demo.ts's own console output, not a wall of repeated warnings.
function cleanLog(raw: string): string {
  return raw
    .split("\n")
    .filter((line) => !line.includes("[Aptos SDK] It is recommended"))
    .join("\n");
}

export async function GET() {
  const pid = currentPid();
  const log = fs.existsSync(LOG_PATH) ? cleanLog(fs.readFileSync(LOG_PATH, "utf8")) : "";
  return NextResponse.json({ running: pid !== null, log });
}

export async function POST() {
  if (currentPid() !== null) {
    return NextResponse.json({ error: "A demo run is already in progress." }, { status: 409 });
  }

  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  const logFd = fs.openSync(LOG_PATH, "w");

  // Detached and unref'd so the run survives this request, and in dev, a hot reload of the route that started it.
  const child = spawn("pnpm", ["demo"], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  fs.closeSync(logFd);

  if (child.pid) {
    fs.writeFileSync(PID_PATH, String(child.pid));
  }

  return NextResponse.json({ started: true, pid: child.pid });
}
