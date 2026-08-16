#!/usr/bin/env bash
# Re-fetches the minimal local Aptos framework dependency set used to
# compile move/perennial. See docs/DECISIONS.md "Local framework vendoring"
# for why this exists instead of a normal git Move.toml dependency.
set -euo pipefail

VENDOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.vendor/aptos-deps"
SOURCES_DIR="$VENDOR_DIR/sources"
BASE="https://raw.githubusercontent.com/aptos-labs/aptos-core/mainnet/aptos-move/framework"

mkdir -p "$SOURCES_DIR"
cd "$SOURCES_DIR"

fetch() { curl -fsS --retry 3 --retry-delay 2 --max-time 20 "$1" -o "$2" && echo "OK   $2" || echo "MISS $2"; }

# move-stdlib (std)
for f in error signer vector option bcs string hash fixed_point32 mem; do
  fetch "$BASE/move-stdlib/sources/$f.move" "$f.move"
done
fetch "$BASE/move-stdlib/sources/configs/features.move" features.move

# aptos-stdlib (aptos_std)
for f in table table_with_length type_info from_bcs simple_map math64; do
  fetch "$BASE/aptos-stdlib/sources/$f.move" "$f.move"
done
fetch "$BASE/aptos-stdlib/sources/data_structures/smart_table.move" smart_table.move
fetch "$BASE/aptos-stdlib/sources/hash.move" aptos_hash.move

# aptos-framework (aptos_framework)
for f in chain_id create_signer event timestamp fungible_asset primary_fungible_store \
         transaction_context aggregator_v2 function_info dispatchable_fungible_asset \
         system_addresses guid object; do
  fetch "$BASE/aptos-framework/sources/$f.move" "$f.move"
done
fetch "$BASE/aptos-framework/sources/aggregator/aggregator.move" aggregator.move
fetch "$BASE/aptos-framework/sources/aggregator/aggregator_factory.move" aggregator_factory.move
fetch "$BASE/aptos-framework/sources/aggregator/optional_aggregator.move" optional_aggregator.move

echo
echo "Copying hand-written compile-only stubs from move/aptos-deps-stubs/ ..."
cp "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/move/aptos-deps-stubs/"*.move "$SOURCES_DIR/"

cat > "$VENDOR_DIR/Move.toml" <<'EOF'
[package]
name = "AptosDeps"
version = "0.1.0"

[addresses]
std = "0x1"
aptos_std = "0x1"
aptos_framework = "0x1"
aptos_fungible_asset = "0xa"
core_resources = "0xa550c18"
vm_reserved = "0x0"
EOF

echo "Vendored framework sources into $SOURCES_DIR"
