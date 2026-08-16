/**
 * The only place in the codebase that knows how Shelby works.
 * Everything else, the Move package, SDK, gateway and demo script, talks to this interface.
 * When real Shelby access is available, exactly one file changes: a new adapter implementation drops in behind this same interface.
 * Nothing else in the system needs to know.
 */

export class NotSupported extends Error {
  constructor(method: string, capability: string) {
    super(`${method} is not supported by this adapter: ${capability}`);
    this.name = "NotSupported";
  }
}

export interface BlobRef {
  blobId: Uint8Array; // 32 bytes, the Shelby commitment
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

  /** Requires `successor` capability. Returns a NEW blobId; caller must update the pointer. */
  succeed(prevBlobId: Uint8Array, bytes: Uint8Array, newExpiresAtSecs: number): Promise<BlobRef>;

  quote(sizeBytes: number, durationSecs: number): Promise<bigint>;
  capabilities(): AdapterCapabilities;
}
