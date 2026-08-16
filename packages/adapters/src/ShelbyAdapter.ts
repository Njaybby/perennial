/**
 * The only place in the codebase that knows how Shelby works.
 * Everything else talks to this interface, so swapping the mock for a real implementation is a one-file change.
 *
 * Renewal is split across three methods because a storage layer can plausibly support any one of them.
 * `capabilities()` says which are real for a given backend, and the other two throw rather than silently doing something surprising.
 */

export class NotSupported extends Error {
  constructor(method: string, capability: string) {
    super(`${method} is not supported by this adapter: ${capability}`);
    this.name = "NotSupported";
  }
}

export interface BlobRef {
  /** 32 byte content commitment, used directly as the seed for the blob's endowment object address. */
  blobId: Uint8Array;
  sizeBytes: number;
  expiresAtSecs: number;
  owner: string;
}

export interface ByteRange {
  start: number;
  end: number;
}

export interface AdapterCapabilities {
  /** A native extend/renew call exists. */
  extend: boolean;
  /** Idempotent re-upload of identical bytes with a later expiry. */
  recommit: boolean;
  /** No extension at all; renewal writes a new blob and a pointer must track it. */
  successor: boolean;
}

export interface ShelbyAdapter {
  upload(bytes: Uint8Array, name: string, expiresAtSecs: number): Promise<BlobRef>;
  read(blobId: Uint8Array, range?: ByteRange): Promise<Uint8Array>;
  stat(blobId: Uint8Array): Promise<BlobRef>;

  /** Requires `extend` capability. Throws NotSupported otherwise. */
  extend(blobId: Uint8Array, newExpiresAtSecs: number): Promise<BlobRef>;

  /** Requires `recommit` capability. Idempotent re-commit of identical bytes. */
  recommit(blobId: Uint8Array, bytes: Uint8Array, newExpiresAtSecs: number): Promise<BlobRef>;

  /**
   * Requires `successor` capability. Returns a new blobId rather than extending the old one.
   * This is the awkward case: the endowment is keyed by blob id, so a successor would need the on-chain record to follow the pointer.
   */
  succeed(prevBlobId: Uint8Array, bytes: Uint8Array, newExpiresAtSecs: number): Promise<BlobRef>;

  /** What the backend would charge, as opposed to what pricing.move estimates. The two are the same today because the mock quotes the same formula. */
  quote(sizeBytes: number, durationSecs: number): Promise<bigint>;
  capabilities(): AdapterCapabilities;
}
