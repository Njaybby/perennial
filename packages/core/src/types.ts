/** Shared types for the endowment lifecycle and revenue split, mirroring the shapes the Move modules return. */
export type BlobIdHex = `0x${string}`;

/** Order is load-bearing: each index is the `u8` state code the contract stores, so entries can be appended but never reordered. */
export const LIFECYCLE_STATES = [
  "Seeded",
  "Active",
  "Decaying",
  "Expired",
  "Dead",
  "Archived",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export function stateFromCode(code: number): LifecycleState {
  const s = LIFECYCLE_STATES[code];
  if (!s) throw new Error(`unknown endowment state code: ${code}`);
  return s;
}

export interface Split {
  rentBps: bigint;
  creatorBps: bigint;
  protocolBps: bigint;
}

export function assertValidSplit(split: Split): void {
  const total = split.rentBps + split.creatorBps + split.protocolBps;
  if (total !== 10_000n) {
    throw new Error(`split must sum to 10000 bps, got ${total}`);
  }
}

/**
 * Mirrors endowment::EndowmentView.
 * `balance` is spendable only, with creator earnings already netted out, same as the contract reports it.
 */
export interface EndowmentView {
  blobId: BlobIdHex;
  endowment: string;
  owner: string;
  sizeBytes: bigint;
  createdAtSecs: bigint;
  expiresAtSecs: bigint;
  lastRenewedAtSecs: bigint;
  lastReadAtSecs: bigint;
  balance: bigint;
  creatorClaimable: bigint;
  lifetimeRevenue: bigint;
  lifetimeRent: bigint;
  lifetimeCreator: bigint;
  lifetimeProtocol: bigint;
  lifetimeRenewalSpend: bigint;
  reads: bigint;
  bytesServed: bigint;
  renewals: bigint;
  state: LifecycleState;
  rentBps: bigint;
  creatorBps: bigint;
  protocolBps: bigint;
  targetRunwaySecs: bigint;
  runwaySecs: bigint;
}
