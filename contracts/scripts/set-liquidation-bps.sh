#!/usr/bin/env bash
set -euo pipefail

export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:${PATH}"
SUI="${HOME}/.local/bin/sui"
ROOT="/mnt/c/Users/devar/Documents/leverx"

source "${ROOT}/contracts/deploy-testnet.env"

# Accept percent (e.g. 105) or raw bps (e.g. 10500).
INPUT="${1:-${LIQUIDATION_BPS:-10500}}"
if [[ "$INPUT" -le 1000 ]]; then
  LIQUIDATION_BPS=$((INPUT * 100))
else
  LIQUIDATION_BPS="$INPUT"
fi

echo "Liquidation threshold: ${LIQUIDATION_BPS} bps ($(( LIQUIDATION_BPS / 100 ))%)"
echo "Calling set_liquidation_bps_entry on registry ${LEVERX_REGISTRY_ID}..."

"$SUI" client call \
  --package "$LEVERX_PACKAGE_ID" \
  --module protocol_registry \
  --function set_liquidation_bps_entry \
  --args "$LEVERX_ADMIN_CAP_ID" "$LEVERX_REGISTRY_ID" "$LIQUIDATION_BPS" \
  --gas-budget 10000000 \
  --json > /tmp/leverx-set-liquidation-bps.json

python3 - <<'PY'
import json
from pathlib import Path

data = json.loads(Path("/tmp/leverx-set-liquidation-bps.json").read_text())
print("TX digest:", data.get("digest"))
effects = data.get("effects") or {}
print("Status:", (effects.get("status") or {}).get("status"))
PY
