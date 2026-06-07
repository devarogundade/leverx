#!/usr/bin/env python3
"""Parse sui client publish --json output and print deploy env vars."""
import json
import sys


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/leverx-publish.json"
    data = json.load(open(path))

    # CLI may wrap in { "effects": ... } or return transaction block directly
    tx = data.get("transaction") or data
    if "effects" in data and "objectChanges" not in data:
        tx = data

    changes = tx.get("objectChanges") or data.get("objectChanges") or []
    events = tx.get("events") or data.get("events") or []

    package_id = None
    admin_cap = None
    upgrade_cap = None
    treasury_cap = None
    for c in changes:
        if c.get("type") == "published":
            package_id = c.get("packageId")
        ot = c.get("objectType") or ""
        if "AdminCap" in ot:
            admin_cap = c.get("objectId")
        if "UpgradeCap" in ot:
            upgrade_cap = c.get("objectId")
        if "TreasuryCap" in ot and "LXPLP" in ot:
            treasury_cap = c.get("objectId")

    deployed = None
    for e in events:
        if "ProtocolDeployed" in e.get("type", ""):
            deployed = e.get("parsedJson")

    digest = tx.get("digest") or data.get("digest")
    print(f"PUBLISH_TX={digest}")
    if package_id:
        print(f"LEVERX_PACKAGE_ID={package_id}")
    if admin_cap:
        print(f"LEVERX_ADMIN_CAP_ID={admin_cap}")
    if upgrade_cap:
        print(f"LEVERX_UPGRADE_CAP_ID={upgrade_cap}")
    if treasury_cap:
        print(f"LEVERX_TREASURY_CAP_ID={treasury_cap}")
    if deployed:
        print(f"LEVERX_REGISTRY_ID={deployed.get('registry_id')}")
        print(f"LEVERX_VAULT_ID={deployed.get('vault_id')}")
        print(f"LEVERX_FEE_COLLECTOR_ID={deployed.get('fee_collector_id')}")

    out = "/tmp/leverx-deploy-tx-parsed.env"
    publish_out = "/tmp/leverx-deploy.env"

    with open(out, "w", encoding="utf-8") as f:
        if package_id:
            f.write(f"LEVERX_PACKAGE_ID={package_id}\n")
        if admin_cap:
            f.write(f"LEVERX_ADMIN_CAP_ID={admin_cap}\n")
        if treasury_cap:
            f.write(f"LEVERX_TREASURY_CAP_ID={treasury_cap}\n")
        if upgrade_cap:
            f.write(f"LEVERX_UPGRADE_CAP_ID={upgrade_cap}\n")
        if deployed:
            f.write(f"LEVERX_REGISTRY_ID={deployed.get('registry_id')}\n")
            f.write(f"LEVERX_VAULT_ID={deployed.get('vault_id')}\n")
            f.write(f"LEVERX_FEE_COLLECTOR_ID={deployed.get('fee_collector_id')}\n")
    print(f"Wrote {out}")
    # Also write publish-time env for deploy script
    if path.endswith("leverx-publish.json"):
        with open(publish_out, "w", encoding="utf-8") as f:
            if package_id:
                f.write(f"LEVERX_PACKAGE_ID={package_id}\n")
            if admin_cap:
                f.write(f"LEVERX_ADMIN_CAP_ID={admin_cap}\n")
            if treasury_cap:
                f.write(f"LEVERX_TREASURY_CAP_ID={treasury_cap}\n")
            if upgrade_cap:
                f.write(f"LEVERX_UPGRADE_CAP_ID={upgrade_cap}\n")
        print(f"Wrote {publish_out}")


if __name__ == "__main__":
    main()
