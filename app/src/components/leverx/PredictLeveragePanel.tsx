import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CollateralAssetSelect } from "@/components/leverx/CollateralAssetSelect";
import { LeverageSlider } from "@/components/leverx/LeverageSlider";
import { InfoPopover, LabelWithInfo } from "@/components/leverx/InfoPopover";
import { SlippagePopover } from "@/components/leverx/SlippagePopover";
import { TradeQuoteSummary } from "@/components/leverx/TradeQuoteSummary";
import { leverxInfo } from "@/lib/leverx/info-copy";
import {
  useIndexerAccounts,
  useIndexerCollateralAssets,
  useIndexerCollateralBalances,
  useIndexerProtocol,
} from "@/hooks/useIndexer";
import { useLeverxProtocolConfig } from "@/hooks/useLeverxTransactions";
import { useLeverxMintQuote } from "@/hooks/useLeverxMintQuote";
import { usePredictOracleState } from "@/hooks/usePredictOracleState";
import { useWalletCoinBalance } from "@/hooks/useWalletCoinBalance";
import { formatMaxLtvPercent } from "@/lib/leverx/collateral-catalog";
import { premiumToCents } from "@/lib/leverx/indexer-markets";
import { formatCollateralAmount } from "@/lib/predict/quote-assets";
import { appConfig } from "@/lib/config";
import {
  TradeAmountInput,
  TradeQuickAmounts,
  TradeSelect,
} from "@/components/leverx/TradeFormControls";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { useWallet } from "@/context/WalletContext";
import { useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { predictSideLabel, type PredictSide } from "@/lib/predict/instruments";
import {
  DEFAULT_LIMIT_ORDER_EXPIRY_HOURS,
  type LimitOrderExpiryHours,
} from "@/lib/leverx/constants";
import type { LimitExecutionMode } from "@/lib/leverx/transactions";
import {
  centsToPremiumRaw,
  percentToBps,
  strikeUsdToRaw,
  tpSlToPremiumRaw,
} from "@/lib/leverx/trade-math";
import { positionKeyFromArgs, type MarketKeyArgs } from "@/lib/leverx/market-keys";
import { resolveCollateralRoute } from "@/lib/leverx/protocol";
import { tradeCtaLabel, tradeNeedsDeposit } from "@/lib/leverx/trade-cta";
import { Loader2 } from "lucide-react";
import {
  tradeCtaClass,
  labelCaps,
  leverageBadge,
  pillToggleActive,
  pillToggleBtn,
  pillToggleGroup,
  pillToggleIdle,
  segTabActive,
  segTabOutcome,
  segTabRangeActive,
  segTabsClass,
  sideToggleLongActive,
  sideToggleShortActive,
  tpSlBlock,
  tpSlFields,
  tpSlHeader,
  tpSlInput,
  tpSlLabel,
  tpSlRow,
  tpSlUnit,
  tradeLeveragePanel,
} from "@/lib/leverx/tw";

type OrderType = "market" | "limit";

interface Props {
  oracleId: string;
  side: PredictSide;
  expiryMs?: number;
  strikeRaw?: number;
  lowerStrikeRaw?: number;
  upperStrikeRaw?: number;
  lastAskPremium?: number;
}

function coinTypeSymbol(coinType: string): string {
  const parts = coinType.split("::");
  return parts[parts.length - 1]?.toUpperCase() ?? "COIN";
}

const QUICK_AMOUNTS = [
  { label: "10%", value: "1" },
  { label: "25%", value: "2.5" },
  { label: "50%", value: "5" },
  { label: "75%", value: "7.5" },
  { label: "MAX", value: "10" },
] as const;

const UNIT_OPTIONS = [
  { value: "pct", label: "%" },
  { value: "cents", label: "¢" },
] as const;

const ORDER_TYPES: readonly OrderType[] = ["market", "limit"];

export function PredictLeveragePanel({
  oracleId,
  side,
  expiryMs,
  strikeRaw,
  lowerStrikeRaw,
  upperStrikeRaw,
  lastAskPremium,
}: Props) {
  const { isWalletConnected, address } = useWallet();
  const { openTrade, isProtocolReady, formatTxError } = useLeverxTransactions(address ?? undefined);
  const [txError, setTxError] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [lowerStrike, setLowerStrike] = useState(
    lowerStrikeRaw ? String(lowerStrikeRaw / 1e9) : "",
  );
  const [upperStrike, setUpperStrike] = useState(
    upperStrikeRaw ? String(upperStrikeRaw / 1e9) : "",
  );
  const [collateralAsset, setCollateralAsset] = useState("");
  const [margin, setMargin] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [leverage, setLeverage] = useState(1.1);
  const [placementSlippagePct, setPlacementSlippagePct] = useState(5);
  const [orderExpiresHours, setOrderExpiresHours] =
    useState<LimitOrderExpiryHours>(DEFAULT_LIMIT_ORDER_EXPIRY_HOURS);
  const [limitExecution, setLimitExecution] = useState<LimitExecutionMode>("immediate");
  const { data: protocol } = useIndexerProtocol();
  const protocolCfg = useLeverxProtocolConfig();
  const { data: accounts = [] } = useIndexerAccounts(address);
  const accountId = accounts[0]?.account_id;
  const { data: collateralBalances = [] } = useIndexerCollateralBalances(accountId);
  const { data: oracleState } = usePredictOracleState(oracleId);
  const { data: collateralAssets = [], isLoading: collateralLoading } =
    useIndexerCollateralAssets();
  const collateralOptions = useMemo(
    () => collateralAssets.map((c) => c.coin_type),
    [collateralAssets],
  );
  const selectedCatalogEntry = useMemo(
    () => collateralAssets.find((c) => c.coin_type === collateralAsset),
    [collateralAssets, collateralAsset],
  );

  useEffect(() => {
    if (lastAskPremium && lastAskPremium > 0) {
      setLimitPrice(premiumToCents(lastAskPremium).toFixed(1));
    }
  }, [lastAskPremium]);
  const { data: walletBalance, isLoading: balanceLoading } = useWalletCoinBalance(
    collateralAsset || null,
    selectedCatalogEntry?.decimals,
  );
  const { data: walletQuoteBalance } = useWalletCoinBalance(appConfig.quoteType, 6);

  useEffect(() => {
    if (collateralOptions.length === 0) return;
    if (!collateralAsset || !collateralOptions.includes(collateralAsset)) {
      setCollateralAsset(collateralOptions[0]!);
    }
  }, [collateralOptions, collateralAsset]);

  const collateralSymbol = useMemo(
    () => (collateralAsset ? coinTypeSymbol(collateralAsset) : coinTypeSymbol(appConfig.quoteType)),
    [collateralAsset],
  );
  const balanceLabel = useMemo(() => {
    if (!collateralAsset) return "—";
    if (balanceLoading) return "…";
    if (walletBalance == null) return "—";
    return formatCollateralAmount(collateralAsset, walletBalance);
  }, [balanceLoading, walletBalance, collateralAsset]);
  const [tpSl, setTpSl] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [tpUnit, setTpUnit] = useState("pct");
  const [slUnit, setSlUnit] = useState("pct");

  const lev = leverage;
  const marginNum = parseFloat(margin) || 0;
  const isRange = side === "range";
  const ctaClass = tradeCtaClass(side);
  const rangeLower = lowerStrikeRaw;
  const rangeUpper = upperStrikeRaw;
  const outcomeStrike =
    strikeRaw ??
    (rangeLower && rangeUpper ? Math.round((rangeLower + rangeUpper) / 2) : undefined);
  const canSwitchOutcome = !!(outcomeStrike || (rangeLower && rangeUpper));
  const quantityNum = parseInt(quantity, 10) || 0;
  const collateralSpotUsd =
    oracleState?.spot_price && oracleState.spot_price > 0
      ? oracleState.spot_price / 1e9
      : undefined;

  const tradeKey: MarketKeyArgs | undefined = useMemo(() => {
    if (!expiryMs) return undefined;
    const resolvedLower = isRange
      ? lowerStrikeRaw ?? strikeUsdToRaw(parseFloat(lowerStrike))
      : strikeRaw ?? 0;
    const resolvedUpper = isRange
      ? upperStrikeRaw ?? strikeUsdToRaw(parseFloat(upperStrike))
      : 0;
    if (isRange && (!resolvedLower || !resolvedUpper)) return undefined;
    if (!isRange && !resolvedLower) return undefined;
    return {
      oracleId,
      expiryMs,
      strike: isRange ? resolvedLower : resolvedLower,
      higherStrike: isRange ? resolvedUpper : 0,
      isUp: isRange ? true : side === "up",
      isRange,
    };
  }, [
    expiryMs,
    isRange,
    lowerStrike,
    lowerStrikeRaw,
    upperStrike,
    upperStrikeRaw,
    oracleId,
    side,
    strikeRaw,
  ]);

  const entryPremiumRaw = useMemo(() => {
    if (orderType === "limit" && limitPrice) {
      return centsToPremiumRaw(parseFloat(limitPrice));
    }
    if (lastAskPremium && lastAskPremium > 0) {
      return BigInt(Math.round(lastAskPremium));
    }
    return 0n;
  }, [orderType, limitPrice, lastAskPremium]);

  const collateralRoute = useMemo(
    () =>
      collateralAsset
        ? resolveCollateralRoute(
            collateralAsset,
            selectedCatalogEntry?.max_ltv_bps,
            selectedCatalogEntry?.decimals,
          )
        : null,
    [collateralAsset, selectedCatalogEntry],
  );

  const depositedCollateralAtoms = useMemo(() => {
    if (!tradeKey || !collateralAsset) return 0n;
    const positionKey = positionKeyFromArgs(tradeKey);
    const row = collateralBalances.find(
      (b) => b.position_key === positionKey && b.collateral_asset === collateralAsset,
    );
    return row ? BigInt(row.balance_atoms) : 0n;
  }, [tradeKey, collateralAsset, collateralBalances]);

  const needsDeposit = useMemo(
    () =>
      tradeNeedsDeposit({
        marginUsd: marginNum,
        leverage: lev,
        route: collateralRoute,
        cfg: protocolCfg,
        collateralSpotUsd,
        depositedCollateralAtoms,
        walletCollateralBalance: walletBalance,
        walletQuoteBalance,
      }),
    [
      marginNum,
      lev,
      collateralRoute,
      protocolCfg,
      collateralSpotUsd,
      depositedCollateralAtoms,
      walletBalance,
      walletQuoteBalance,
    ],
  );

  const submitLabel = useMemo(
    () => tradeCtaLabel({ side, orderType, needsDeposit }),
    [side, orderType, needsDeposit],
  );

  const { data: mintQuote, isLoading: quoteLoading } = useLeverxMintQuote({
    key: tradeKey,
    collateralCoinType: collateralAsset || appConfig.quoteType,
    collateralMaxLtvBps: selectedCatalogEntry?.max_ltv_bps,
    collateralDecimals: selectedCatalogEntry?.decimals,
    marginUsd: marginNum,
    leverage: lev,
    quantity: BigInt(Math.max(1, quantityNum)),
    owner: address ?? undefined,
    enabled: marginNum > 0 && quantityNum > 0,
  });

  const canSubmit =
    isWalletConnected &&
    isProtocolReady &&
    !protocol?.trading_paused &&
    marginNum > 0 &&
    quantityNum > 0 &&
    expiryMs &&
    expiryMs > 0 &&
    (isRange
      ? (lowerStrike || lowerStrikeRaw) && (upperStrike || upperStrikeRaw)
      : strikeRaw && strikeRaw > 0);

  const handleSubmit = () => {
    if (!canSubmit || !expiryMs) return;
    setTxError(null);

    const resolvedLower = isRange
      ? lowerStrikeRaw ?? strikeUsdToRaw(parseFloat(lowerStrike))
      : strikeRaw ?? 0;
    const resolvedUpper = isRange
      ? upperStrikeRaw ?? strikeUsdToRaw(parseFloat(upperStrike))
      : 0;

    const tpPremium =
      tpSl && tp
        ? tpSlToPremiumRaw({
          value: parseFloat(tp),
          unit: tpUnit as "pct" | "cents",
          entryPremiumRaw,
          isTakeProfit: true,
        })
        : 0n;
    const slPremium =
      tpSl && sl
        ? tpSlToPremiumRaw({
          value: parseFloat(sl),
          unit: slUnit as "pct" | "cents",
          entryPremiumRaw,
          isTakeProfit: false,
        })
        : 0n;

    openTrade.mutate(
      {
        key: {
          oracleId,
          expiryMs,
          strike: isRange ? resolvedLower : (strikeRaw ?? 0),
          higherStrike: isRange ? resolvedUpper : 0,
          isUp: isRange ? true : side === "up",
          isRange,
        },
        collateralCoinType: collateralAsset || appConfig.quoteType,
        collateralMaxLtvBps: selectedCatalogEntry?.max_ltv_bps,
        collateralDecimals: selectedCatalogEntry?.decimals,
        collateralSpotUsd,
        marginUsd: marginNum,
        leverage: lev,
        orderType,
        limitExecution,
        limitCents: orderType === "limit" ? parseFloat(limitPrice) || undefined : undefined,
        quantity: BigInt(quantityNum),
        placementSlippageBps:
          orderType === "limit" ? percentToBps(placementSlippagePct) : undefined,
        orderExpiresMs:
          orderType === "limit" && limitExecution === "resting"
            ? Date.now() + orderExpiresHours * 3_600_000
            : undefined,
        tpPremium: tpPremium > 0n ? tpPremium : undefined,
        slPremium: slPremium > 0n ? slPremium : undefined,
      },
      {
        onError: (err) => setTxError(formatTxError(err)),
        onSuccess: () => {
          setMargin("");
          setTxError(null);
        },
      },
    );
  };

  return (
    <div className={cn(tradeLeveragePanel, "trade-leverage-panel")}>
      <div className="border-b border-border p-3">
        <div className={segTabsClass("stretch", "outcomes")} role="group" aria-label="Outcome">
          {canSwitchOutcome ? (
            <>
              <Link
                to="/predictions/$oracleId"
                params={{ oracleId }}
                search={{ strike: outcomeStrike, side: "up" }}
                className={cn(
                  segTabOutcome,
                  side === "up" && segTabActive,
                  side === "up" && sideToggleLongActive,
                )}
              >
                {predictSideLabel.up}
              </Link>
              <Link
                to="/predictions/$oracleId"
                params={{ oracleId }}
                search={{ strike: outcomeStrike, side: "down" }}
                className={cn(
                  segTabOutcome,
                  side === "down" && segTabActive,
                  side === "down" && sideToggleShortActive,
                )}
              >
                {predictSideLabel.down}
              </Link>
              <Link
                to="/predictions/$oracleId"
                params={{ oracleId }}
                search={{
                  side: "range",
                  lowerStrike: rangeLower ?? outcomeStrike,
                  upperStrike: rangeUpper ?? outcomeStrike,
                }}
                className={cn(
                  segTabOutcome,
                  side === "range" && segTabActive,
                  side === "range" && segTabRangeActive,
                )}
              >
                {predictSideLabel.range}
              </Link>
            </>
          ) : (
            <>
              <span className={cn(segTabOutcome, "opacity-50")}>{predictSideLabel.up}</span>
              <span className={cn(segTabOutcome, "opacity-50")}>{predictSideLabel.down}</span>
              <span className={cn(segTabOutcome, "opacity-50")}>{predictSideLabel.range}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-border px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <LabelWithInfo
          label="Order type"
          labelClassName={labelCaps}
          info={leverxInfo.orderType}
        />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className={pillToggleGroup} role="group" aria-label="Order type">
            {ORDER_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={cn(
                  pillToggleBtn,
                  orderType === type ? pillToggleActive : pillToggleIdle,
                )}
                onClick={() => setOrderType(type)}
                aria-pressed={orderType === type}
              >
                {type}
              </button>
            ))}
          </div>
          {orderType === "limit" ? (
            <SlippagePopover
              placementSlippagePct={placementSlippagePct}
              orderExpiresHours={orderExpiresHours}
              limitExecution={limitExecution}
              onPlacementSlippageChange={setPlacementSlippagePct}
              onOrderExpiresHoursChange={setOrderExpiresHours}
              onLimitExecutionChange={setLimitExecution}
            />
          ) : null}
        </div>
      </div>

      <div className="flex flex-col space-y-5 p-4">
        {isRange ? (
          <div>
            <div className="space-y-3">
              <LabelWithInfo
                className="mb-3"
                labelClassName="text-xs text-muted-foreground"
                label="Vertical range — pays when settlement lands inside the band (lower, upper]."
                info={leverxInfo.rangeMarket}
              />
              <div>
                <LabelWithInfo
                  className={cn(labelCaps, "mb-2")}
                  label="Lower strike"
                  labelClassName={labelCaps}
                  info={leverxInfo.lowerStrike}
                />
                <TradeAmountInput
                  prefix="$"
                  large
                  value={lowerStrike}
                  onChange={(e) => setLowerStrike(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <LabelWithInfo
                  className={cn(labelCaps, "mb-2")}
                  label="Upper strike"
                  labelClassName={labelCaps}
                  info={leverxInfo.upperStrike}
                />
                <TradeAmountInput
                  prefix="$"
                  large
                  value={upperStrike}
                  onChange={(e) => setUpperStrike(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        ) : orderType === "limit" ? (
          <div>
            <div className="mb-2 flex justify-between text-xs text-muted-foreground">
              <LabelWithInfo
                label={`Limit price (${predictSideLabel[side]})`}
                info={leverxInfo.limitPrice}
              />
              <span>
                Bal. <span className="font-mono text-foreground">{balanceLabel}</span>
              </span>
            </div>
            <TradeAmountInput
              large
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              suffix={<span className="text-sm text-muted-foreground">¢</span>}
            />
            {strikeRaw ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Strike key: <span className="font-mono text-foreground">{strikeRaw}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <LabelWithInfo
              label="Collateral"
              labelClassName={labelCaps}
              info={leverxInfo.collateral}
            />
            <span className="text-xs text-muted-foreground">
              Bal. <span className="font-mono text-foreground">{balanceLabel}</span>
            </span>
          </div>
          <CollateralAssetSelect
            value={collateralAsset}
            onValueChange={setCollateralAsset}
            assets={collateralOptions}
            disabled={collateralLoading && collateralOptions.length === 0}
          />
          {selectedCatalogEntry ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Max LTV {formatMaxLtvPercent(selectedCatalogEntry.max_ltv_bps)} (indexed whitelist)
            </p>
          ) : null}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <LabelWithInfo
              label="Margin"
              labelClassName={labelCaps}
              info={leverxInfo.margin}
            />
            {collateralSymbol ? (
              <span className="text-xs font-mono text-muted-foreground">{collateralSymbol}</span>
            ) : null}
          </div>
          <TradeAmountInput
            prefix={<span className="font-mono text-sm">$</span>}
            large
            type="number"
            inputMode="decimal"
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            placeholder="0.00"
            suffix={
              <span className={leverageBadge}>
                {Number.isInteger(lev) ? `${lev}X` : `${lev.toFixed(1)}X`}
              </span>
            }
          />
          <div className="mt-2">
            <TradeQuickAmounts amounts={QUICK_AMOUNTS} onPick={setMargin} />
          </div>
          {marginNum > 0 && collateralSymbol ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Position size:{" "}
              <span className="font-mono text-foreground">
                {formatCollateralAmount(collateralAsset, marginNum * lev)}
              </span>
            </p>
          ) : null}
        </div>

        <div>
          <LabelWithInfo
            className={cn(labelCaps, "mb-2")}
            label="Quantity (contracts)"
            labelClassName={labelCaps}
            info={leverxInfo.quantity}
          />
          <TradeAmountInput
            type="number"
            inputMode="numeric"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="1"
          />
        </div>

        <LeverageSlider
          value={leverage}
          onChange={setLeverage}
          margin={marginNum > 0 ? marginNum : undefined}
          collateralSymbol={collateralSymbol || undefined}
        />

        <TradeQuoteSummary quote={mintQuote} isLoading={quoteLoading} />

        <div className={tpSlBlock}>
          <div className={tpSlHeader}>
            <LabelWithInfo
              label="Take profit / Stop loss"
              labelClassName={labelCaps}
              info={
                <>
                  <p>{leverxInfo.tpSl}</p>
                  <p className="mt-1.5">{leverxInfo.tpSlUnits}</p>
                </>
              }
            />
            <Switch checked={tpSl} onCheckedChange={setTpSl} />
          </div>
          {tpSl ? (
            <div className={tpSlFields}>
              {(
                [
                  { label: "TP", value: tp, setValue: setTp, unit: tpUnit, setUnit: setTpUnit },
                  { label: "SL", value: sl, setValue: setSl, unit: slUnit, setUnit: setSlUnit },
                ] as const
              ).map((row) => (
                <div key={row.label} className={tpSlRow}>
                  <span className={tpSlLabel}>{row.label}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={row.value}
                    onChange={(e) => row.setValue(e.target.value)}
                    placeholder="0"
                    className={tpSlInput}
                  />
                  <TradeSelect
                    value={row.unit}
                    onValueChange={row.setUnit}
                    options={UNIT_OPTIONS}
                    size="sm"
                    triggerClassName={tpSlUnit}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 border-t border-border p-4">
        {protocol?.trading_paused ? (
          <p className="flex items-center gap-1 text-xs text-destructive">
            Trading is paused on-chain.
            <InfoPopover title="Trading paused">{leverxInfo.tradingPaused}</InfoPopover>
          </p>
        ) : null}
        {!isProtocolReady && isWalletConnected ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            On-chain protocol IDs are incomplete. Deploy LeverX and set fee collector + Pyth oracle
            env vars.
            <InfoPopover title="Protocol config">{leverxInfo.protocolNotConfigured}</InfoPopover>
          </p>
        ) : null}
        {txError ? <p className="text-xs text-destructive">{txError}</p> : null}
        {isWalletConnected ? (
          <button
            type="button"
            className={ctaClass}
            disabled={!canSubmit || openTrade.isPending}
            onClick={handleSubmit}
          >
            {openTrade.isPending ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              submitLabel
            )}
          </button>
        ) : (
          <WalletConnectButton fullWidth large className={ctaClass} />
        )}
      </div>
    </div>
  );
}
