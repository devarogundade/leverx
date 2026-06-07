#!/usr/bin/env python3
"""Find recent leverx package publishes on Sui testnet."""
import json
import urllib.request
from pathlib import Path

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


def addr_from_pk_b64(b64: str) -> str:
    import base64, hashlib
    raw = base64.b64decode(b64)
    h = hashlib.blake2b(bytes([0x00]) + raw, digest_size=32).digest()
    return "0x" + h.hex()


def is_leverx(pkg: str) -> bool:
    mods = rpc("sui_getNormalizedMoveModulesByPackage", [pkg]).get("result", {})
    return "leverage_vault" in mods or "trade" in mods


def scan_addr(addr: str, limit: int = 50):
    cursor = None
    found = []
    for _ in range(5):
        res = rpc("suix_queryTransactionBlocks", [
            {"filter": {"FromAddress": addr}, "options": {"showObjectChanges": True, "showEvents": True}},
            cursor, limit, True,
        ])
        for tx in res.get("result", {}).get("data", []):
            pkg = None
            for c in tx.get("objectChanges") or []:
                if c.get("type") == "published":
                    pkg = c.get("packageId")
            if pkg and is_leverx(pkg):
                deployed = None
                admin = None
                for c in tx.get("objectChanges") or []:
                    ot = c.get("objectType") or ""
                    if "AdminCap" in ot:
                        admin = c.get("objectId")
                for e in tx.get("events") or []:
                    if "ProtocolDeployed" in e.get("type", ""):
                        deployed = e.get("parsedJson")
                found.append((pkg, tx["digest"], deployed, admin, tx.get("timestampMs")))
        if not res.get("result", {}).get("hasNextPage"):
            break
        cursor = res.get("result", {}).get("nextCursor")
    return found


def main():
    addrs = {"0x195b8d58415745c17c2877478818c44b8c41172c9d16282a76ea6e3582db756c"}
    aliases_path = Path.home() / ".sui/sui_config/sui.aliases"
    if aliases_path.exists():
        for a in json.loads(aliases_path.read_text()):
            try:
                addrs.add(addr_from_pk_b64(a["public_key_base64"]))
            except Exception:
                pass

    all_found = []
    for addr in sorted(addrs):
        hits = scan_addr(addr)
        for h in hits:
            all_found.append((h[4] or 0, h))

    all_found.sort(reverse=True)
    if not all_found:
        print("NO_LEVERX_FOUND")
        return

    _, (pkg, digest, deployed, admin, ts) = all_found[0]
    print(json.dumps({
        "package_id": pkg,
        "publish_tx": digest,
        "timestamp_ms": ts,
        "admin_cap": admin,
        "deployed": deployed,
    }, indent=2))


if __name__ == "__main__":
    main()
