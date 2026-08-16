import { NextResponse } from "next/server";
import { appendBlobEvent, loadDeployment, loadSigner, submitEntry } from "../../../lib/chain";

/**
 * `top_up` is genuinely permissionless on chain: anyone can call it.
 * This build has no wallet connection, so the server signs with the admin demo key as a stand-in for "anyone" rather than the visiting browser's own wallet.
 * The important part, that the Move contract itself places no restriction on the caller, is real.
 */
export async function POST(req: Request) {
  const { address, amount } = await req.json();
  if (typeof address !== "string" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "address and a positive amount are required" }, { status: 400 });
  }

  const deployment = loadDeployment();
  if (!deployment) return NextResponse.json({ error: "No deployment found" }, { status: 404 });

  try {
    const admin = loadSigner("admin");
    const hash = await submitEntry(admin, `${deployment.packageAddress}::endowment::top_up`, [address, Math.floor(amount)]);
    appendBlobEvent({ blobAddress: address, type: "top_up", txHash: hash, atSecs: Math.floor(Date.now() / 1000) });
    return NextResponse.json({ txHash: hash });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
