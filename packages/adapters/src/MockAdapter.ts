/**
 * In-memory ShelbyAdapter, and what the system develops and demos against until real Shelby access exists.
 *
 * Blobs live for the lifetime of the process only.
 * That is fine for the demo, where what matters on chain is the blob id, and the endowment keyed to it outlives any local copy of the bytes.
 *
 * Latency and failure injection are here so callers can be exercised against a backend that misbehaves, since a real one eventually will.
 */
import { createHash } from "node:crypto";
import type { AdapterCapabilities, BlobRef, ByteRange, ShelbyAdapter } from "./ShelbyAdapter.js";

interface StoredBlob {
  bytes: Uint8Array;
  expiresAtSecs: number;
  owner: string;
}

export interface MockAdapterOptions {
  /** Simulated network latency per call, in milliseconds. Default 0. */
  latencyMs?: number;
  /** Probability in [0, 1] that any given call throws. Default 0. */
  failureRate?: number;
  /** Fixed-point price per byte per second, scaled by 1e12. The default is nominal, not a real Shelby quote. */
  pricePerBytePerSecScaled?: bigint;
  /** Address recorded as the blob owner. Callers that intend to seed an endowment should pass a real one. */
  owner?: string;
}

const PRICE_SCALE = 1_000_000_000_000n;

export class MockAdapter implements ShelbyAdapter {
  private readonly blobs = new Map<string, StoredBlob>();
  private readonly latencyMs: number;
  private readonly failureRate: number;
  private readonly pricePerBytePerSecScaled: bigint;
  private readonly defaultOwner: string;

  constructor(opts: MockAdapterOptions = {}) {
    this.latencyMs = opts.latencyMs ?? 0;
    this.failureRate = opts.failureRate ?? 0;
    this.pricePerBytePerSecScaled = opts.pricePerBytePerSecScaled ?? 1000n;
    this.defaultOwner = opts.owner ?? "0xmock";
  }

  private async simulate(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
    if (this.failureRate > 0 && Math.random() < this.failureRate) {
      throw new Error("MockAdapter: injected failure");
    }
  }

  /** Content-addressed, but salted by name so two blobs with identical bytes stay distinguishable. */
  private static idFor(bytes: Uint8Array, salt: string): Uint8Array {
    const hash = createHash("sha3-256");
    hash.update(salt);
    hash.update(bytes);
    return new Uint8Array(hash.digest());
  }

  private static hex(id: Uint8Array): string {
    return Buffer.from(id).toString("hex");
  }

  async upload(bytes: Uint8Array, name: string, expiresAtSecs: number): Promise<BlobRef> {
    await this.simulate();
    const blobId = MockAdapter.idFor(bytes, name);
    const key = MockAdapter.hex(blobId);
    this.blobs.set(key, { bytes, expiresAtSecs, owner: this.defaultOwner });
    return { blobId, sizeBytes: bytes.length, expiresAtSecs, owner: this.defaultOwner };
  }

  async read(blobId: Uint8Array, range?: ByteRange): Promise<Uint8Array> {
    await this.simulate();
    const stored = this.blobs.get(MockAdapter.hex(blobId));
    if (!stored) throw new Error(`MockAdapter: unknown blobId ${MockAdapter.hex(blobId)}`);
    if (!range) return stored.bytes;
    return stored.bytes.slice(range.start, range.end);
  }

  async stat(blobId: Uint8Array): Promise<BlobRef> {
    await this.simulate();
    const stored = this.blobs.get(MockAdapter.hex(blobId));
    if (!stored) throw new Error(`MockAdapter: unknown blobId ${MockAdapter.hex(blobId)}`);
    return { blobId, sizeBytes: stored.bytes.length, expiresAtSecs: stored.expiresAtSecs, owner: stored.owner };
  }

  async extend(blobId: Uint8Array, newExpiresAtSecs: number): Promise<BlobRef> {
    await this.simulate();
    const key = MockAdapter.hex(blobId);
    const stored = this.blobs.get(key);
    if (!stored) throw new Error(`MockAdapter: unknown blobId ${key}`);
    stored.expiresAtSecs = newExpiresAtSecs;
    return { blobId, sizeBytes: stored.bytes.length, expiresAtSecs: newExpiresAtSecs, owner: stored.owner };
  }

  async recommit(blobId: Uint8Array, bytes: Uint8Array, newExpiresAtSecs: number): Promise<BlobRef> {
    await this.simulate();
    const key = MockAdapter.hex(blobId);
    const stored = this.blobs.get(key);
    if (!stored) throw new Error(`MockAdapter: unknown blobId ${key}`);
    stored.bytes = bytes;
    stored.expiresAtSecs = newExpiresAtSecs;
    return { blobId, sizeBytes: bytes.length, expiresAtSecs: newExpiresAtSecs, owner: stored.owner };
  }

  async succeed(prevBlobId: Uint8Array, bytes: Uint8Array, newExpiresAtSecs: number): Promise<BlobRef> {
    await this.simulate();
    const prevKey = MockAdapter.hex(prevBlobId);
    const prev = this.blobs.get(prevKey);
    const owner = prev?.owner ?? this.defaultOwner;
    const newId = MockAdapter.idFor(bytes, `${prevKey}:succ:${Date.now()}`);
    this.blobs.set(MockAdapter.hex(newId), { bytes, expiresAtSecs: newExpiresAtSecs, owner });
    return { blobId: newId, sizeBytes: bytes.length, expiresAtSecs: newExpiresAtSecs, owner };
  }

  async quote(sizeBytes: number, durationSecs: number): Promise<bigint> {
    await this.simulate();
    const numerator = BigInt(sizeBytes) * BigInt(durationSecs) * this.pricePerBytePerSecScaled;
    return (numerator + PRICE_SCALE - 1n) / PRICE_SCALE;
  }

  /** Deliberately permissive so all three renewal paths stay exercisable. A real backend would support one and reject the rest. */
  capabilities(): AdapterCapabilities {
    return { extend: true, recommit: true, successor: true };
  }
}
