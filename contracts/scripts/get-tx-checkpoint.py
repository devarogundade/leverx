#!/usr/bin/env python3
"""Print checkpoint sequence for a Sui transaction digest."""
import json
import sys
import urllib.request

DIGEST = sys.argv[1] if len(sys.argv) > 1 else "866WrEoHQrxvTSqK38oXXKqNigoFDUhgFYAy7HDuVbXi"
RPC = sys.argv[2] if len(sys.argv) > 2 else "https://fullnode.testnet.sui.io"

body = json.dumps(
    {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sui_getTransactionBlock",
        "params": [DIGEST, {"showEffects": True}],
    }
).encode()

req = urllib.request.Request(
    RPC,
    data=body,
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(req, timeout=30) as resp:
    data = json.load(resp)

result = data.get("result") or {}
checkpoint = result.get("checkpoint")
if checkpoint is None:
    raise SystemExit(f"No checkpoint in response: {data}")
print(checkpoint)
