/**
 * Thin wrappers around the SDK for calling perennial's entry and view functions.
 * Every call goes through the same retry policy, so no caller has to remember that devnet rate-limits.
 */
import { Account, Aptos, type InputEntryFunctionData, type InputViewFunctionData } from "@aptos-labs/ts-sdk";

function isRateLimited(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Only retries 429s, so a genuine contract abort surfaces immediately instead of being retried eight times.
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 8): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt >= maxAttempts || !isRateLimited(err)) throw err;
      // Capped rather than pure exponential, since the limit clears on a rolling window measured in minutes.
      const delayMs = Math.min(60_000, 2000 * 2 ** (attempt - 1));
      await sleep(delayMs);
    }
  }
}

/** Submits and waits for the transaction, so a caller that returns has the state change already committed. */
export async function submit(
  aptos: Aptos,
  signer: Account,
  fn: `${string}::${string}::${string}`,
  args: InputEntryFunctionData["functionArguments"],
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
