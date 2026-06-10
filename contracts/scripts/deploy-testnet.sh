#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/devarogundade/.local/bin:${PATH}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT}"

DEPLOY_ENV="${ROOT}/deploy-testnet.env"
if [[ -f "${DEPLOY_ENV}" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${DEPLOY_ENV}"
  set +a
fi
source /tmp/leverx-deploy.env 2>/dev/null || true

PACKAGE_ID="${LEVERX_PACKAGE_ID:?LEVERX_PACKAGE_ID missing — run publish-testnet.sh first}"
ADMIN_CAP="${LEVERX_ADMIN_CAP_ID:?LEVERX_ADMIN_CAP_ID missing}"
TREASURY_CAP="${LEVERX_TREASURY_CAP_ID:?LEVERX_TREASURY_CAP_ID missing — republish with lxplp::init}"
PREDICT_ID="${PREDICT_ID:?PREDICT_ID missing in deploy-testnet.env}"
QUOTE_TYPE="${QUOTE_TYPE:?QUOTE_TYPE missing in deploy-testnet.env}"

echo "Deploying shared objects..."
echo "  package=$PACKAGE_ID"
echo "  admin=$ADMIN_CAP"
echo "  treasury=$TREASURY_CAP"
echo "  predict=$PREDICT_ID"

sui client call \
  --package "$PACKAGE_ID" \
  --module deploy \
  --function deploy_and_share \
  --type-args "$QUOTE_TYPE" \
  --args "$ADMIN_CAP" "$TREASURY_CAP" "$PREDICT_ID" \
  --gas-budget 200000000 \
  --json > /tmp/leverx-deploy-tx.json

python3 /mnt/c/Users/devar/Documents/leverx/contracts/scripts/parse-publish-json.py /tmp/leverx-deploy-tx.json

# Merge into deploy env
python3 - <<'PY'
from pathlib import Path
publish = Path("/tmp/leverx-deploy.env")
deploy = Path("/tmp/leverx-deploy-tx-parsed.env")
out = Path("/tmp/leverx-deploy.env")
lines = {}
if publish.exists():
    for line in publish.read_text().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            lines[k] = v
if deploy.exists():
    for line in deploy.read_text().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            lines[k] = v
out.write_text("\n".join(f"{k}={v}" for k, v in lines.items()) + "\n")
print(out.read_text())
PY
