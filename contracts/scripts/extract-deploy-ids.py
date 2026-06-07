#!/usr/bin/env python3
"""Extract LeverX package + ProtocolDeployed IDs from a Sui testnet transaction."""
from __future__ import annotations

import json
import sys
import urllib.request

RPC = "https://fullnode.testnet.sui.io:443"


def rpc(method: str, params: list) -> dict:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    req = urllib.request.Request(
        RPC,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <TX_DIGEST>", file=sys.stderr)
        sys.exit(1)

    digest = sys.argv[1]
    tx = rpc(
        "sui_getTransactionBlock",
        [
            digest,
            {
                "showObjectChanges": True,
                "showEvents": True,
                "showInput": True,
            },
        ],
    ).get("result", {})

    package_id = None
    admin_cap = None
    upgrade_cap = None
    for change in tx.get("objectChanges") or []:
        if change.get("type") == "published":
            package_id = change.get("packageId")
        ot = change.get("objectType") or ""
        if "AdminCap" in ot:
            admin_cap = change.get("objectId")
        if "UpgradeCap" in ot:
            upgrade_cap = change.get("objectId")

    deployed = None
    for event in tx.get("events") or []:
        if event.get("type", "").endswith("::events::ProtocolDeployed"):
            deployed = event.get("parsedJson")

    print(f"# tx: {digest}")
    if package_id:
        print(f"LEVERX_PACKAGE_ID={package_id}")
        print(f"LXPLP_TYPE={package_id}::leverage_vault::LXPLP")
    if admin_cap:
        print(f"LEVERX_ADMIN_CAP_ID={admin_cap}")
    if upgrade_cap:
        print(f"LEVERX_UPGRADE_CAP_ID={upgrade_cap}")
    if deployed:
        print(f"LEVERX_REGISTRY_ID={deployed.get('registry_id')}")
        print(f"LEVERX_VAULT_ID={deployed.get('vault_id')}")
        print(f"LEVERX_FEE_COLLECTOR_ID={deployed.get('fee_collector_id')}")
        print(f"PREDICT_ID={deployed.get('predict_id')}")
    if not package_id and not deployed:
        print("# No publish or ProtocolDeployed found in this transaction.", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
