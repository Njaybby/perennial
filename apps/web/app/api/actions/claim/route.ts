import { NextResponse } from "next/server";
import { appendBlobEvent, loadDeployment, loadSigner, submitEntry } from "../../../lib/chain";

/**
 * `claim_creator` requires the caller to be the endowment's owner (see endowment.move).
 * This build has no wallet connection, so it only works for blobs this deployment's demo
 * `creator` account actually owns, i.e. the seeded demo blobs. See docs/DECISIONS.md.
 */
export async function POST(req: Request) {
  const { address } = await req.json();
  if (typeof address !== "string") {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  const deployment = loadDeployment();
  if (!deployment) return NextResponse.json({ error: "No deployment found" }, { status: 404 });

  try {
    const creator = loadSigner("creator");
    const hash = await submitEntry(creator, `${deployment.packageAddress}::endowment::claim_creator`, [address]);
    appendBlobEvent({ blobAddress: address, type: "claim", txHash: hash, atSecs: Math.floor(Date.now() / 1000) });
    return NextResponse.json({ txHash: hash });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
