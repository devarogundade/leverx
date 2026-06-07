#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/devarogundade/.local/bin:${PATH}"
ADDR="0x195b8d58415745c17c2877478818c44b8c41172c9d16282a76ea6e3582db756c"
echo "Gas for $ADDR:"
sui client gas
echo "Requesting faucet..."
curl -s -X POST "https://faucet.testnet.sui.io/gas" -H "Content-Type: application/json" -d "{\"FixedAmountRequest\":{\"recipient\":\"${ADDR}\"}}"
echo
sleep 3
echo "Gas after faucet:"
sui client gas
