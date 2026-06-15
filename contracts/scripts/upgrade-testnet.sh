#!/usr/bin/env bash
# Upgrade the published LeverX package so trade entry points link to the published
# deepbook_predict package (Move.toml → published-at), not embedded Predict types.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:${PATH}"

if [[ -x "${HOME}/.local/bin/sui" ]]; then
  SUI="${HOME}/.local/bin/sui"
elif command -v suiup >/dev/null 2>&1; then
  SUI="$(suiup which sui 2>/dev/null || true)"
fi
SUI="${SUI:-$(command -v sui)}"

if [[ -z "${SUI}" ]]; then
  echo "sui CLI not found. Install via https://docs.sui.io/guides/developer/getting-started/sui-install" >&2
  exit 1
fi

cd "$ROOT"
source "${ROOT}/deploy-testnet.env" 2>/dev/null || true

UPGRADE_CAP="${LEVERX_UPGRADE_CAP_ID:-0x388950d8934be24269fe47cfa9728f5c44c4d35fe91b4d242e64ba5e9af9dd22}"
PACKAGE_ID="${LEVERX_PACKAGE_ID:-0xe960e158acfea28447f0b9945d452ad59f8222e7a72139c1e876e26816064cc9}"
PREDICT_PKG="0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138"

echo "Using sui: $("$SUI" --version)"
echo "Active address: $("$SUI" client active-address)"
echo "Package: $PACKAGE_ID"
echo "Upgrade cap: $UPGRADE_CAP"
echo "Expected deepbook_predict package: $PREDICT_PKG"
echo

"$SUI" move build --allow-dirty

echo "Upgrading package (links trade::* to published deepbook_predict types)..."
"$SUI" client upgrade \
  --upgrade-capability "$UPGRADE_CAP" \
  --gas-budget 2000000000 \
  --json > /tmp/leverx-upgrade.json

python3 "${ROOT}/scripts/parse-publish-json.py" /tmp/leverx-upgrade.json

echo
echo "Verifying leveraged_mint_binary_market expects deepbook Predict types..."
python3 - <<'PY'
import json
import os
import urllib.request

package = os.environ.get("LEVERX_PACKAGE_ID", "0xe960e158acfea28447f0b9945d452ad59f8222e7a72139c1e876e26816064cc9")
predict_pkg = "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138"
body = json.dumps(
    {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sui_getNormalizedMoveFunction",
        "params": [package, "trade", "leveraged_mint_binary_market"],
    }
).encode()
req = urllib.request.Request(
    "https://fullnode.testnet.sui.io",
    data=body,
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(req, timeout=30) as resp:
    data = json.load(resp)
param = data["result"]["parameters"][3]
predict_addr = param.get("MutableReference", param.get("Reference", {})).get("Struct", {}).get("address")
if predict_addr != predict_pkg:
    raise SystemExit(
        f"Upgrade verification failed: trade still expects Predict from {predict_addr}, "
        f"want {predict_pkg}. Check Move.toml published-at and retry."
    )
print(f"OK — trade::leveraged_mint_binary_market uses Predict from {predict_pkg}")
print("No redeploy needed: existing registry/vault/Predict IDs stay valid.")
PY
