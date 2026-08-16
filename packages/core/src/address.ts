/**
 * Deterministic endowment address derivation.
 * Mirrors registry::endowment_address, which derives via a resource account rather than the package address directly.
 * Endowment objects are created under a resource account (seed `RESOURCE_SEED` below), not the admin account, because the object's creator address has to be fixed and independent of who actually calls `endowment::seed`.
 * See the module doc comment on move/perennial/sources/registry.move.
 * Pure and offline, no network round trip needed.
 */
import { AccountAddress, createObjectAddress, createResourceAddress } from "@aptos-labs/ts-sdk";

const RESOURCE_SEED = new TextEncoder().encode("perennial_v1");

export function endowmentAddress(packageAddress: string, blobId: Uint8Array): string {
  const resourceAddress = createResourceAddress(AccountAddress.fromString(packageAddress), RESOURCE_SEED);
  return createObjectAddress(resourceAddress, blobId).toString();
}
