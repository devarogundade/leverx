import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { LeverageSlider } from "@/components/leverx/LeverageSlider";
import { InfoPopover, LabelWithInfo } from "@/components/leverx/InfoPopover";
import { SlippagePopover } from "@/components/leverx/SlippagePopover";
import { TradeQuoteSummary } from "@/components/leverx/TradeQuoteSummary";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { useIndexerProtocol } from "@/hooks/useIndexer";
import { useLeverxMarketAsk } from "@/hooks/useLeverxMarketAsk";
import { useLeverxMintQuote } from "@/hooks/useLeverxMintQuote";
import { useWalletCoinBalance } from "@/hooks/useWalletCoinBalance";
import { premiumToCents } from "@/lib/leverx/indexer-markets";
import { formatCollateralAmount } from "@/lib/predict/quote-assets";
import { appConfig } from "@/lib/config";
import {
  TradeAmountInput,
  TradeQuickAmounts,
} from "@/components/leverx/TradeFormControls";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { useWallet } from "@/context/WalletContext";
import { useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { predictSideLabel, type PredictSide } from "@/lib/predict/instruments";
import {
  DEFAULT_LIMIT_ORDER_EXPIRY_HOURS,
  MAX_LIMIT_ORDER_SLIPPAGE_PCT,
  type LimitOrderExpiryHours,
} from "@/lib/leverx/constants";
import type { LimitExecutionMode } from "@/lib/leverx/transactions";
import {
  centsToPremiumRaw,
  defaultTpSlPremiumsFromEntry,
  isLimitBuyFillableNow,
  isLimitCentsWithinPredictBounds,
  isPlacementPriceAligned,
  isPremiumWithinPredictBounds,
  percentToBps,
  premiumRawToCents,
  PREDICT_MAX_PREMIUM_CENTS,
  PREDICT_MIN_PREMIUM_CENTS,
  slPremiumCentsFromEntry,
  strikeUsdToRaw,
  TP_SL_OFFSET_PRESETS,
  tpPremiumCentsFromEntry,
} from "@/lib/leverx/trade-math";
import { type MarketKeyArgs } from "@/lib/leverx/market-keys";
import { MARGIN_CALL_BPS } from "@/lib/leverx/protocol";
import { buildQuickAmounts } from "@/lib/leverx/form-helpers";
import { tradeCtaLabel, tradeNeedsDeposit } from "@/lib/leverx/trade-cta";
import {
  DEFAULT_LEVERAGE,
  formatLeverageBadge,
  MAX_MARGIN_USD,
  MIN_MARGIN_USD,
} from "@/lib/leverx/trade-limits";
import { ui } from "@/lib/copy";
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
  tradeLeveragePanel,
} from "@/lib/leverx/tw";

type OrderType = "market" | "limit";

interface Props {
  oracleId: string;
  side: PredictSide;
  onSideChange: (side: PredictSide) => void;
  expiryMs?: number;
  strikeRaw?: number;
  lowerStrikeRaw?: number;
  upperStrikeRaw?: number;
  lastAskPremium?: number;
  /** Set when oracle has settled — blocks new orders */
  disabled?: boolean;
  /** Called after a trade tx succeeds (e.g. switch to Open Orders on resting limit). */
  onTradeSuccess?: (meta: {
    orderType: OrderType;
    limitExecution: LimitExecutionMode;
  }) => void;
}

const ORDER_TYPES: readonly OrderType[] = ["market", "limit"];

export function PredictLeveragePanel({
  oracleId,
  side,
  onSideChange,
  expiryMs,
  strikeRaw,
  lowerStrikeRaw,
  upperStrikeRaw,
  lastAskPremium,
  disabled = false,
  onTradeSuccess,
}: Props) {
  const { isWalletConnected, address } = useWallet();
  const { openTrade, isProtocolReady, formatTxError } = useLeverxTransactions();
  const [txError, setTxError] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [lowerStrike, setLowerStrike] = useState(
    lowerStrikeRaw ? String(lowerStrikeRaw / 1e9) : "",
  );
  const [upperStrike, setUpperStrike] = useState(
    upperStrikeRaw ? String(upperStrikeRaw / 1e9) : "",
  );
  const [margin, setMargin] = useState("");
  const [leverage, setLeverage] = useState(DEFAULT_LEVERAGE);
  const [placementSlippagePct, setPlacementSlippagePct] = useState(5);
  const [orderExpiresHours, setOrderExpiresHours] =
    useState<LimitOrderExpiryHours>(DEFAULT_LIMIT_ORDER_EXPIRY_HOURS);
  const [limitExecution, setLimitExecution] = useState<LimitExecutionMode>("resting");
  const { data: protocol } = useIndexerProtocol();
  const tradeContextKey = `${oracleId}:${side}`;

  useEffect(() => {
    setTxError(null);
    setOrderType("market");
    setLimitPrice("");
    setLowerStrike(lowerStrikeRaw ? String(lowerStrikeRaw / 1e9) : "");
    setUpperStrike(upperStrikeRaw ? String(upperStrikeRaw / 1e9) : "");
    setMargin("");
    setLeverage(DEFAULT_LEVERAGE);
    setPlacementSlippagePct(5);
    setOrderExpiresHours(DEFAULT_LIMIT_ORDER_EXPIRY_HOURS);
    setLimitExecution("resting");
    setTpSl(false);
    setTp("");
    setSl("");
    // Only reset the trade form when the user changes market or outcome — not on background catalog refreshes.
  }, [tradeContextKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (orderType !== "limit") return;
    setLimitPrice((prev) => {
      if (prev) return prev;
      if (lastAskPremium && lastAskPremium > 0) {
        return premiumToCents(lastAskPremium).toFixed(1);
      }
      return prev;
    });
  }, [orderType, tradeContextKey, lastAskPremium]);
  const { data: walletQuoteBalance } = useWalletCoinBalance(appConfig.quoteType, 6);
  const [tpSl, setTpSl] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");

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
  const rangeFromChart = isRange && lowerStrikeRaw != null && upperStrikeRaw != null;
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

  const needsDeposit = useMemo(
    () =>
      tradeNeedsDeposit({
        marginUsd: marginNum,
        depositedQuoteAtoms: 0n,
        walletQuoteBalance,
      }),
    [marginNum, walletQuoteBalance],
  );

  const submitLabel = useMemo(
    () => tradeCtaLabel({ side, orderType, limitExecution, needsDeposit }),
    [side, orderType, limitExecution, needsDeposit],
  );

  const quoteBalanceLabel = useMemo(() => {
    if (walletQuoteBalance == null) return "—";
    return formatCollateralAmount(appConfig.quoteType, walletQuoteBalance);
  }, [walletQuoteBalance]);

  const quickAmounts = useMemo(
    () => buildQuickAmounts(walletQuoteBalance),
    [walletQuoteBalance],
  );

  const { data: liveAskPremium, isLoading: liveAskLoading } = useLeverxMarketAsk(
    orderType === "limit" ? tradeKey : undefined,
  );

  const quoteReferencePremium = useMemo(() => {
    if (orderType !== "limit" || limitExecution !== "resting" || !limitPrice) return undefined;
    const cents = parseFloat(limitPrice);
    if (!Number.isFinite(cents) || cents <= 0) return undefined;
    if (!isLimitCentsWithinPredictBounds(cents)) return undefined;
    return centsToPremiumRaw(cents);
  }, [orderType, limitExecution, limitPrice]);

  const {
    data: mintQuote,
    isLoading: quoteLoading,
    isFetching: quoteRefreshing,
  } = useLeverxMintQuote({
    key: tradeKey,
    marginUsd: marginNum,
    leverage: lev,
    owner: address ?? undefined,
    enabled: marginNum > 0,
    referencePremiumOverride: quoteReferencePremium,
  });

  const tradeQuantity = mintQuote?.tradeQuantity ?? 1n;

  const liveAskCents = useMemo(() => {
    if (liveAskPremium != null && liveAskPremium > 0n) {
      return premiumRawToCents(liveAskPremium);
    }
    if (lastAskPremium != null && lastAskPremium > 0) {
      return premiumToCents(lastAskPremium);
    }
    return null;
  }, [liveAskPremium, lastAskPremium]);

  const entryPremiumRaw = useMemo(() => {
    if (orderType === "limit" && limitPrice) {
      const cents = parseFloat(limitPrice);
      if (Number.isFinite(cents) && cents > 0) {
        return centsToPremiumRaw(cents);
      }
    }
    if (mintQuote?.marketAskPerUnit && mintQuote.marketAskPerUnit > 0n) {
      return mintQuote.marketAskPerUnit;
    }
    if (liveAskPremium != null && liveAskPremium > 0n) {
      return liveAskPremium;
    }
    if (lastAskPremium && lastAskPremium > 0) {
      return BigInt(Math.round(lastAskPremium));
    }
    return 0n;
  }, [orderType, limitPrice, mintQuote?.marketAskPerUnit, liveAskPremium, lastAskPremium]);

  const entryCents = useMemo(() => {
    if (entryPremiumRaw <= 0n) return 0;
    return premiumRawToCents(entryPremiumRaw);
  }, [entryPremiumRaw]);

  const handleTpSlToggle = (checked: boolean) => {
    setTpSl(checked);
    if (!checked) {
      setTp("");
      setSl("");
      return;
    }
    if (entryCents > 0) {
      const defaults = defaultTpSlPremiumsFromEntry(entryCents);
      setTp(defaults.tp);
      setSl(defaults.sl);
    }
  };

  const tpPresets = useMemo(
    () =>
      entryCents > 0
        ? TP_SL_OFFSET_PRESETS.map((offset) => ({
            label: `+${offset}¢`,
            value: tpPremiumCentsFromEntry(entryCents, offset).toFixed(1),
          }))
        : [],
    [entryCents],
  );

  const slPresets = useMemo(
    () =>
      entryCents > 0
        ? TP_SL_OFFSET_PRESETS.map((offset) => ({
            label: `−${offset}¢`,
            value: slPremiumCentsFromEntry(entryCents, offset).toFixed(1),
          }))
        : [],
    [entryCents],
  );

  useEffect(() => {
    if (!tpSl || entryCents <= 0 || tp || sl) return;
    const defaults = defaultTpSlPremiumsFromEntry(entryCents);
    setTp(defaults.tp);
    setSl(defaults.sl);
  }, [tpSl, entryCents, tp, sl]);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (marginNum > 0 && marginNum < MIN_MARGIN_USD) {
      errors.push(`Minimum deposit is ${MIN_MARGIN_USD} dUSDC.`);
    }
    if (marginNum > MAX_MARGIN_USD) {
      errors.push(`Maximum deposit is ${MAX_MARGIN_USD} dUSDC.`);
    }
    if (marginNum > 0 && walletQuoteBalance != null && marginNum > walletQuoteBalance + 1e-6) {
      errors.push("Deposit exceeds available USDC balance.");
    }
    if (orderType === "limit") {
      const cents = parseFloat(limitPrice);
      if (!Number.isFinite(cents) || cents <= 0) {
        errors.push("Enter a limit price above 0¢.");
      } else if (!isLimitCentsWithinPredictBounds(cents)) {
        errors.push(
          `Limit price must be between ${PREDICT_MIN_PREMIUM_CENTS}¢ and ${PREDICT_MAX_PREMIUM_CENTS}¢.`,
        );
      } else if (liveAskLoading) {
        errors.push("Waiting for live contract price…");
      } else if (liveAskPremium == null || liveAskPremium <= 0n) {
        errors.push(
          "Live contract price is unavailable. Wait for oracle updates or try another strike.",
        );
      } else {
        const limitPremium = centsToPremiumRaw(cents);
        const slippageBps = percentToBps(placementSlippagePct);
        const liveLabel = `${premiumRawToCents(liveAskPremium).toFixed(1)}¢`;

        if (limitExecution === "immediate") {
          if (!isLimitBuyFillableNow(liveAskPremium, limitPremium, slippageBps)) {
            errors.push(
              `Live contract price (${liveLabel}) is above your limit + ${placementSlippagePct}% slippage. Raise the limit or switch to Resting.`,
            );
          }
        } else if (!isPlacementPriceAligned(liveAskPremium, limitPremium, slippageBps)) {
          errors.push(
            `Resting orders need the live price (${liveLabel}) within your limit ± ${placementSlippagePct}% placement slippage. Adjust the limit, widen slippage, or wait for the market to move.`,
          );
        }
      }
      if (placementSlippagePct < 0.1) {
        errors.push("Slippage must be at least 0.1%.");
      } else if (placementSlippagePct > MAX_LIMIT_ORDER_SLIPPAGE_PCT) {
        errors.push(`Slippage cannot exceed ${MAX_LIMIT_ORDER_SLIPPAGE_PCT}%.`);
      }
      if (limitExecution === "resting" && expiryMs && expiryMs > 0) {
        const restingExpiresMs = Date.now() + orderExpiresHours * 3_600_000;
        if (restingExpiresMs <= Date.now()) {
          errors.push("Order expiry must be in the future.");
        } else if (restingExpiresMs > expiryMs) {
          errors.push("Order expiry cannot be after this market closes. Pick a shorter duration.");
        } else if (expiryMs <= Date.now() + 60_000) {
          errors.push("Market closes too soon for a resting limit order. Use Fill now or wait for the next expiry.");
        }
      }
    }
    if (orderType === "market" && marginNum > 0) {
      if (quoteLoading) {
        errors.push("Waiting for live contract price…");
      } else if (expiryMs && expiryMs > 0 && expiryMs <= Date.now()) {
        errors.push("This market has expired. Pick a live expiry or another strike.");
      } else if (mintQuote == null) {
        errors.push(
          "Live contract price is unavailable or outside 1¢–99¢ (common near oracle expiry). Try another strike or wait for oracle updates.",
        );
      } else if (!isPremiumWithinPredictBounds(mintQuote.marketAskPerUnit)) {
        errors.push(
          `Live contract price must be between ${PREDICT_MIN_PREMIUM_CENTS}¢ and ${PREDICT_MAX_PREMIUM_CENTS}¢.`,
        );
      }
    }
    if (isRange && !rangeFromChart) {
      const lower = parseFloat(lowerStrike);
      const upper = parseFloat(upperStrike);
      if (Number.isFinite(lower) && Number.isFinite(upper) && lower >= upper) {
        errors.push("Range low must be below high end.");
      }
    }
    if (tpSl) {
      if (entryCents <= 0) {
        errors.push("Set your deposit to load an entry premium before using TP/SL.");
      }
      const tpVal = parseFloat(tp);
      const slVal = parseFloat(sl);
      if (!tp && !sl) {
        errors.push("Set a take-profit or stop-loss premium, or turn TP/SL off.");
      }
      if (tp) {
        if (!Number.isFinite(tpVal) || !isLimitCentsWithinPredictBounds(tpVal)) {
          errors.push(
            `Take profit must be between ${PREDICT_MIN_PREMIUM_CENTS}¢ and ${PREDICT_MAX_PREMIUM_CENTS}¢.`,
          );
        } else if (entryCents > 0 && tpVal <= entryCents) {
          errors.push("Take profit must be above your entry premium.");
        }
      }
      if (sl) {
        if (!Number.isFinite(slVal) || !isLimitCentsWithinPredictBounds(slVal)) {
          errors.push(
            `Stop loss must be between ${PREDICT_MIN_PREMIUM_CENTS}¢ and ${PREDICT_MAX_PREMIUM_CENTS}¢.`,
          );
        } else if (entryCents > 0 && slVal >= entryCents) {
          errors.push("Stop loss must be below your entry premium.");
        }
      }
    }
    return errors;
  }, [
    marginNum,
    walletQuoteBalance,
    orderType,
    limitPrice,
    limitExecution,
    placementSlippagePct,
    liveAskLoading,
    liveAskPremium,
    isRange,
    rangeFromChart,
    lowerStrike,
    upperStrike,
    address,
    quoteLoading,
    mintQuote,
    orderExpiresHours,
    expiryMs,
    tpSl,
    tp,
    sl,
    entryCents,
  ]);

  const canSubmit =
    !disabled &&
    isWalletConnected &&
    isProtocolReady &&
    !protocol?.trading_paused &&
    marginNum > 0 &&
    expiryMs &&
    expiryMs > 0 &&
    validationErrors.length === 0 &&
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
      tpSl && tp && Number.isFinite(parseFloat(tp))
        ? centsToPremiumRaw(parseFloat(tp))
        : 0n;
    const slPremium =
      tpSl && sl && Number.isFinite(parseFloat(sl))
        ? centsToPremiumRaw(parseFloat(sl))
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
        marginUsd: marginNum,
        leverage: lev,
        orderType,
        limitExecution,
        limitCents: orderType === "limit" ? parseFloat(limitPrice) || undefined : undefined,
        quantity: tradeQuantity,
        placementSlippageBps:
          orderType === "limit" ? percentToBps(placementSlippagePct) : undefined,
        orderExpiresMs:
          orderType === "limit" && limitExecution === "resting"
            ? Math.min(Date.now() + orderExpiresHours * 3_600_000, expiryMs)
            : undefined,
        tpPremium: tpPremium > 0n ? tpPremium : undefined,
        slPremium: slPremium > 0n ? slPremium : undefined,
      },
      {
        onError: (err) => setTxError(formatTxError(err)),
        onSuccess: () => {
          setMargin("");
          setTxError(null);
          onTradeSuccess?.({ orderType, limitExecution });
        },
      },
    );
  };

  return (
    <div className={cn(tradeLeveragePanel, "trade-leverage-panel", disabled && "relative")}>
      {disabled ? (
        <div
          className="border-b border-border bg-muted/40 px-4 py-2.5 text-center text-xs text-muted-foreground"
          role="status"
        >
          {expiryMs && expiryMs > 0 && expiryMs <= Date.now()
            ? "This market has expired. New orders are not accepted."
            : "This market has settled. New orders are not accepted."}
        </div>
      ) : null}
      <div className={cn(disabled && "pointer-events-none select-none opacity-50")}>
      <div className="border-b border-border p-3">
        <div className={segTabsClass("stretch", "outcomes")} role="group" aria-label="Outcome">
          {canSwitchOutcome ? (
            <>
              <button
                type="button"
                onClick={() => onSideChange("up")}
                className={cn(
                  segTabOutcome,
                  side === "up" && segTabActive,
                  side === "up" && sideToggleLongActive,
                )}
              >
                {predictSideLabel.up}
              </button>
              <button
                type="button"
                onClick={() => onSideChange("down")}
                className={cn(
                  segTabOutcome,
                  side === "down" && segTabActive,
                  side === "down" && sideToggleShortActive,
                )}
              >
                {predictSideLabel.down}
              </button>
              <button
                type="button"
                onClick={() => onSideChange("range")}
                className={cn(
                  segTabOutcome,
                  side === "range" && segTabActive,
                  side === "range" && segTabRangeActive,
                )}
              >
                {predictSideLabel.range}
              </button>
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
            <LabelWithInfo
              className="mb-2"
              labelClassName="text-xs text-muted-foreground"
              label="Range bet — pays if the final price lands inside your band."
              info={leverxInfo.rangeMarket}
            />
            {rangeFromChart ? (
              <p className="font-mono text-sm text-foreground">
                ${(lowerStrikeRaw! / 1e9).toLocaleString()} – ${(upperStrikeRaw! / 1e9).toLocaleString()}
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <LabelWithInfo
                    className={cn(labelCaps, "mb-2")}
                    label="Low end"
                    labelClassName={labelCaps}
                    info={leverxInfo.lowerStrike}
                  />
                  <TradeAmountInput
                    prefix="$"
                    large
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={lowerStrike}
                    onChange={(e) => setLowerStrike(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <LabelWithInfo
                    className={cn(labelCaps, "mb-2")}
                    label="High end"
                    labelClassName={labelCaps}
                    info={leverxInfo.upperStrike}
                  />
                  <TradeAmountInput
                    prefix="$"
                    large
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={upperStrike}
                    onChange={(e) => setUpperStrike(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            )}
          </div>
        ) : orderType === "limit" ? (
          <div>
            <div className="mb-2">
              <LabelWithInfo
                label={`Limit price (${predictSideLabel[side]})`}
                labelClassName={labelCaps}
                info={leverxInfo.limitPrice}
              />
            </div>
            <TradeAmountInput
              large
              type="number"
              inputMode="decimal"
              min={0.1}
              step={0.1}
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              suffix={<span className="text-sm text-muted-foreground">¢</span>}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Live contract price:{" "}
              <span className="font-mono text-foreground">
                {liveAskLoading
                  ? "…"
                  : liveAskCents != null && liveAskCents > 0
                    ? `${liveAskCents.toFixed(1)}¢`
                    : "—"}
              </span>
            </p>
            {strikeRaw ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Target: <span className="font-mono text-foreground">${(strikeRaw / 1e9).toLocaleString()}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <LabelWithInfo
              label="Your deposit"
              labelClassName={labelCaps}
              info={leverxInfo.margin}
            />
            <span className="text-xs text-muted-foreground">
              {ui.balanceAvailable}{" "}
              <span className="font-mono text-foreground">{quoteBalanceLabel}</span>
            </span>
          </div>
          <TradeAmountInput
            prefix={<span className="font-mono text-sm">$</span>}
            large
            type="number"
            inputMode="decimal"
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            placeholder="0.00"
            suffix={<span className={leverageBadge}>{formatLeverageBadge(lev)} dUSDC</span>}
          />
          <div className="mt-2">
            <TradeQuickAmounts amounts={quickAmounts} onPick={setMargin} />
          </div>
          {marginNum > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Position size:{" "}
              <span className="font-mono text-foreground">
                {formatCollateralAmount(appConfig.quoteType, marginNum * lev)}
              </span>
              {" · "}
              Margin call at {(MARGIN_CALL_BPS / 100).toFixed(0)}%
            </p>
          ) : null}
        </div>

        <LeverageSlider value={leverage} onChange={setLeverage} />

        <TradeQuoteSummary
          quote={mintQuote}
          isLoading={quoteLoading}
          isRefreshing={quoteRefreshing && !quoteLoading}
        />

        <div className={tpSlBlock}>
          <div className={tpSlHeader}>
            <LabelWithInfo
              label="Take profit / Stop loss"
              labelClassName={labelCaps}
              info={leverxInfo.tpSl}
            />
            <Switch checked={tpSl} onCheckedChange={handleTpSlToggle} />
          </div>
          {tpSl ? (
            <div className={tpSlFields}>
              <p className="text-xs text-muted-foreground">
                <LabelWithInfo
                  label="Entry premium"
                  labelClassName="inline text-xs text-muted-foreground"
                  info={leverxInfo.tpSlEntry}
                />
                {": "}
                <span className="font-mono text-foreground">
                  {entryCents > 0 ? `${entryCents.toFixed(1)}¢` : quoteLoading ? "…" : "—"}
                </span>
              </p>
              <div>
                <LabelWithInfo
                  className="mb-2"
                  label="Take profit"
                  labelClassName={labelCaps}
                  info={leverxInfo.tpSlTakeProfit}
                />
                <TradeAmountInput
                  type="number"
                  inputMode="decimal"
                  min={0.1}
                  step={0.1}
                  value={tp}
                  onChange={(e) => setTp(e.target.value)}
                  placeholder={entryCents > 0 ? defaultTpSlPremiumsFromEntry(entryCents).tp : "0.0"}
                  suffix={<span className="text-sm text-muted-foreground">¢</span>}
                />
                {tpPresets.length > 0 ? (
                  <div className="mt-2">
                    <TradeQuickAmounts amounts={tpPresets} onPick={setTp} />
                  </div>
                ) : null}
              </div>
              <div>
                <LabelWithInfo
                  className="mb-2"
                  label="Stop loss"
                  labelClassName={labelCaps}
                  info={leverxInfo.tpSlStopLoss}
                />
                <TradeAmountInput
                  type="number"
                  inputMode="decimal"
                  min={0.1}
                  step={0.1}
                  value={sl}
                  onChange={(e) => setSl(e.target.value)}
                  placeholder={entryCents > 0 ? defaultTpSlPremiumsFromEntry(entryCents).sl : "0.0"}
                  suffix={<span className="text-sm text-muted-foreground">¢</span>}
                />
                {slPresets.length > 0 ? (
                  <div className="mt-2">
                    <TradeQuickAmounts amounts={slPresets} onPick={setSl} />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 border-t border-border p-4">
        {protocol?.trading_paused ? (
          <p className="flex items-center gap-1 text-xs text-destructive">
            Trading is temporarily paused.
            <InfoPopover title="Trading paused">{leverxInfo.tradingPaused}</InfoPopover>
          </p>
        ) : null}
        {!isProtocolReady && isWalletConnected ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            Trading is not available yet. Check back soon.
            <InfoPopover title="Setup">{leverxInfo.protocolNotConfigured}</InfoPopover>
          </p>
        ) : null}
        {validationErrors.map((err) => (
          <p key={err} className="text-xs text-destructive">
            {err}
          </p>
        ))}
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
    </div>
  );
}
