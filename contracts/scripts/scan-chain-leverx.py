#!/usr/bin/env python3
"""Find leverx AdminCap / ProtocolDeployed on testnet."""
import json
import urllib.request

RPC = "https://fullnode.testnet.sui.io:443"


def rpc(method, params):
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    req = urllib.request.Request(
        RPC,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def scan_packages(limit=200):
    """Scan recent testnet txs for any package with trade/leverage_vault."""
    # Walk backwards from latest checkpoint via queryEvents on MoveModule deploy - too broad
    # Instead: query owned objects for known addresses for AdminCap
    addrs = [
        "0x195b8d58415745c17c2877478818c44b8c41172c9d16282a76ea6e3582db756c",
        "0x382f1af936dce90641c4c1bc0186972076553fd219b1bcd618c13c81e10342e3",
        "0x491e0db193aeb680b341b6340e0d4f9d238bdb25d058069a36c165c041f9ed83",
        "0x6963474436f3bbb3c11ac8e3381fd923281d6bae377b4e0a38357da28e698e3a",
    ]
    for addr in addrs:
        res = rpc("suix_getOwnedObjects", [
            addr,
            {"filter": {"StructType": "0x2::package::UpgradeCap"}},
            None, 50,
        ])
        for item in res.get("result", {}).get("data", []):
            obj = item.get("data", {})
            print(f"UpgradeCap owner={addr[:10]}… id={obj.get('objectId')}")

    # Query all ProtocolDeployed events - use wildcard by querying leverx module if we guess package
    # Try suix_queryEvents with MoveEventType containing protocol_registry - won't work

    # Paginate ALL publishes globally - use TransactionBlocks with InputObject Mutated SharedObject?
    pass


def find_by_module_query():
    """Query recent events from packages - brute force recent publish digests from checkpoint."""
    res = rpc("sui_getLatestCheckpointSequenceNumber", [])
    seq = int(res["result"])
    print(f"latest checkpoint {seq}")
    # get checkpoint transactions
    cp = rpc("sui_getCheckpoint", [str(seq)])["result"]
    digests = cp.get("transactions", [])[:30]
    for d in digests:
        tx = rpc("sui_getTransactionBlock", [d, {"showObjectChanges": True, "showEvents": True}])["result"]
        for c in tx.get("objectChanges") or []:
            if c.get("type") != "published":
                continue
            pkg = c.get("packageId")
            try:
                mods = rpc("sui_getNormalizedMoveModulesByPackage", [pkg]).get("result", {})
            except Exception:
                continue
            if "trade" in mods or "leverage_vault" in mods:
                print("FOUND LEVERX", pkg, "tx", d)
                for e in tx.get("events") or []:
                    if "ProtocolDeployed" in e.get("type", ""):
                        print("  deployed", e.get("parsedJson"))
                return pkg, d
    return None, None


if __name__ == "__main__":
    scan_packages()
    print("--- scanning latest checkpoint publishes ---")
    pkg, tx = find_by_module_query()
    if not pkg:
        # scan previous checkpoints
        res = rpc("sui_getLatestCheckpointSequenceNumber", [])
        seq = int(res["result"])
        for s in range(seq - 1, max(seq - 500, 0), -1):
            cp = rpc("sui_getCheckpoint", [str(s)]).get("result")
            if not cp:
                continue
            for d in cp.get("transactions", []):
                tx = rpc("sui_getTransactionBlock", [d, {"showObjectChanges": True, "showEvents": True}]).get("result")
                if not tx:
                    continue
                for c in tx.get("objectChanges") or []:
                    if c.get("type") != "published":
                        continue
                    pkg = c.get("packageId")
                    mods = rpc("sui_getNormalizedMoveModulesByPackage", [pkg]).get("result", {})
                    if "trade" in mods and "leverage_vault" in mods:
                        print(f"FOUND at checkpoint {s} pkg={pkg} tx={d}")
                        for e in tx.get("events") or []:
                            if "ProtocolDeployed" in e.get("type", ""):
                                print("  deployed", json.dumps(e.get("parsedJson")))
                        raise SystemExit(0)
        print("NOT FOUND in last 500 checkpoints")
