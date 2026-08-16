/**
 * Runway and split math.
 * Must mirror move/perennial/sources/pricing.move and the split logic in move/perennial/sources/endowment.move exactly, since this is the number the whole product is about, and divergence between the two implementations is the most likely source of a silent bug.
 * See fixtures/runway.json for shared test vectors.
 */
import type { Split } from "./types.js";

export const PRICE_SCALE = 1_000_000_000_000n;
export const MAX_U64 = 18446744073709551615n;

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

/** Fixed point burn rate: octas per second, rounded up so small blobs never burn zero. */
export function burnPerSec(sizeBytes: bigint, pricePerBytePerSec: bigint): bigint {
  const burn = ceilDiv(sizeBytes * pricePerBytePerSec, PRICE_SCALE);
  return burn > MAX_U64 ? MAX_U64 : burn;
}

/** Rounds up. Matches pricing::cost. */
export function cost(sizeBytes: bigint, durationSecs: bigint, pricePerBytePerSec: bigint): bigint {
  const numerator = sizeBytes * durationSecs * pricePerBytePerSec;
  const c = ceilDiv(numerator, PRICE_SCALE);
  return c > MAX_U64 ? MAX_U64 : c;
}

export function costWithCap(
  sizeBytes: bigint,
  durationSecs: bigint,
  pricePerBytePerSec: bigint,
  cap: bigint,
): bigint {
  const c = cost(sizeBytes, durationSecs, pricePerBytePerSec);
  return c > cap ? cap : c;
}

/** Returns MAX_U64 when burnPerSec is zero rather than dividing by zero. Matches pricing::runway_secs. */
export function runwaySecs(balance: bigint, sizeBytes: bigint, pricePerBytePerSec: bigint): bigint {
  const bps = burnPerSec(sizeBytes, pricePerBytePerSec);
  if (bps === 0n) return MAX_U64;
  return balance / bps;
}

export function runwayAt(nowSecs: bigint, balance: bigint, sizeBytes: bigint, pricePerBytePerSec: bigint): bigint {
  return nowSecs + runwaySecs(balance, sizeBytes, pricePerBytePerSec);
}

export interface SplitResolution {
  split: Split;
  starved: boolean;
}

/**
 * Rent has priority until the blob is safe.
 * Matches the waterfall in endowment::credit.
 */
export function resolveSplit(
  currentRunwaySecs: bigint,
  targetRunwaySecs: bigint,
  configuredSplit: Split,
  protocolBps: bigint,
): SplitResolution {
  const starved = currentRunwaySecs < targetRunwaySecs;
  if (starved) {
    return {
      starved,
      split: { rentBps: 10_000n - protocolBps, creatorBps: 0n, protocolBps },
    };
  }
  return { starved, split: configuredSplit };
}

export interface AppliedSplit {
  rent: bigint;
  creator: bigint;
  protocol: bigint;
}

/** Dust from integer division always goes to rent, never protocol or creator. */
export function applySplit(grossAmount: bigint, split: Split): AppliedSplit {
  const protocol = (grossAmount * split.protocolBps) / 10_000n;
  const creator = (grossAmount * split.creatorBps) / 10_000n;
  const rent = grossAmount - protocol - creator;
  return { rent, creator, protocol };
}
