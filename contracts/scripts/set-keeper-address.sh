#!/usr/bin/env bash
set -euo pipefail

export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:${PATH}"
SUI="${HOME}/.local/bin/sui"
ROOT="/mnt/c/Users/devar/Documents/leverx"

source "${ROOT}/contracts/deploy-testnet.env"

KEEPER_ADDR="${1:-${KEEPER_ADDRESS:-}}"
if [[ -z "${KEEPER_ADDR}" ]]; then
  echo "Usage: $0 <keeper-address>" >&2
  echo "   or: KEEPER_ADDRESS=0x... $0" >&2
  exit 1
fi

echo "Keeper address: ${KEEPER_ADDR}"
echo "Calling set_keeper_address_entry on registry ${LEVERX_REGISTRY_ID}..."

"$SUI" client call \
  --package "$LEVERX_PACKAGE_ID" \
  --module protocol_registry \
  --function set_keeper_address_entry \
  --args "$LEVERX_ADMIN_CAP_ID" "$LEVERX_REGISTRY_ID" "$KEEPER_ADDR" \
  --gas-budget 10000000 \
  --json > /tmp/leverx-set-keeper.json

python3 - <<'PY'
import json
from pathlib import Path

data = json.loads(Path("/tmp/leverx-set-keeper.json").read_text())
print("TX digest:", data.get("digest"))
effects = data.get("effects") or {}
print("Status:", (effects.get("status") or {}).get("status"))
PY
