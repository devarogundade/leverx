/**
 * Quick smoke test for fetchProtectionQuote (SUI trade + BTC oracle).
 * Usage: node_modules/.bin/tsx scripts/test-protection-quote.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const i = trimmed.indexOf("=");
  if (i < 0) continue;
  process.env[trimmed.slice(0, i)] = trimmed.slice(i + 1);
}

const { buildTradeEntryPosition } = await import("../src/lib/shieldbook/trade-entry-position.ts");
const { groupProtectionOraclesForTrade } = await import("../src/lib/shieldbook/oracle-ranking.ts");
const { fetchJson } = await import("../src/lib/api/fetch-json.ts");
const { parsePredictOraclesList } = await import("../src/lib/predict/oracles.ts");
const { appConfig } = await import("../src/lib/config.ts");
const { resolveOracleById } = await import("../src/lib/shieldbook/oracle.ts");
const { fetchProtectionQuote } = await import("../src/lib/shieldbook/quote.ts");
const { marginSnapshotMoveArgs } = await import("../src/lib/shieldbook/snapshot.ts");
const { suiClient } = await import("../src/lib/sui/client.ts");
const { DEEPBOOK_READONLY_SENDER } = await import("../src/lib/deepbook/client.ts");
const { isShieldbookConfigured } = await import("../src/lib/config.ts");

console.log("shieldbook configured:", isShieldbookConfigured());

const position = buildTradeEntryPosition({
  marginManagerId: "",
  poolKey: "SUI_DBUSDC",
  side: "Long",
  collateralAmount: 10,
  borrowAmount: 5,
  markPrice: 3.5,
  minBorrowRiskRatio: 1.5,
});

console.log("\n--- position ---");
console.log(JSON.stringify(position, null, 2));

const snap = marginSnapshotMoveArgs(position, 8000);
console.log("\n--- snapshot move args ---");
console.log({
  positionKey: new TextDecoder().decode(snap.positionKey),
  asset: new TextDecoder().decode(snap.asset),
  side: snap.side,
  collateral: snap.collateral.toString(),
  debt: snap.debt.toString(),
  entryPrice: snap.entryPrice.toString(),
  currentPrice: snap.currentPrice.toString(),
  liquidationPrice: snap.liquidationPrice.toString(),
});

const presetOracleId = process.env.TEST_ORACLE_ID?.trim();
let btcChoice;
if (presetOracleId) {
  btcChoice = {
    oracleId: presetOracleId,
    underlyingAsset: "BTC",
    matchesTradeAsset: false,
    expiryLabel: "(preset)",
  };
  console.log("\nUsing TEST_ORACLE_ID:", presetOracleId);
} else {
  const oracleUrl = `${appConfig.predictServerUrl.replace(/\/$/, "")}/predicts/${appConfig.predictId}/oracles`;
  console.log("\nFetching oracles (large payload, ~60s)…");
  const rows = parsePredictOraclesList(
    await fetchJson(oracleUrl, { timeoutMs: 120_000 }),
  );
  console.log(`Loaded ${rows.length} oracle rows`);
  const groups = groupProtectionOraclesForTrade(rows, "SUI", 2);
  btcChoice = groups.other.find((c) => c.underlyingAsset === "BTC") ?? groups.all[0];
}

if (!btcChoice) {
  console.error("No active oracles found");
  process.exit(1);
}

console.log("\n--- oracle choice ---", {
  oracleId: btcChoice.oracleId,
  underlying: btcChoice.underlyingAsset,
  matchesTrade: btcChoice.matchesTradeAsset,
  expiry: btcChoice.expiryLabel,
});

const oracle = await resolveOracleById(btcChoice.oracleId);
console.log("\n--- resolved oracle ---", oracle);

if (!oracle) {
  console.error("resolveOracleById returned null");
  process.exit(1);
}

const quote = await fetchProtectionQuote(
  suiClient,
  DEEPBOOK_READONLY_SENDER,
  position,
  8000,
  oracle,
);

console.log("\n--- quote ---");
if (!quote) {
  const { Transaction } = await import("@mysten/sui/transactions");
  const { marginSnapshotMoveArgs: snapArgs } = await import("../src/lib/shieldbook/snapshot.ts");
  const { matchesProtectionBase } = await import("../src/lib/predict/oracles.ts");
  const { estimateProtectionStrikes } = await import("../src/lib/shieldbook/protection-strike.ts");
  const { FLOAT_SCALING } = await import("../src/lib/shieldbook/constants.ts");

  const pkg = appConfig.shieldPackageId;
  const predictPkg = appConfig.predictPackageId;
  const snap = snapArgs(position, 8000);
  const nowMs = BigInt(Date.now());
  const tx = new Transaction();
  tx.setSender(DEEPBOOK_READONLY_SENDER);

  const [snapshot] = tx.moveCall({
    target: `${pkg}::position::new_snapshot`,
    arguments: [
      tx.pure.vector("u8", [...snap.positionKey]),
      tx.pure.vector("u8", [...snap.asset]),
      tx.pure.u8(snap.side),
      tx.pure.u64(snap.collateral),
      tx.pure.u64(snap.debt),
      tx.pure.u64(snap.entryPrice),
      tx.pure.u64(snap.currentPrice),
      tx.pure.u64(snap.liquidationPrice),
    ],
  });
  const [quoteVal] = tx.moveCall({
    target: `${pkg}::protection::quote_protection_with_expiry`,
    arguments: [snapshot, tx.pure.u64(snap.coverageBps), tx.pure.u64(BigInt(oracle.expiryMs)), tx.pure.u64(nowMs)],
  });
  const [strikeVal] = tx.moveCall({ target: `${pkg}::shield_math::strike`, arguments: [quoteVal] });
  tx.moveCall({ target: `${pkg}::shield_math::coverage_amount`, arguments: [quoteVal] });
  tx.moveCall({ target: `${pkg}::shield_math::premium_amount`, arguments: [quoteVal] });
  const [qtyVal] = tx.moveCall({ target: `${pkg}::shield_math::quantity`, arguments: [quoteVal] });
  const [upVal] = tx.moveCall({ target: `${pkg}::shield_math::is_up`, arguments: [quoteVal] });

  const sameUnderlying = matchesProtectionBase(oracle.underlyingAsset, position.base);
  const strikeEstimate = estimateProtectionStrikes({
    side: position.side,
    tradeBase: position.base,
    tradeCurrentPrice: position.currentPrice,
    tradeLiquidationPrice: position.liquidationPrice,
    oracleUnderlying: oracle.underlyingAsset,
    oracleSpot: oracle.spotPrice ?? 0,
  });
  const predictStrikeArg = sameUnderlying
    ? strikeVal
    : tx.pure.u64(BigInt(Math.max(1, Math.round(strikeEstimate.oracleStrike * Number(FLOAT_SCALING)))));

  const [key] = tx.moveCall({
    target: `${pkg}::predict_client::market_key`,
    arguments: [tx.pure.id(oracle.oracleId), tx.pure.u64(BigInt(oracle.expiryMs)), predictStrikeArg, upVal],
  });
  tx.moveCall({
    target: `${predictPkg}::predict::get_trade_amounts`,
    arguments: [tx.object(appConfig.predictId), tx.object(oracle.oracleId), key, qtyVal, tx.object("0x6")],
  });

  const inspect = await suiClient.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: DEEPBOOK_READONLY_SENDER,
  });
  console.error("dev-inspect status:", inspect.effects?.status);
  console.error("dev-inspect error:", inspect.error ?? inspect.effects?.status?.error);
  process.exit(1);
}

console.log({
  ...quote,
  premiumQuoteUnits: quote.premiumQuoteUnits.toString(),
});

console.log("\nOK");
