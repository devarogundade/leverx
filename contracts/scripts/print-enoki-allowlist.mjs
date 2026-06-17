#!/usr/bin/env node
/**
 * Print Enoki Developer Portal allow-list entries after a contract republish.
 * Usage: node contracts/scripts/print-enoki-allowlist.mjs [path/to/deploy-testnet.env]
 *
 * Portal: https://portal.enoki.mystenlabs.com → Sponsored transactions
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = process.argv[2] ?? resolve(__dirname, "../deploy-testnet.env");

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

const leverxFns = [
  "leverage_vault::deposit_liquidity",
  "leverage_vault::withdraw_liquidity",
  "trade::create_user_proxy",
  "trade::deposit_quote",
  "trade::withdraw_quote",
  "trade::place_binary_limit_mint_order",
  "trade::place_range_limit_mint_order",
  "trade::cancel_binary_limit_mint_order",
  "trade::cancel_range_limit_mint_order",
  "trade::deleverage_binary_account_balance",
  "trade::deleverage_range_account_balance",
  "trade::register_executor_entry",
  "trade::revoke_executor_entry",
  "triggers::set_automated_triggers_entry",
  "triggers::set_range_triggers",
  "triggers::clear_automated_triggers",
  "triggers::clear_range_triggers",
];

const predictFns = ["range_key::new", "market_key::up", "market_key::down"];

const env = loadEnv(envPath);
const pkg = env.LEVERX_PACKAGE_ID ?? "";
const predictPkg = env.PREDICT_PACKAGE_ID ?? "";

const moveTargets = [];
for (const fn of leverxFns) {
  if (pkg) moveTargets.push(`${pkg}::${fn}`);
}
for (const fn of predictFns) {
  if (predictPkg) moveTargets.push(`${predictPkg}::${fn}`);
}

const sharedAddresses = [
  env.LEVERX_REGISTRY_ID,
  env.LEVERX_VAULT_ID,
  env.LEVERX_FEE_COLLECTOR_ID,
  env.PREDICT_ID,
].filter(Boolean);

console.log(`# Enoki portal allow list (from ${envPath})\n`);
console.log("## Move call targets\n");
for (const t of moveTargets) console.log(t);

console.log("\n## Shared object addresses (add under allowed addresses)\n");
for (const a of sharedAddresses) console.log(a);

console.log(
  "\n# User zkLogin wallets are senders — allow any sender or leave sender unrestricted per portal policy.",
);
