export type BlobIdHex = `0x${string}`;

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

/** Mirrors endowment::EndowmentView in move/perennial/sources/endowment.move. */
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

/**
 * DOMAIN = "PERENNIAL_READ_RECEIPT_V1"
 * Types defined for forward compatibility with the receipt, Merkle and fraud-proof layer, design only in this build.
 */
export const RECEIPT_DOMAIN = "PERENNIAL_READ_RECEIPT_V1";

export interface ReadReceiptFields {
  chainId: number;
  gatewayAddr: Uint8Array; // 32 bytes
  blobId: Uint8Array; // 32 bytes
  epoch: bigint;
  seq: bigint;
  bytesServed: bigint;
  amount: bigint;
  readerPubkey: Uint8Array; // 32 bytes
}
