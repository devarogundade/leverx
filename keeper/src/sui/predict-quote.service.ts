import { Injectable } from '@nestjs/common';
import { PREDICT_QUOTE_REFERENCE_QUANTITY } from '../config/constants';
import type { PositionKeyArgs } from '../keeper/keeper.types';
import { PtbBuilderService } from './ptb-builder.service';
import { SuiService } from './sui.service';

@Injectable()
export class PredictQuoteService {
  constructor(
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
  ) {}

  /** 1e9-scaled per-contract ask premium from on-chain Predict oracle. */
  async fetchMarketAskPerUnit(
    key: PositionKeyArgs,
    quantity?: bigint,
  ): Promise<bigint | null> {
    const qty = quantity && quantity > 0n ? quantity : PREDICT_QUOTE_REFERENCE_QUANTITY;
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildMarketAsk(cfg, key, qty);
    const pair = await this.sui.devInspectU64Pair(tx);
    if (!pair) return null;
    const [premiumPerUnit] = pair;
    return premiumPerUnit > 0n ? premiumPerUnit : null;
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
}
