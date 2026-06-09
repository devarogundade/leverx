#!/usr/bin/env bash
set -euo pipefail

ROOT="/mnt/c/Users/devar/Documents/leverx/contracts"
export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:${PATH}"

# Prefer suiup-managed sui (toolchain 1.73.x for this package).
if [[ -x "${HOME}/.local/bin/sui" ]]; then
  SUI="${HOME}/.local/bin/sui"
elif command -v suiup >/dev/null 2>&1; then
  SUI="$(suiup which sui 2>/dev/null || true)"
fi
SUI="${SUI:-$(command -v sui)}"

cd "$ROOT"
echo "Using sui: $SUI"
"$SUI" --version
echo "Active address: $("$SUI" client active-address)"

"$SUI" move build
echo "Build OK"

# Fresh publish requires no prior entry in Published.toml for this environment.
if [[ -f Published.toml ]]; then
  cp Published.toml "Published.toml.prev.$(date +%Y%m%d%H%M%S)"
  rm -f Published.toml
  echo "Removed Published.toml for fresh publish (backup saved)."
fi

echo "Publishing..."
"$SUI" client publish --gas-budget 2000000000 --json > /tmp/leverx-publish.json

python3 "$ROOT/scripts/parse-publish-json.py" /tmp/leverx-publish.json

source /tmp/leverx-deploy.env

PACKAGE_ID="${LEVERX_PACKAGE_ID:?missing package}"
ADMIN_CAP="${LEVERX_ADMIN_CAP_ID:?missing admin cap}"
TREASURY_CAP="${LEVERX_TREASURY_CAP_ID:?missing treasury cap}"
PREDICT_ID="0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a"
QUOTE_TYPE="0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC"

echo "Deploying shared objects (deploy_and_share)..."
"$SUI" client call \
  --package "$PACKAGE_ID" \
  --module deploy \
  --function deploy_and_share \
  --type-args "$QUOTE_TYPE" \
  --args "$ADMIN_CAP" "$TREASURY_CAP" "$PREDICT_ID" \
  --gas-budget 200000000 \
  --json > /tmp/leverx-deploy-tx.json

python3 "$ROOT/scripts/parse-publish-json.py" /tmp/leverx-deploy-tx.json

python3 - <<'PY'
from pathlib import Path

publish = Path("/tmp/leverx-deploy.env")
deploy = Path("/tmp/leverx-deploy-tx-parsed.env")
out_repo = Path("/mnt/c/Users/devar/Documents/leverx/contracts/deploy-testnet.env")

lines: dict[str, str] = {}
for p in (publish, deploy):
    if not p.exists():
        continue
    for line in p.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            lines[k] = v

lines.setdefault(
    "PREDICT_ID",
    "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a",
)
lines.setdefault(
    "PREDICT_PACKAGE_ID",
    "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138",
)
lines.setdefault(
    "PREDICT_REGISTRY_ID",
    "0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64",
)
lines.setdefault(
    "QUOTE_TYPE",
    "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC",
)
if pkg := lines.get("LEVERX_PACKAGE_ID"):
    lines["LXPLP_TYPE"] = f"{pkg}::lxplp::LXPLP"

body = "\n".join(f"{k}={v}" for k, v in lines.items()) + "\n"
out_repo.write_text(body, encoding="utf-8")
print(f"Wrote {out_repo}")
print(body)
PY
