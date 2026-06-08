#!/usr/bin/env bash
# Whitelist launch collateral on LeverX testnet registry.
# Requires deploy-testnet.env (or /tmp/leverx-deploy.env) with package + admin IDs.
set -euo pipefail
export PATH="/home/devarogundade/.local/bin:/usr/bin:/bin:${PATH}"
cd /mnt/c/Users/devar/Documents/leverx/contracts

ENV_FILE="${1:-deploy-testnet.env}"
if [[ -f "/tmp/leverx-deploy.env" ]]; then
  # shellcheck disable=SC1091
  source /tmp/leverx-deploy.env
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

PKG="${LEVERX_PACKAGE_ID:?LEVERX_PACKAGE_ID missing}"
REGISTRY="${LEVERX_REGISTRY_ID:?LEVERX_REGISTRY_ID missing}"
ADMIN="${LEVERX_ADMIN_CAP_ID:?LEVERX_ADMIN_CAP_ID missing}"
QUOTE="${QUOTE_TYPE:-0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC}"

# Pyth feed IDs (32 bytes, no 0x) — testnet Hermes catalog
FEED_USDC="eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a"

# DeepBook spot pools for predict dUSDC quote — register after DeepBook creates them.
# (Testnet only has SUI_DBUSDC / DEEP_DBUSDC today; those are the wrong quote type.)
# POOL_SUI=
# POOL_DEEP=

MAX_CONF_BPS=100
GAS=100000000

whitelist() {
  local type_arg="$1"
  local feed="$2"
  local decimals="$3"
  local max_ltv="$4"
  local liq_ltv="$5"
  echo "==> whitelist $type_arg max=${max_ltv} liq=${liq_ltv}"
  sui client call \
    --package "$PKG" \
    --module protocol_registry \
    --function whitelist_collateral_entry \
    --type-args "$type_arg" \
    --args "$ADMIN" "$REGISTRY" "0x$feed" "$decimals" "$max_ltv" "$liq_ltv" "$MAX_CONF_BPS" \
    --gas-budget "$GAS"
}

# register_pool() {
#   local type_arg="$1"
#   local pool_id="$2"
#   echo "==> register_swap_pool $type_arg pool=$pool_id"
#   sui client call \
#     --package "$PKG" \
#     --module protocol_registry \
#     --function register_swap_pool_entry \
#     --type-args "$type_arg" \
#     --args "$ADMIN" "$REGISTRY" "$pool_id" \
#     --gas-budget "$GAS"
# }

echo "Package:  $PKG"
echo "Registry: $REGISTRY"
echo "Admin:    $ADMIN"

# dUSDC: 90% max borrow, 95% liquidation health floor (quote-native, ~1:1)
whitelist "$QUOTE" "$FEED_USDC" 6 9000 9500

echo "Done — dUSDC only (quote-native collateral)."
