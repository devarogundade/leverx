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

UPGRADE_CAP="${LEVERX_UPGRADE_CAP_ID:-0x54a342e5d6107e89efce235d4781278a060821b1eefadc1fb2c81b88d60a0042}"
PACKAGE_ID="${LEVERX_PACKAGE_ID:-0x624db6bf4dd968e345a961964d25e24a965e1d5d7c60967678ef8b392744cc4f}"
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

package = os.environ.get("LEVERX_PACKAGE_ID", "0x624db6bf4dd968e345a961964d25e24a965e1d5d7c60967678ef8b392744cc4f")
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
