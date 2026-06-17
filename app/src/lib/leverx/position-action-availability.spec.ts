import { describe, expect, it } from "vitest";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import {
  getPositionActionAvailability,
  isIndexerStaleOpenPosition,
} from "@/lib/leverx/position-action-availability";

function basePosition(overrides: Partial<LeveragedPosition> = {}): LeveragedPosition {
  return {
    position_key: "oracle:1:2:0:0:0",
    account_id: "0xacc",
    owner: "0xowner",
    predict_manager_id: "0xmgr",
    oracle_id: "0xoracle",
    expiry_ms: Date.now() - 60_000,
    strike: 2,
    higher_strike: 0,
    is_up: false,
    is_range: false,
    open_quantity: 10,
    margin_quote: 1_000_000,
    borrow_quote: 0,
    peak_borrow_quote: 0,
    leverage_bps: 10_000,
    mint_cost: 1_000_000,
    last_order_type: 0,
    status: "open",
    opened_at_ms: Date.now() - 120_000,
    closed_at_ms: null,
    realized_payout: 0,
    entry_mark: null,
    closing_mark: null,
    close_debt_repaid: 0,
    close_interest_paid: 0,
    close_surplus_quote: 0,
    ...overrides,
  };
}

describe("isIndexerStaleOpenPosition", () => {
  it("is true when indexer lists contracts but on-chain read is zero", () => {
    expect(isIndexerStaleOpenPosition(basePosition(), 0n)).toBe(true);
  });

  it("is false when on-chain quantity matches indexer", () => {
    expect(isIndexerStaleOpenPosition(basePosition(), 10n)).toBe(false);
  });
});

describe("getPositionActionAvailability", () => {
  it("offers settle when expired, oracle settled, and on-chain qty > 0", () => {
    const result = getPositionActionAvailability({
      position: basePosition(),
      onChainQuantity: 10n,
      quantityLoading: false,
      oracleSettled: true,
      now: Date.now(),
    });
    expect(result.canSettle).toBe(true);
    expect(result.emptyState).toBeNull();
  });

  it("does not offer redeem or settle when on-chain qty is zero but indexer is stale", () => {
    const result = getPositionActionAvailability({
      position: basePosition(),
      onChainQuantity: 0n,
      quantityLoading: false,
      oracleSettled: true,
      now: Date.now(),
    });
    expect(result.canCloseRedeem).toBe(false);
    expect(result.canSettle).toBe(false);
    expect(result.emptyState).toBe("index_stale");
  });

  it("offers close when oracle is live and on-chain qty > 0", () => {
    const result = getPositionActionAvailability({
      position: basePosition({ expiry_ms: Date.now() + 60_000 }),
      onChainQuantity: 5n,
      quantityLoading: false,
      oracleSettled: false,
      now: Date.now(),
    });
    expect(result.canCloseRedeem).toBe(true);
    expect(result.canSettle).toBe(false);
  });
});
