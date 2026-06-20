import { Injectable } from '@nestjs/common';
import { PREDICT_QUOTE_REFERENCE_QUANTITY } from '../config/constants';
import {
  estimateQuantity,
  maxMintBudgetAtoms,
} from '../config/trade-math';
import type { PositionKeyArgs } from '../keeper/keeper.types';
import { PtbBuilderService } from './ptb-builder.service';
import { SuiService } from './sui.service';

@Injectable()
export class PredictQuoteService {
  constructor(
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
  ) {}

  /** Live ask premium and total mint cost for a quantity. */
  async fetchMarketAskPair(
    key: PositionKeyArgs,
    quantity?: bigint,
  ): Promise<[bigint, bigint] | null> {
    const qty = quantity && quantity > 0n ? quantity : PREDICT_QUOTE_REFERENCE_QUANTITY;
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildMarketAsk(cfg, key, qty);
    const pair = await this.sui.devInspectU64Pair(tx);
    if (!pair) return null;
    const [premiumPerUnit, mintCost] = pair;
    if (premiumPerUnit <= 0n) return null;
    return [premiumPerUnit, mintCost];
  }

  /** 1e9-scaled per-contract ask premium from on-chain Predict oracle. */
  async fetchMarketAskPerUnit(
    key: PositionKeyArgs,
    quantity?: bigint,
  ): Promise<bigint | null> {
    const pair = await this.fetchMarketAskPair(key, quantity);
    if (!pair) return null;
    return pair[0];
  }

  /** Size a mint against live on-chain ask until mint cost fits margin × leverage. */
  async resolveMintQuote(
    key: PositionKeyArgs,
    marginQuoteAtoms: bigint,
    leverageBps: bigint,
  ): Promise<{ marketAskPerUnit: bigint; mintCost: bigint; tradeQuantity: bigint } | null> {
    const budget = maxMintBudgetAtoms(marginQuoteAtoms, leverageBps);
    if (budget <= 0n) return null;

    const refAsk = await this.fetchMarketAskPerUnit(key);
    if (!refAsk) return null;

    let quantity = estimateQuantity(marginQuoteAtoms, leverageBps, refAsk);

    for (let attempt = 0; attempt < 12; attempt++) {
      const atQty = await this.fetchMarketAskPair(key, quantity);
      if (!atQty) return null;
      const [marketAskPerUnit, mintCost] = atQty;

      if (mintCost > 0n && mintCost <= budget) {
        return { marketAskPerUnit, mintCost, tradeQuantity: quantity };
      }

      if (mintCost <= 0n) {
        if (quantity <= 1n) return null;
        quantity /= 2n;
        continue;
      }

      quantity = (quantity * budget) / mintCost;
      if (quantity < 1n) return null;
    }

    return null;
  }

  /** 1e9-scaled per-contract bid premium from on-chain Predict oracle. */
  async fetchMarketBidPerUnit(
    key: PositionKeyArgs,
    quantity?: bigint,
  ): Promise<bigint | null> {
    const qty = quantity && quantity > 0n ? quantity : PREDICT_QUOTE_REFERENCE_QUANTITY;
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildMarketBid(cfg, key, qty);
    const pair = await this.sui.devInspectU64Pair(tx);
    if (!pair) return null;
    const [premiumPerUnit] = pair;
    return premiumPerUnit > 0n ? premiumPerUnit : null;
  }

  /** Predict manager linked on a user proxy object. */
  async fetchPredictManagerId(accountId: string): Promise<string | null> {
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildReadPredictManagerId(cfg, accountId);
    const id = await this.sui.devInspectId(tx);
    if (!id || id === '0x0' || /^0x0+$/i.test(id)) return null;
    return id;
  }

  /** Quote balance held in a Predict manager (shared across markets). */
  async fetchManagerQuoteBalance(predictManagerId: string): Promise<bigint | null> {
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildReadManagerQuoteBalance(cfg, predictManagerId);
    return this.sui.devInspectU64(tx);
  }

  /** Open contract quantity for `key` in a Predict manager. */
  async fetchManagerOpenQuantity(
    predictManagerId: string,
    key: PositionKeyArgs,
  ): Promise<bigint | null> {
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildReadManagerOpenQuantity(cfg, predictManagerId, key);
    return this.sui.devInspectU64(tx);
  }
}
