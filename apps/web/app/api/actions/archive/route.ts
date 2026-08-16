import { NextResponse } from "next/server";
import { appendBlobEvent, loadDeployment, loadSigner, submitEntry } from "../../../lib/chain";

/**
 * Owner-gated on chain, same wallet caveat as the claim route.
 * Archiving is terminal and refunds the whole vault, so it's the one demo action that can't be undone by a later top up.
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
    const hash = await submitEntry(creator, `${deployment.packageAddress}::endowment::archive`, [address]);
    appendBlobEvent({ blobAddress: address, type: "archive", txHash: hash, atSecs: Math.floor(Date.now() / 1000) });
    return NextResponse.json({ txHash: hash });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
