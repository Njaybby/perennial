/**
 * Derives a blob's endowment address without touching the network, mirroring registry::endowment_address.
 * Objects are created under the package's resource account so the address depends only on the blob id, never on who called `endowment::seed`.
 */
import { AccountAddress, createObjectAddress, createResourceAddress } from "@aptos-labs/ts-sdk";

/** Must stay identical to RESOURCE_SEED in registry.move; changing either alone would silently derive addresses that hold nothing. */
const RESOURCE_SEED = new TextEncoder().encode("perennial_v1");

export function endowmentAddress(packageAddress: string, blobId: Uint8Array): string {
  const resourceAddress = createResourceAddress(AccountAddress.fromString(packageAddress), RESOURCE_SEED);
  return createObjectAddress(resourceAddress, blobId).toString();
}
