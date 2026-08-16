import { NextResponse } from "next/server";
import { fetchBlobSummary, loadBlobs, loadDeployment } from "../../lib/chain";

export async function GET() {
  const deployment = loadDeployment();
  const blobs = loadBlobs();

  if (!deployment || blobs.length === 0) {
    return NextResponse.json(
      { error: "No deployment/blobs found. Run `pnpm run deploy && pnpm seed` (or `pnpm demo`) from the repo root first." },
      { status: 404 },
    );
  }

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
