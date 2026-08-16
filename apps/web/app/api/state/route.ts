import { NextResponse } from "next/server";
import { fetchBlobSummary, loadBlobs, loadDeployment } from "../../lib/chain";

/**
 * Current on-chain state for every seeded blob, polled by the dashboard.
 * Read straight from Move view functions on each request, so what the page shows is the chain rather than a cache that could fall behind it.
 */
export async function GET() {
  const deployment = loadDeployment();
  const blobs = loadBlobs();

  if (!deployment || blobs.length === 0) {
    return NextResponse.json(
      { error: "No deployment/blobs found. Run `pnpm run deploy && pnpm seed` (or `pnpm demo`) from the repo root first." },
      { status: 404 },
    );
  }

  // Failures are reported per blob rather than thrown, so one unreadable endowment degrades a single row instead of blanking the dashboard.
  const results = await Promise.all(
    blobs.map(async (blob) => {
      try {
        const summary = await fetchBlobSummary(deployment.packageAddress, blob.endowmentAddress);
        return { label: blob.label, ...summary };
      } catch (err) {
        return { label: blob.label, endowmentAddress: blob.endowmentAddress, error: String(err) };
      }
    }),
  );

  return NextResponse.json({ packageAddress: deployment.packageAddress, blobs: results });
}
