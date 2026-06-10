#!/usr/bin/env python3
"""Fail if hardcoded deploy IDs drift from contracts/deploy-testnet.env."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEPLOY_ENV = ROOT / "contracts" / "deploy-testnet.env"

CHECKS: list[tuple[Path, str, str]] = [
    (
        ROOT / "app" / "src" / "lib" / "config.ts",
        "LEVERX_PACKAGE_ID",
        r"TESTNET_LEVERX\s*=\s*\{[^}]*packageId:\s*\n?\s*\"([^\"]+)\"",
    ),
    (
        ROOT / "keeper" / "src" / "config" / "constants.ts",
        "LEVERX_PACKAGE_ID",
        r"TESTNET_LEVERX\s*=\s*\{[^}]*packageId:\s*\n?\s*'([^']+)'",
    ),
    (
        ROOT / "indexer" / "crates" / "leverx-indexer" / "src" / "config.rs",
        "LEVERX_PACKAGE_ID",
        r'DEFAULT_LEVERX_PACKAGE_ID: &str =\s*\n\s*"([^"]+)"',
    ),
]


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def main() -> int:
    if not DEPLOY_ENV.exists():
        print(f"missing {DEPLOY_ENV}", file=sys.stderr)
        return 1

    env = load_env(DEPLOY_ENV)
    errors: list[str] = []

    for path, key, pattern in CHECKS:
        expected = env.get(key)
        if not expected:
            errors.append(f"{DEPLOY_ENV.name} missing {key}")
            continue
        text = path.read_text(encoding="utf-8")
        match = re.search(pattern, text)
        if not match:
            errors.append(f"{path}: could not find {key} default")
            continue
        actual = match.group(1)
        if actual != expected:
            errors.append(
                f"{path}: {key} is {actual} but deploy-testnet.env has {expected}"
            )

    if errors:
        for err in errors:
            print(err, file=sys.stderr)
        return 1

    print(
        f"OK — LEVERX_PACKAGE_ID={env['LEVERX_PACKAGE_ID']} "
        f"FIRST_CHECKPOINT={env.get('FIRST_CHECKPOINT', '?')}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
