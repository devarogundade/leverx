#!/usr/bin/env node
/**
 * Set protocol_registry.keeper_address after deploy (required for create_user_proxy).
 *
 * Usage (from keeper/):
 *   node scripts/set-keeper-address.mjs [keeper-address]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keeperRoot = resolve(__dirname, "..");
const repoRoot = resolve(keeperRoot, "..");

function loadEnv(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

const deployEnv = loadEnv(resolve(repoRoot, "contracts/deploy-testnet.env"));
const keeperEnv = loadEnv(resolve(keeperRoot, ".env"));
const privateKey = keeperEnv.KEEPER_PRIVATE_KEY?.trim();
if (!privateKey) {
  console.error("KEEPER_PRIVATE_KEY missing in keeper/.env");
  process.exit(1);
}

const packageId = deployEnv.LEVERX_PACKAGE_ID;
const adminCapId = deployEnv.LEVERX_ADMIN_CAP_ID;
const registryId = deployEnv.LEVERX_REGISTRY_ID;
if (!packageId || !adminCapId || !registryId) {
  console.error("LEVERX_PACKAGE_ID, LEVERX_ADMIN_CAP_ID, LEVERX_REGISTRY_ID required in contracts/deploy-testnet.env");
  process.exit(1);
}

const keypair = Ed25519Keypair.fromSecretKey(privateKey);
const signerAddress = keypair.getPublicKey().toSuiAddress();
const keeperAddress = (process.argv[2] ?? deployEnv.KEEPER_ADDRESS ?? signerAddress).trim();

const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet") });

const registry = await client.getObject({
  id: registryId,
  options: { showContent: true },
});
const current = registry.data?.content?.fields?.keeper_address;
console.log(`Registry ${registryId}`);
console.log(`  keeper_address (on-chain): ${current}`);
console.log(`  keeper_address (target):   ${keeperAddress}`);
console.log(`  signer:                      ${signerAddress}`);

if (current === keeperAddress) {
  console.log("Already set — nothing to do.");
  process.exit(0);
}

const tx = new Transaction();
tx.moveCall({
  target: `${packageId}::protocol_registry::set_keeper_address_entry`,
  arguments: [tx.object(adminCapId), tx.object(registryId), tx.pure.address(keeperAddress)],
});

const result = await client.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showEffects: true },
});

const status = result.effects?.status?.status;
console.log(`TX digest: ${result.digest}`);
console.log(`Status: ${status}`);
if (status !== "success") {
  console.error(result.effects?.status?.error ?? "transaction failed");
  process.exit(1);
}

const updated = await client.getObject({
  id: registryId,
  options: { showContent: true },
});
console.log(`keeper_address now: ${updated.data?.content?.fields?.keeper_address}`);
