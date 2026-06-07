#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/devarogundade/.local/bin:${PATH}"
cd /mnt/c/Users/devar/Documents/leverx/contracts

echo "Active address: $(sui client active-address)"
echo "Sui version: $(sui --version)"

sui move build --allow-dirty

echo "Publishing..."
sui client publish --gas-budget 2000000000 --allow-dirty --json > /tmp/leverx-publish.json 2>/tmp/leverx-publish.err || {
  echo "Publish failed:"
  cat /tmp/leverx-publish.err
  exit 1
}

python3 /mnt/c/Users/devar/Documents/leverx/contracts/scripts/parse-publish-json.py /tmp/leverx-publish.json
