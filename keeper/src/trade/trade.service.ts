import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { IndexerService } from '../indexer/indexer.service';
import { logKeeperError } from '../lib/keeper-log';
import { PtbBuilderService } from '../sui/ptb-builder.service';
import { SuiService } from '../sui/sui.service';
import {
  verifyMintIntentAuth,
  verifyRedeemIntentAuth,
  verifySettleIntentAuth,
} from './trade-auth';
import type {
  MintIntentFields,
  RedeemIntentFields,
  SettleIntentFields,
} from './trade-message';
import { TradeReplayStore } from './trade-replay.store';
import type {
  MintTradeBody,
  RedeemTradeBody,
  SettleTradeBody,
  TradeRelayResponse,
} from './trade.types';
import { simulationFailureMessage } from '../lib/move-abort';
import { Transaction } from '@mysten/sui/transactions';

@Injectable()
export class TradeService {
  private readonly logger = new Logger(TradeService.name);

  constructor(
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
    private readonly indexer: IndexerService,
    private readonly replayStore: TradeReplayStore,
  ) {}

  async relayMint(body: MintTradeBody): Promise<TradeRelayResponse> {
    const intent = await this.verifyMintRequest(body);
    await this.assertRelayReady();
    await this.assertAccountOwnership(intent);

    if (this.sui.isTradingPaused()) {
      throw new ServiceUnavailableException('trading_paused');
    }

    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildLeveragedMint(
      cfg,
      intent.accountId,
      intent.predictManagerId,
      {
        key: {
          oracleId: intent.oracleId,
          expiryMs: intent.expiryMs,
          strike: intent.strike,
          higherStrike: intent.higherStrike,
          isUp: intent.isUp,
          isRange: intent.isRange,
        },
        marginQuoteAtoms: intent.marginQuoteAtoms,
        leverageBps: intent.leverageBps,
        quantity: intent.quantity,
        maxMintCost: intent.maxMintCost,
        marketSlippageBps: intent.marketSlippageBps,
        remintAfterDeleverage: intent.remintAfterDeleverage,
        orderKind: intent.orderKind,
        limitPremiumPerUnit: intent.limitPremiumPerUnit,
        placementSlippageBps: intent.placementSlippageBps,
      },
    );

    return this.simulateAndExecute(tx, `mint ${intent.accountId}`);
  }

  async relayRedeem(body: RedeemTradeBody): Promise<TradeRelayResponse> {
    const intent = await this.verifyRedeemRequest(body);
    await this.assertRelayReady();
    await this.assertAccountOwnership(intent);

    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildLeveragedRedeem(cfg, {
      key: {
        oracleId: intent.oracleId,
        expiryMs: intent.expiryMs,
        strike: intent.strike,
        higherStrike: intent.higherStrike,
        isUp: intent.isUp,
        isRange: intent.isRange,
      },
      accountId: intent.accountId,
      predictManagerId: intent.predictManagerId,
      quantity: intent.quantity,
      minPayout: intent.minPayout,
      redeemMode: intent.redeemMode,
      minPremiumPerUnit: intent.minPremiumPerUnit,
    });

    return this.simulateAndExecute(tx, `redeem ${intent.accountId}`);
  }

  async relaySettle(body: SettleTradeBody): Promise<TradeRelayResponse> {
    const intent = await this.verifySettleRequest(body);
    await this.assertRelayReady();
    await this.assertAccountOwnership(intent);

    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildSettleExpiredPermissionless(cfg, {
      key: {
        oracleId: intent.oracleId,
        expiryMs: intent.expiryMs,
        strike: intent.strike,
        higherStrike: intent.higherStrike,
        isUp: intent.isUp,
        isRange: intent.isRange,
      },
      accountId: intent.accountId,
      predictManagerId: intent.predictManagerId,
      quantity: intent.quantity,
    });

    return this.simulateAndExecute(tx, `settle ${intent.accountId}`);
  }

  private async verifyMintRequest(
    body: MintTradeBody,
  ): Promise<MintIntentFields> {
    try {
      this.assertIntentNotReplayed(body);
      const intent = await verifyMintIntentAuth(body, this.sui.getSuiNetwork());
      this.replayStore.markUsed(body.signature, intent.expiresAtMs);
      return intent;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      const code = err instanceof Error ? err.message : 'invalid_auth';
      throw new BadRequestException(code);
    }
  }

  private async verifyRedeemRequest(
    body: RedeemTradeBody,
  ): Promise<RedeemIntentFields> {
    try {
      this.assertIntentNotReplayed(body);
      const intent = await verifyRedeemIntentAuth(
        body,
        this.sui.getSuiNetwork(),
      );
      this.replayStore.markUsed(body.signature, intent.expiresAtMs);
      return intent;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      const code = err instanceof Error ? err.message : 'invalid_auth';
      throw new BadRequestException(code);
    }
  }

  private async verifySettleRequest(
    body: SettleTradeBody,
  ): Promise<SettleIntentFields> {
    try {
      this.assertIntentNotReplayed(body);
      const intent = await verifySettleIntentAuth(
        body,
        this.sui.getSuiNetwork(),
      );
      this.replayStore.markUsed(body.signature, intent.expiresAtMs);
      return intent;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      const code = err instanceof Error ? err.message : 'invalid_auth';
      throw new BadRequestException(code);
    }
  }

  private assertIntentNotReplayed(body: { signature: string }): void {
    if (this.replayStore.isReplayed(body.signature)) {
      throw new BadRequestException('intent_replayed');
    }
  }

  private assertRelayReady(): void {
    const readiness = this.sui.getTaskReadiness();
    if (!readiness.txReady) {
      throw new ServiceUnavailableException({
        error: 'keeper_not_configured',
        missing: readiness.missing,
      });
    }

    const signer = this.sui.getKeypair()?.getPublicKey().toSuiAddress();
    const onChainKeeper = this.sui.getKeeperAddress();
    if (
      onChainKeeper &&
      signer &&
      onChainKeeper.toLowerCase() !== signer.toLowerCase()
    ) {
      throw new ServiceUnavailableException('keeper_signer_mismatch');
    }
  }

  private async assertAccountOwnership(
    intent: MintIntentFields | RedeemIntentFields | SettleIntentFields,
  ): Promise<void> {
    const { items } = await this.indexer.fetchAccounts({
      owner: intent.address,
      limit: 10,
    });

    const account = items.find(
      (row) => row.account_id.toLowerCase() === intent.accountId.toLowerCase(),
    );
    if (!account) {
      throw new ForbiddenException('account_not_owned');
    }

    const managerId = account.predict_manager_id?.trim().toLowerCase();
    if (!managerId || managerId !== intent.predictManagerId.toLowerCase()) {
      throw new ForbiddenException('predict_manager_mismatch');
    }
  }

  private async simulateAndExecute(
    tx: Transaction,
    label: string,
  ): Promise<TradeRelayResponse> {
    const simulation = await this.sui.tryDevInspect(tx);
    if (!simulation.ok) {
      throw new BadRequestException(simulationFailureMessage(simulation.error));
    }

    try {
      const digest = await this.sui.execute(tx);
      this.logger.log(`trade relay ${label} digest=${digest}`);
      return { digest };
    } catch (err) {
      logKeeperError(this.logger, `trade relay ${label}`, err);
      throw new ServiceUnavailableException('trade_relay_failed');
    }
  }
}
