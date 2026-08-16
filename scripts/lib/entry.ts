/** Thin helpers around the TS SDK for calling perennial's Move entry functions. */
import { Account, Aptos, InputViewFunctionData } from "@aptos-labs/ts-sdk";

function isRateLimited(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Devnet's public fullnode rate-limits anonymous IPs.
// A real keeper (apps/keeper, design-only in this build) would carry an API key and its own backoff policy.
// This is the same idea, sized for a demo script hitting three blobs every tick.
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 8): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt >= maxAttempts || !isRateLimited(err)) throw err;
      // Capped, not pure exponential: devnet's public rate limit has shown sustained contention lasting minutes, not seconds.
      const delayMs = Math.min(60_000, 2000 * 2 ** (attempt - 1));
      await sleep(delayMs);
    }
  }
}

export async function submit(
  aptos: Aptos,
  signer: Account,
  fn: `${string}::${string}::${string}`,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK's InputEntryFunctionData accepts a broad set of JS-friendly arg shapes; typing this narrowly would just re-describe the SDK's own union.
  args: any[],
): Promise<string> {
  return withRetry(async () => {
    const txn = await aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: { function: fn, functionArguments: args },
    });
    const pending = await aptos.signAndSubmitTransaction({ signer, transaction: txn });
    await aptos.waitForTransaction({ transactionHash: pending.hash });
    return pending.hash;
  });
}

export async function view<T = unknown[]>(aptos: Aptos, payload: InputViewFunctionData): Promise<T> {
  return withRetry(() => aptos.view({ payload }) as Promise<T>);
}
