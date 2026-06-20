import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Transaction } from '@mysten/sui/transactions';
import { withAppAuth, type AppAuthPayload, type AppAuthResponse } from '../auth/app-auth.types';
import { intentReplayKey, resolveIntentAuth, type SignedIntentPayload } from '../auth/app-intent-auth';
import { AppJwtService } from '../auth/app-jwt.service';
import { IndexerService } from '../indexer/indexer.service';
import { logKeeperError } from '../lib/keeper-log';
import { PredictQuoteService } from '../sui/predict-quote.service';
import { PtbBuilderService } from '../sui/ptb-builder.service';
import { SuiService } from '../sui/sui.service';
import {
  verifyMintIntentAuth,
  verifyRedeemIntentAuth,
  verifySettleIntentAuth,
  verifyRecoverManagerIntentAuth,
} from './trade-auth';
import {
  assertTradeIntentExpiry,
  parseMintIntentMessage,
  parseRedeemIntentMessage,
  parseSettleIntentMessage,
  parseRecoverManagerIntentMessage,
} from './trade-message';
import type {
  MintIntentFields,
  RedeemIntentFields,
  SettleIntentFields,
  RecoverManagerIntentFields,
} from './trade-message';
import { TradeReplayStore } from './trade-replay.store';
import type {
  MintTradeBody,
  RedeemTradeBody,
  SettleTradeBody,
  RecoverManagerTradeBody,
  TradeRelayResponse,
} from './trade.types';
import { simulationFailureMessage } from '../lib/move-abort';

type VerifiedTradeRequest<T> = {
  intent: T;
  auth?: AppAuthResponse;
};

@Injectable()
export class TradeService {
  private readonly logger = new Logger(TradeService.name);

  constructor(
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
    private readonly quotes: PredictQuoteService,
    private readonly indexer: IndexerService,
    private readonly replayStore: TradeReplayStore,
    private readonly appJwt: AppJwtService,
  ) {}

  async relayMint(
    body: MintTradeBody,
    bearerToken?: string,
  ): Promise<TradeRelayResponse> {
    const { intent, auth } = await this.verifyMintRequest(body, bearerToken);
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

    return this.simulateAndExecute(tx, `mint ${intent.accountId}`, auth);
  }

  async relayRedeem(
    body: RedeemTradeBody,
    bearerToken?: string,
  ): Promise<TradeRelayResponse> {
    const { intent, auth } = await this.verifyRedeemRequest(body, bearerToken);
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

    return this.simulateAndExecute(tx, `redeem ${intent.accountId}`, auth);
  }

  async relaySettle(
    body: SettleTradeBody,
    bearerToken?: string,
  ): Promise<TradeRelayResponse> {
    const { intent, auth } = await this.verifySettleRequest(body, bearerToken);
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

    return this.simulateAndExecute(tx, `settle ${intent.accountId}`, auth);
  }

  async relayRecoverManager(
    body: RecoverManagerTradeBody,
    bearerToken?: string,
  ): Promise<TradeRelayResponse> {
    const { intent, auth } = await this.verifyRecoverManagerRequest(
      body,
      bearerToken,
    );
    await this.assertRelayReady();
    await this.assertAccountOwnership(intent);
    await this.assertRecoverManagerPreconditions(intent);

    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildRecoverManagerSurplus(cfg, {
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
      managerQuoteAtoms: intent.managerQuoteAtoms,
    });

    return this.simulateAndExecute(tx, `recover_manager ${intent.accountId}`, auth);
  }

  private async verifyMintRequest(
    body: MintTradeBody,
    bearerToken?: string,
  ): Promise<VerifiedTradeRequest<MintIntentFields>> {
    return this.verifyTradeRequest(
      body,
      bearerToken,
      parseMintIntentMessage,
      verifyMintIntentAuth,
    );
  }

  private async verifyRedeemRequest(
    body: RedeemTradeBody,
    bearerToken?: string,
  ): Promise<VerifiedTradeRequest<RedeemIntentFields>> {
    return this.verifyTradeRequest(
      body,
      bearerToken,
      parseRedeemIntentMessage,
      verifyRedeemIntentAuth,
    );
  }

  private async verifySettleRequest(
    body: SettleTradeBody,
    bearerToken?: string,
  ): Promise<VerifiedTradeRequest<SettleIntentFields>> {
    return this.verifyTradeRequest(
      body,
      bearerToken,
      parseSettleIntentMessage,
      verifySettleIntentAuth,
    );
  }

  private async verifyRecoverManagerRequest(
    body: RecoverManagerTradeBody,
    bearerToken?: string,
  ): Promise<VerifiedTradeRequest<RecoverManagerIntentFields>> {
    const verified = await this.verifyTradeRequest(
      body,
      bearerToken,
      parseRecoverManagerIntentMessage,
      verifyRecoverManagerIntentAuth,
    );
    if (verified.intent.managerQuoteAtoms <= 0n) {
      throw new BadRequestException('zero_amount');
    }
    return verified;
  }

  private async verifyTradeRequest<T extends { address: string; expiresAtMs: number }>(
    body: AppAuthPayload,
    bearerToken: string | undefined,
    parseMessage: (bytes: Uint8Array) => T,
    verifySigned: (payload: SignedIntentPayload, network: string) => Promise<T>,
  ): Promise<VerifiedTradeRequest<T>> {
    try {
      this.assertIntentNotReplayed(body);
      const result = await resolveIntentAuth({
        payload: body,
        bearerToken,
        parseMessage,
        assertExpiry: assertTradeIntentExpiry,
        verifySigned,
        jwt: this.appJwt,
        network: this.sui.getSuiNetwork(),
      });
      this.replayStore.markUsed(
        intentReplayKey(body),
        result.intent.expiresAtMs,
      );
      return {
        intent: result.intent,
        auth:
          result.authMethod === 'signed'
            ? this.appJwt.issue(result.intent.address)
            : undefined,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      const code = err instanceof Error ? err.message : 'invalid_auth';
      throw new BadRequestException(code);
    }
  }

  private assertIntentNotReplayed(body: AppAuthPayload): void {
    if (this.replayStore.isReplayed(intentReplayKey(body))) {
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
    intent:
      | MintIntentFields
      | RedeemIntentFields
      | SettleIntentFields
      | RecoverManagerIntentFields,
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

  /** Mirrors on-chain checks in `trade::recover_manager_surplus_to_trading_*`. */
  private async assertRecoverManagerPreconditions(
    intent: RecoverManagerIntentFields,
  ): Promise<void> {
    const key = {
      oracleId: intent.oracleId,
      expiryMs: intent.expiryMs,
      strike: intent.strike,
      higherStrike: intent.higherStrike,
      isUp: intent.isUp,
      isRange: intent.isRange,
    };

    const [openQty, managerBalance] = await Promise.all([
      this.quotes.fetchManagerOpenQuantity(intent.predictManagerId, key),
      this.quotes.fetchManagerQuoteBalance(intent.predictManagerId),
    ]);

    if (openQty != null && openQty > 0n) {
      throw new BadRequestException('open_contracts_remain');
    }

    if (managerBalance == null) {
      throw new BadRequestException('manager_balance_unavailable');
    }

    if (intent.managerQuoteAtoms > managerBalance) {
      throw new BadRequestException('recovery_amount_exceeds_balance');
    }
  }

  private async simulateAndExecute(
    tx: Transaction,
    label: string,
    auth?: AppAuthResponse,
  ): Promise<TradeRelayResponse> {
    const simulation = await this.sui.tryDevInspect(tx);
    if (!simulation.ok) {
      throw new BadRequestException(simulationFailureMessage(simulation.error));
    }

    try {
      const digest = await this.sui.execute(tx);
      this.logger.log(`trade relay ${label} digest=${digest}`);
      return withAppAuth({ digest }, auth);
    } catch (err) {
      logKeeperError(this.logger, `trade relay ${label}`, err);
      throw new ServiceUnavailableException('trade_relay_failed');
    }
  }
}
