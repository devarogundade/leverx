#!/usr/bin/env bash
set -euo pipefail

export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:${PATH}"
SUI="${HOME}/.local/bin/sui"
ROOT="/mnt/c/Users/devar/Documents/leverx"

source "${ROOT}/contracts/deploy-testnet.env"

FINAL_WINDOW_MS="${1:-${FINAL_WINDOW_MS:-1800000}}"

echo "Final window: ${FINAL_WINDOW_MS} ms ($(( FINAL_WINDOW_MS / 60000 )) minutes)"
echo "Calling set_final_window_ms_entry on registry ${LEVERX_REGISTRY_ID}..."

"$SUI" client call \
  --package "$LEVERX_PACKAGE_ID" \
  --module protocol_registry \
  --function set_final_window_ms_entry \
  --args "$LEVERX_ADMIN_CAP_ID" "$LEVERX_REGISTRY_ID" "$FINAL_WINDOW_MS" \
  --gas-budget 10000000 \
  --json > /tmp/leverx-set-final-window.json

python3 - <<'PY'
import json
from pathlib import Path

data = json.loads(Path("/tmp/leverx-set-final-window.json").read_text())
print("TX digest:", data.get("digest"))
effects = data.get("effects") or {}
print("Status:", (effects.get("status") or {}).get("status"))
PY
