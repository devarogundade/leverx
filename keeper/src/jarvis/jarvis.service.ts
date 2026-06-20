import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import type { JarvisConfig } from '../config/jarvis.config';
import { JarvisEventEntity } from '../database/entities/jarvis-event.entity';
import { JarvisSettingsEntity } from '../database/entities/jarvis-settings.entity';
import { IndexerService } from '../indexer/indexer.service';
import type { LeveragedPosition } from '../indexer/indexer.types';
import { logKeeperError, logKeeperWarn } from '../lib/keeper-log';
import { JarvisAiService } from './jarvis-ai.service';
import { JarvisDataService } from './jarvis-data.service';
import { JarvisGateway } from './jarvis.gateway';
import { JarvisScheduler } from './jarvis.processor';
import { JarvisTradeService } from './jarvis-trade.service';
import {
  JARVIS_DEFAULT_MAX_LEVERAGE,
  JARVIS_DEFAULT_MAX_OPEN_POSITIONS,
  JARVIS_DEFAULT_MAX_PORTFOLIO_PCT,
  JARVIS_DEFAULT_RISK_PROFILE,
} from './jarvis.constants';
import {
  JarvisEventRecordSchema,
  JarvisEventType,
  JarvisGuardrailsSchema,
  JarvisSettingsResponseSchema,
  JarvisStatusResponseSchema,
  parseJarvisEventMetadata,
  type JarvisAction,
  type JarvisEventRecord,
  type JarvisEventType as JarvisEventTypeValue,
  type JarvisGuardrails,
  type JarvisSettingsResponse,
  type JarvisStatusResponse,
  type JarvisUpdateSettingsBody,
} from './jarvis.schemas';

@Injectable()
export class JarvisService implements OnModuleInit {
  private readonly logger = new Logger(JarvisService.name);
  private readonly cfg: JarvisConfig;
  /** Prevents overlapping lifecycle runs for the same account (e.g. bootstrap + scheduler). */
  private readonly lifecycleLocks = new Map<string, Promise<void>>();

  constructor(
    config: ConfigService,
    @InjectRepository(JarvisSettingsEntity)
    private readonly settingsRepo: Repository<JarvisSettingsEntity>,
    @InjectRepository(JarvisEventEntity)
    private readonly eventsRepo: Repository<JarvisEventEntity>,
    private readonly ai: JarvisAiService,
    private readonly data: JarvisDataService,
    private readonly trade: JarvisTradeService,
    private readonly indexer: IndexerService,
    @Inject(forwardRef(() => JarvisScheduler))
    private readonly scheduler: JarvisScheduler,
    private readonly gateway: JarvisGateway,
  ) {
    this.cfg = config.get<JarvisConfig>('jarvis')!;
  }

  async onModuleInit(): Promise<void> {
    if (!this.cfg.enabled) {
      this.logger.warn('Jarvis disabled via JARVIS_ENABLED=false');
      return;
    }
    await this.scheduler.syncAllEnabledJobs();
  }

  isFeatureEnabled(): boolean {
    return this.cfg.enabled;
  }

  defaultGuardrails(): JarvisGuardrails {
    return JarvisGuardrailsSchema.parse({
      max_leverage: JARVIS_DEFAULT_MAX_LEVERAGE,
      max_portfolio_pct: JARVIS_DEFAULT_MAX_PORTFOLIO_PCT,
      max_open_positions: JARVIS_DEFAULT_MAX_OPEN_POSITIONS,
      risk_profile: JARVIS_DEFAULT_RISK_PROFILE,
      dry_run: false,
    });
  }

  guardrailsFromSettings(settings: JarvisSettingsEntity | null): JarvisGuardrails {
    if (!settings) return this.defaultGuardrails();
    const riskParsed = JarvisGuardrailsSchema.shape.risk_profile.safeParse(
      settings.risk_profile,
    );
    return JarvisGuardrailsSchema.parse({
      max_leverage: settings.max_leverage ?? JARVIS_DEFAULT_MAX_LEVERAGE,
      max_portfolio_pct: settings.max_portfolio_pct ?? JARVIS_DEFAULT_MAX_PORTFOLIO_PCT,
      max_open_positions: settings.max_open_positions ?? JARVIS_DEFAULT_MAX_OPEN_POSITIONS,
      risk_profile: riskParsed.success ? riskParsed.data : JARVIS_DEFAULT_RISK_PROFILE,
      dry_run: settings.dry_run ?? false,
    });
  }

  applyDefaultSettingsFields(settings: JarvisSettingsEntity): JarvisSettingsEntity {
    settings.max_leverage ??= JARVIS_DEFAULT_MAX_LEVERAGE;
    settings.max_portfolio_pct ??= JARVIS_DEFAULT_MAX_PORTFOLIO_PCT;
    settings.max_open_positions ??= JARVIS_DEFAULT_MAX_OPEN_POSITIONS;
    settings.risk_profile ??= JARVIS_DEFAULT_RISK_PROFILE;
    settings.dry_run ??= false;
    return settings;
  }

  async getSettings(owner: string, accountId: string): Promise<JarvisSettingsResponse> {
    const normalizedOwner = owner.trim().toLowerCase();
    const normalizedAccountId = accountId.trim().toLowerCase();
    const settings = await this.settingsRepo.findOne({
      where: { user_address: normalizedOwner, account_id: normalizedAccountId },
    });

    return JarvisSettingsResponseSchema.parse({
      enabled: settings?.enabled ?? false,
      user_address: settings?.user_address ?? normalizedOwner,
      account_id: settings?.account_id ?? normalizedAccountId,
      guardrails: this.guardrailsFromSettings(settings),
    });
  }

  async updateSettings(body: JarvisUpdateSettingsBody): Promise<JarvisSettingsResponse> {
    const normalizedOwner = body.owner.trim().toLowerCase();
    const normalizedAccountId = body.account_id.trim().toLowerCase();
    const now = String(Date.now());
    let settings = await this.settingsRepo.findOne({
      where: { user_address: normalizedOwner, account_id: normalizedAccountId },
    });

    if (!settings) {
      settings = this.settingsRepo.create({
        user_address: normalizedOwner,
        account_id: normalizedAccountId,
        enabled: false,
        created_at_ms: now,
        updated_at_ms: now,
        last_run_at_ms: null,
        welcome_sent: false,
        max_leverage: body.max_leverage ?? JARVIS_DEFAULT_MAX_LEVERAGE,
        max_portfolio_pct: body.max_portfolio_pct ?? JARVIS_DEFAULT_MAX_PORTFOLIO_PCT,
        max_open_positions: body.max_open_positions ?? JARVIS_DEFAULT_MAX_OPEN_POSITIONS,
        risk_profile: body.risk_profile ?? JARVIS_DEFAULT_RISK_PROFILE,
        dry_run: body.dry_run ?? false,
      });
    } else {
      if (body.max_leverage != null) settings.max_leverage = body.max_leverage;
      if (body.max_portfolio_pct != null) settings.max_portfolio_pct = body.max_portfolio_pct;
      if (body.max_open_positions != null) settings.max_open_positions = body.max_open_positions;
      if (body.risk_profile != null) settings.risk_profile = body.risk_profile;
      if (body.dry_run != null) settings.dry_run = body.dry_run;
      settings.updated_at_ms = now;
    }

    await this.settingsRepo.save(settings);
    return this.getSettings(normalizedOwner, normalizedAccountId);
  }

  async getStatus(owner: string, accountId: string): Promise<JarvisStatusResponse> {
    const normalizedOwner = owner.trim().toLowerCase();
    const normalizedAccountId = accountId.trim().toLowerCase();
    const settings = await this.settingsRepo.findOne({
      where: { user_address: normalizedOwner, account_id: normalizedAccountId },
    });

    const unread = await this.eventsRepo.count({
      where: {
        user_address: normalizedOwner,
        account_id: normalizedAccountId,
        read: false,
      },
    });

    const lastRunMs = settings?.last_run_at_ms
      ? Number(settings.last_run_at_ms)
      : null;
    const nextRunMs =
      settings?.enabled && lastRunMs
        ? lastRunMs + this.cfg.intervalMs
        : settings?.enabled
          ? Date.now() + this.cfg.intervalMs
          : null;

    const lastDecision = await this.eventsRepo.findOne({
      where: {
        user_address: normalizedOwner,
        account_id: normalizedAccountId,
        event_type: In([
          JarvisEventType.OPENING_POSITION,
          JarvisEventType.CLOSING_POSITION,
          JarvisEventType.REPAYING_DEBT,
        ]),
      },
      order: { created_at_ms: 'DESC' },
    });

    return JarvisStatusResponseSchema.parse({
      enabled: settings?.enabled ?? false,
      configured: this.cfg.enabled,
      user_address: settings?.user_address ?? normalizedOwner,
      account_id: settings?.account_id ?? normalizedAccountId,
      last_run_at_ms: lastRunMs,
      unread_count: unread,
      next_run_at_ms: nextRunMs,
      guardrails: this.guardrailsFromSettings(settings),
      last_decision_at_ms: lastDecision ? Number(lastDecision.created_at_ms) : null,
    });
  }

  async enable(owner: string, accountId: string): Promise<JarvisStatusResponse> {
    if (!this.cfg.enabled) {
      throw new NotFoundException('jarvis_disabled');
    }

    const normalizedOwner = owner.trim().toLowerCase();
    const normalizedAccountId = accountId.trim().toLowerCase();
    const now = String(Date.now());
    let settings = await this.settingsRepo.findOne({
      where: { user_address: normalizedOwner, account_id: normalizedAccountId },
    });

    if (!settings) {
      settings = this.settingsRepo.create({
        user_address: normalizedOwner,
        account_id: normalizedAccountId,
        enabled: true,
        created_at_ms: now,
        updated_at_ms: now,
        last_run_at_ms: null,
        welcome_sent: false,
        max_leverage: JARVIS_DEFAULT_MAX_LEVERAGE,
        max_portfolio_pct: JARVIS_DEFAULT_MAX_PORTFOLIO_PCT,
        max_open_positions: JARVIS_DEFAULT_MAX_OPEN_POSITIONS,
        risk_profile: JARVIS_DEFAULT_RISK_PROFILE,
        dry_run: false,
      });
    } else {
      settings.enabled = true;
      settings.updated_at_ms = now;
    }

    await this.settingsRepo.save(settings);
    await this.scheduler.registerAccountJob(normalizedOwner, normalizedAccountId);

    if (!settings.welcome_sent) {
      await this.emitEvent(normalizedOwner, normalizedAccountId, JarvisEventType.WELCOME, [
        "Hi — I'm Jarvis, your autonomous trading agent.",
        "I'll scan your positions every 5 minutes, close risky trades, and hunt for markets ending soon.",
        'Make sure the keeper is registered as your executor in Portfolio → Account.',
      ].join(' '), { first_time: true });
      settings.welcome_sent = true;
      await this.settingsRepo.save(settings);
    }

    await this.emitEvent(
      normalizedOwner,
      normalizedAccountId,
      JarvisEventType.ENABLED,
      'Jarvis activated — I will start managing your account on the next cycle.',
    );

    return this.getStatus(normalizedOwner, normalizedAccountId);
  }

  async disable(owner: string, accountId: string): Promise<JarvisStatusResponse> {
    const normalizedOwner = owner.trim().toLowerCase();
    const normalizedAccountId = accountId.trim().toLowerCase();
    const settings = await this.settingsRepo.findOne({
      where: { user_address: normalizedOwner, account_id: normalizedAccountId },
    });

    if (settings) {
      settings.enabled = false;
      settings.updated_at_ms = String(Date.now());
      await this.settingsRepo.save(settings);
    }

    await this.scheduler.removeAccountJob(normalizedAccountId);
    await this.emitEvent(
      normalizedOwner,
      normalizedAccountId,
      JarvisEventType.DISABLED,
      'Jarvis paused — I will stop autonomous trading until you turn me back on.',
    );

    return this.getStatus(normalizedOwner, normalizedAccountId);
  }

  async listEvents(
    owner: string,
    accountId: string,
    limit = 50,
    beforeMs?: number,
  ): Promise<JarvisEventRecord[]> {
    const normalizedOwner = owner.trim().toLowerCase();
    const normalizedAccountId = accountId.trim().toLowerCase();
    const rows = await this.eventsRepo.find({
      where: {
        user_address: normalizedOwner,
        account_id: normalizedAccountId,
        ...(beforeMs != null && beforeMs > 0
          ? { created_at_ms: LessThan(String(beforeMs)) }
          : {}),
      },
      order: { created_at_ms: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((row) => JarvisEventRecordSchema.parse(toEventRecord(row)));
  }

  async markRead(
    owner: string,
    accountId: string,
    eventIds?: string[],
  ): Promise<{ updated: number }> {
    const normalizedOwner = owner.trim().toLowerCase();
    const normalizedAccountId = accountId.trim().toLowerCase();
    if (eventIds?.length) {
      const result = await this.eventsRepo.update(
        {
          user_address: normalizedOwner,
          account_id: normalizedAccountId,
          id: In(eventIds),
        },
        { read: true },
      );
      const unread = await this.eventsRepo.count({
        where: {
          user_address: normalizedOwner,
          account_id: normalizedAccountId,
          read: false,
        },
      });
      this.gateway.broadcastUnread(normalizedOwner, normalizedAccountId, unread);
      return { updated: result.affected ?? 0 };
    }

    const result = await this.eventsRepo.update(
      { user_address: normalizedOwner, account_id: normalizedAccountId, read: false },
      { read: true },
    );
    const unread = await this.eventsRepo.count({
      where: {
        user_address: normalizedOwner,
        account_id: normalizedAccountId,
        read: false,
      },
    });
    this.gateway.broadcastUnread(normalizedOwner, normalizedAccountId, unread);
    return { updated: result.affected ?? 0 };
  }

  async runLifecycle(userAddress: string, accountId: string): Promise<void> {
    const normalizedAccountId = accountId.trim().toLowerCase();
    const inFlight = this.lifecycleLocks.get(normalizedAccountId);
    if (inFlight) {
      this.logger.debug(
        `jarvis lifecycle already running for ${normalizedAccountId} — skipping duplicate job`,
      );
      return;
    }

    const run = this.runLifecycleInner(userAddress, accountId).finally(() => {
      this.lifecycleLocks.delete(normalizedAccountId);
    });
    this.lifecycleLocks.set(normalizedAccountId, run);
    await run;
  }

  private async runLifecycleInner(
    userAddress: string,
    accountId: string,
  ): Promise<void> {
    const normalizedOwner = userAddress.trim().toLowerCase();
    const normalizedAccountId = accountId.trim().toLowerCase();
    const settings = await this.settingsRepo.findOne({
      where: { user_address: normalizedOwner, account_id: normalizedAccountId, enabled: true },
    });
    if (!settings) return;

    const now = Date.now();
    settings.last_run_at_ms = String(now);
    settings.updated_at_ms = String(now);
    await this.settingsRepo.save(settings);

    try {
      await this.emitEvent(
        normalizedOwner,
        normalizedAccountId,
        JarvisEventType.STARTING_UP,
        'Starting up — checking your trading account…',
      );

      const hardBlock = await this.checkHardPreconditions(normalizedAccountId);
      if (hardBlock) {
        await this.emitEvent(
          normalizedOwner,
          normalizedAccountId,
          hardBlock.eventType,
          hardBlock.message,
          hardBlock.metadata,
        );
        await this.emitEvent(
          normalizedOwner,
          normalizedAccountId,
          JarvisEventType.SKIPPED,
          'Skipped this cycle — fix the issue above and I will retry in about 5 minutes.',
          { reason: hardBlock.eventType },
        );
        await this.emitEvent(
          normalizedOwner,
          normalizedAccountId,
          JarvisEventType.CYCLE_COMPLETE,
          'Cycle complete — I will check back in about 5 minutes.',
          { next_run_at_ms: now + this.cfg.intervalMs, skipped: true },
        );
        return;
      }

      if (!this.ai.isConfigured()) {
        await this.emitEvent(
          normalizedOwner,
          normalizedAccountId,
          JarvisEventType.ERROR,
          'Anthropic API key is required for Jarvis trading decisions. Set ANTHROPIC_API_KEY and retry.',
          { reason: 'ai_not_configured' },
        );
        await this.emitEvent(
          normalizedOwner,
          normalizedAccountId,
          JarvisEventType.SKIPPED,
          'Skipped this cycle — AI analysis is required for autonomous trading.',
          { reason: 'ai_not_configured' },
        );
        await this.emitEvent(
          normalizedOwner,
          normalizedAccountId,
          JarvisEventType.CYCLE_COMPLETE,
          'Cycle complete — I will check back in about 5 minutes.',
          { next_run_at_ms: now + this.cfg.intervalMs, skipped: true },
        );
        return;
      }

      const guardrails = this.guardrailsFromSettings(settings);
      const platformRules = this.data.getPlatformRules();
      const tradeReadiness = await this.getTradeReadiness(
        normalizedAccountId,
        guardrails,
        platformRules.min_margin_usd,
      );
      const systemContext = {
        jarvis_enabled: true,
        last_run_at_ms: settings.last_run_at_ms
          ? Number(settings.last_run_at_ms)
          : null,
        interval_ms: this.cfg.intervalMs,
        platform_rules: platformRules,
        user_guardrails: guardrails,
      };

      await this.runPositionPhase(
        normalizedOwner,
        normalizedAccountId,
        systemContext,
        guardrails,
        tradeReadiness.canOpen,
      );

      if (!tradeReadiness.canOpen) {
        if (tradeReadiness.reason === 'max_positions') {
          await this.emitEvent(
            normalizedOwner,
            normalizedAccountId,
            JarvisEventType.SKIPPED,
            `Max open positions (${guardrails.max_open_positions}) reached — skipping market scan.`,
            { reason: 'max_positions' },
          );
        }
        // low_balance: position phase already explains; skip market AI to avoid noise and API cost.
      } else {
        await this.runMarketPhase(
          normalizedOwner,
          normalizedAccountId,
          systemContext,
          guardrails,
        );
      }

      await this.emitEvent(
        normalizedOwner,
        normalizedAccountId,
        JarvisEventType.CYCLE_COMPLETE,
        'Cycle complete — I will check back in about 5 minutes.',
        { next_run_at_ms: now + this.cfg.intervalMs },
      );
    } catch (err) {
      logKeeperError(this.logger, `jarvis lifecycle ${normalizedAccountId}`, err);
      await this.emitEvent(
        normalizedOwner,
        normalizedAccountId,
        JarvisEventType.ERROR,
        'Something went wrong during this cycle. I will try again in about 5 minutes.',
      );
      await this.emitEvent(
        normalizedOwner,
        normalizedAccountId,
        JarvisEventType.CYCLE_COMPLETE,
        'Cycle complete — I will check back in about 5 minutes.',
        { next_run_at_ms: now + this.cfg.intervalMs, skipped: true },
      );
    } finally {
      await this.syncFastScheduler(
        normalizedOwner,
        normalizedAccountId,
        settings.enabled,
      );
    }
  }

  private async getTradeReadiness(
    accountId: string,
    guardrails: JarvisGuardrails,
    minMarginUsd: number,
  ): Promise<{
    canOpen: boolean;
    balanceUsd: number;
    reason?: 'low_balance' | 'max_positions';
  }> {
    const balanceAtoms = await this.trade.fetchTradingBalanceAtoms(accountId);
    const balanceUsd = this.trade.formatBalanceUsd(balanceAtoms);

    if (balanceUsd < minMarginUsd) {
      return { canOpen: false, balanceUsd, reason: 'low_balance' };
    }

    let openPositionCount = 0;
    try {
      const detail = await this.indexer.fetchAccount(accountId);
      openPositionCount = (detail.open_positions ?? []).filter(
        (p) => BigInt(p.open_quantity || 0) > 0n,
      ).length;
    } catch (err) {
      logKeeperWarn(this.logger, `jarvis trade readiness ${accountId}`, err);
    }

    if (openPositionCount >= guardrails.max_open_positions) {
      return { canOpen: false, balanceUsd, reason: 'max_positions' };
    }

    return { canOpen: true, balanceUsd };
  }

  private async checkHardPreconditions(
    accountId: string,
  ): Promise<{
    eventType: JarvisEventTypeValue;
    message: string;
    metadata?: unknown;
  } | null> {
    let detail: Awaited<ReturnType<IndexerService['fetchAccount']>> | null = null;
    try {
      detail = await this.indexer.fetchAccount(accountId);
    } catch (err) {
      logKeeperWarn(this.logger, `jarvis fetch account ${accountId}`, err);
      return {
        eventType: JarvisEventType.ACCOUNT_REQUIRED,
        message: 'You need a trading account before I can manage your portfolio.',
      };
    }

    if (!detail?.account) {
      return {
        eventType: JarvisEventType.ACCOUNT_REQUIRED,
        message: 'You need a trading account before I can manage your portfolio.',
      };
    }

    const isExecutor = await this.trade.isKeeperRegisteredExecutor(accountId);
    if (!isExecutor) {
      return {
        eventType: JarvisEventType.EXECUTOR_REQUIRED,
        message:
          'Register the keeper as executor in Portfolio → Account so I can trade for you.',
      };
    }

    return null;
  }

  private async syncFastScheduler(
    owner: string,
    accountId: string,
    enabled: boolean,
  ): Promise<void> {
    if (!enabled) {
      await this.scheduler.removeFastAccountJob(accountId);
      return;
    }

    try {
      const snapshot = await this.data.getAccountSnapshot(owner, accountId);
      const needsFast = snapshot.open_positions.some(
        (p) => p.at_risk_of_force_deleverage || p.in_final_window,
      );
      if (needsFast) {
        await this.scheduler.registerFastAccountJob(owner, accountId);
      } else {
        await this.scheduler.removeFastAccountJob(accountId);
      }
    } catch (err) {
      logKeeperWarn(this.logger, `jarvis fast scheduler sync ${accountId}`, err);
    }
  }

  private async runPositionPhase(
    owner: string,
    accountId: string,
    systemContext: {
      jarvis_enabled: boolean;
      last_run_at_ms: number | null;
      interval_ms: number;
      platform_rules: ReturnType<JarvisDataService['getPlatformRules']>;
      user_guardrails: JarvisGuardrails;
    },
    guardrails: JarvisGuardrails,
    canOpenNewTrades: boolean,
  ): Promise<void> {
    await this.emitEvent(
      owner,
      accountId,
      JarvisEventType.ANALYZING_TRADES,
      'Analyzing your open positions…',
    );

    const decision = await this.ai.runPhase({
      phase: 'positions',
      owner,
      accountId,
      systemContext,
    });

    if (!decision) {
      await this.emitEvent(
        owner,
        accountId,
        JarvisEventType.ERROR,
        'AI position analysis failed — I will retry on the next cycle.',
      );
      return;
    }

    if (decision.summary_message) {
      await this.emitEvent(
        owner,
        accountId,
        JarvisEventType.RUNNING,
        decision.summary_message,
        { phase: 'positions', action_count: decision.actions.length },
      );
    }

    let positions: LeveragedPosition[] = [];
    try {
      const detail = await this.indexer.fetchAccount(accountId);
      positions = (detail.open_positions ?? []).filter(
        (p) => BigInt(p.open_quantity || 0) > 0n,
      );
    } catch (err) {
      logKeeperWarn(this.logger, `jarvis fetch positions ${accountId}`, err);
      await this.emitEvent(
        owner,
        accountId,
        JarvisEventType.ERROR,
        'Could not load open positions — I will retry on the next cycle.',
      );
      return;
    }

    if (
      positions.length === 0 &&
      decision.actions.every((a) => a.type === 'skip' || a.type === 'hold')
    ) {
      if (!decision.summary_message) {
        const idleFallback = canOpenNewTrades
          ? 'No open positions — moving on to market scan.'
          : 'No open positions — nothing to manage this cycle.';
        await this.emitEvent(
          owner,
          accountId,
          JarvisEventType.RUNNING,
          decision.actions[0]?.user_message ?? idleFallback,
        );
      }
      return;
    }

    for (const action of decision.actions) {
      await this.executeAction(owner, accountId, action, positions, guardrails);
    }
  }

  private async runMarketPhase(
    owner: string,
    accountId: string,
    systemContext: {
      jarvis_enabled: boolean;
      last_run_at_ms: number | null;
      interval_ms: number;
      platform_rules: ReturnType<JarvisDataService['getPlatformRules']>;
      user_guardrails: JarvisGuardrails;
    },
    guardrails: JarvisGuardrails,
  ): Promise<void> {
    await this.emitEvent(
      owner,
      accountId,
      JarvisEventType.ANALYZING_MARKETS,
      'Finding the best market opportunities…',
    );

    const decision = await this.ai.runPhase({
      phase: 'markets',
      owner,
      accountId,
      systemContext,
    });

    if (!decision) {
      await this.emitEvent(
        owner,
        accountId,
        JarvisEventType.ERROR,
        'AI market analysis failed — I will retry on the next cycle.',
      );
      return;
    }

    const openActions = decision.actions.filter((a) => a.type === 'open');
    const informational = decision.actions.filter(
      (a) => a.type === 'hold' || a.type === 'skip',
    );

    if (openActions.length === 0) {
      const message =
        informational[0]?.user_message ??
        decision.summary_message ??
        'No trade this cycle — checking back later.';
      await this.emitEvent(owner, accountId, JarvisEventType.NO_OPPORTUNITY, message, {
        phase: 'markets',
        action_count: decision.actions.length,
      });
      return;
    }

    if (decision.summary_message) {
      await this.emitEvent(
        owner,
        accountId,
        JarvisEventType.RUNNING,
        decision.summary_message,
        { phase: 'markets' },
      );
    }

    for (const action of openActions) {
      await this.executeOpenAction(owner, accountId, action, guardrails);
    }
  }

  private async executeAction(
    owner: string,
    accountId: string,
    action: JarvisAction,
    positions: LeveragedPosition[],
    guardrails: JarvisGuardrails,
  ): Promise<void> {
    const metadata = {
      reasoning: action.reasoning,
      confidence: action.confidence,
      action_type: action.type,
      leverage: action.leverage,
      portfolio_pct: action.portfolio_pct,
      dry_run: guardrails.dry_run || undefined,
    };

    switch (action.type) {
      case 'hold':
      case 'skip':
        await this.emitEvent(owner, accountId, JarvisEventType.RUNNING, action.user_message, metadata);
        return;

      case 'close': {
        const position = this.resolvePosition(action, positions);
        if (!position) {
          await this.emitEvent(
            owner,
            accountId,
            JarvisEventType.ERROR,
            `Could not find position to close: ${action.position_id ?? 'unknown'}`,
            metadata,
          );
          return;
        }

        const closeMessage = guardrails.dry_run
          ? `[DRY RUN] ${action.user_message}`
          : action.user_message;

        await this.emitEvent(
          owner,
          accountId,
          JarvisEventType.CLOSING_POSITION,
          closeMessage,
          { ...metadata, position_key: position.position_key },
        );

        if (guardrails.dry_run) {
          await this.emitEvent(
            owner,
            accountId,
            JarvisEventType.RUNNING,
            '[DRY RUN] Would close position — no trade executed.',
            { ...metadata, position_key: position.position_key, dry_run: true },
          );
          return;
        }

        try {
          const digest = await this.trade.closePosition(position);
          await this.emitEvent(
            owner,
            accountId,
            JarvisEventType.RUNNING,
            `Position closed successfully.`,
            { digest, position_key: position.position_key },
          );
        } catch (err) {
          await this.emitTradeFailure(
            owner,
            accountId,
            err,
            'Failed to close position — I will retry on the next cycle.',
          );
        }
        return;
      }

      case 'partial_repay': {
        const position = this.resolvePosition(action, positions);
        if (!position) {
          await this.emitEvent(
            owner,
            accountId,
            JarvisEventType.ERROR,
            `Could not find position to de-risk: ${action.position_id ?? 'unknown'}`,
            metadata,
          );
          return;
        }

        const repayMessage = guardrails.dry_run
          ? `[DRY RUN] ${action.user_message}`
          : action.user_message;

        await this.emitEvent(
          owner,
          accountId,
          JarvisEventType.REPAYING_DEBT,
          repayMessage,
          { ...metadata, position_key: position.position_key },
        );

        if (guardrails.dry_run) {
          await this.emitEvent(
            owner,
            accountId,
            JarvisEventType.RUNNING,
            '[DRY RUN] Would partially repay debt — no trade executed.',
            { ...metadata, position_key: position.position_key, dry_run: true },
          );
          return;
        }

        try {
          const digest = await this.trade.partialRepay(position);
          await this.emitEvent(
            owner,
            accountId,
            JarvisEventType.RUNNING,
            `Partial de-risk complete — debt reduced.`,
            { digest, position_key: position.position_key },
          );
        } catch (err) {
          await this.emitTradeFailure(
            owner,
            accountId,
            err,
            'Failed to reduce position debt — I will retry on the next cycle.',
          );
        }
        return;
      }

      case 'open':
        await this.executeOpenAction(owner, accountId, action, guardrails);
        return;
    }
  }

  private async executeOpenAction(
    owner: string,
    accountId: string,
    action: JarvisAction,
    guardrails: JarvisGuardrails,
  ): Promise<void> {
    if (!action.oracle_id || !action.direction) {
      await this.emitEvent(
        owner,
        accountId,
        JarvisEventType.ERROR,
        'Open action missing oracle_id or direction.',
        { reasoning: action.reasoning },
      );
      return;
    }

    const balanceAtoms = await this.trade.fetchTradingBalanceAtoms(accountId);
    const balanceUsd = this.trade.formatBalanceUsd(balanceAtoms);

    if (balanceUsd <= 0) {
      await this.emitEvent(
        owner,
        accountId,
        JarvisEventType.NO_FUNDS,
        action.user_message || 'No funds available — deposit USDC to get started.',
        { balance_usd: balanceUsd },
      );
      return;
    }

    let openPositionCount = 0;
    try {
      const detail = await this.indexer.fetchAccount(accountId);
      openPositionCount = (detail.open_positions ?? []).filter(
        (p) => BigInt(p.open_quantity || 0) > 0n,
      ).length;
    } catch (err) {
      logKeeperWarn(this.logger, `jarvis count positions ${accountId}`, err);
    }

    if (openPositionCount >= guardrails.max_open_positions) {
      await this.emitEvent(
        owner,
        accountId,
        JarvisEventType.SKIPPED,
        `Max open positions (${guardrails.max_open_positions}) reached — skipping new trade.`,
        {
          reasoning: action.reasoning,
          confidence: action.confidence,
          action_type: 'open',
        },
      );
      return;
    }

    const portfolioPct = Math.min(
      action.portfolio_pct ?? 0,
      guardrails.max_portfolio_pct,
    );

    let maxLeverageForTime = guardrails.max_leverage;
    try {
      const detail = await this.data.getMarketDetail(action.oracle_id);
      if (detail.candidate?.max_leverage_for_time != null) {
        maxLeverageForTime = detail.candidate.max_leverage_for_time;
      }
    } catch (err) {
      logKeeperWarn(this.logger, `jarvis open leverage cap ${action.oracle_id}`, err);
    }

    const leverage = Math.min(
      action.leverage ?? 1,
      guardrails.max_leverage,
      maxLeverageForTime,
    );
    const marginUsd = Math.max(
      0.1,
      (balanceUsd * portfolioPct) / 100,
    );
    const side = action.direction === 'UP' ? 'up' : 'down';

    const openMetadata = {
      oracle_id: action.oracle_id,
      side,
      margin_usd: marginUsd,
      leverage,
      portfolio_pct: portfolioPct,
      confidence: action.confidence,
      reasoning: action.reasoning,
      dry_run: guardrails.dry_run || undefined,
    };

    const openMessage = guardrails.dry_run
      ? `[DRY RUN] ${action.user_message}`
      : action.user_message;

    await this.emitEvent(
      owner,
      accountId,
      JarvisEventType.OPENING_POSITION,
      openMessage,
      openMetadata,
    );

    if (guardrails.dry_run) {
      await this.emitEvent(
        owner,
        accountId,
        JarvisEventType.RUNNING,
        `[DRY RUN] Would open ${action.direction} position at ${leverage}× with ${portfolioPct}% of balance.`,
        { ...openMetadata, dry_run: true },
      );
      return;
    }

    const quoteCheck = await this.trade.validateOpenQuote({
      oracleId: action.oracle_id,
      side,
      marginUsd,
      leverage,
    });
    if (!quoteCheck.ok) {
      await this.emitEvent(
        owner,
        accountId,
        JarvisEventType.ERROR,
        `Quote unavailable or slippage too high — skipped open (${quoteCheck.reason}).`,
        openMetadata,
      );
      return;
    }

    try {
      const result = await this.trade.openTrade({
        accountId,
        oracleId: action.oracle_id,
        side,
        marginUsd,
        leverage,
      });
      await this.emitEvent(
        owner,
        accountId,
        JarvisEventType.RUNNING,
        `Opened ${action.direction} position.`,
        { ...result },
      );
    } catch (err) {
      await this.emitTradeFailure(
        owner,
        accountId,
        err,
        'Failed to open position — I will retry on the next cycle.',
      );
    }
  }

  private resolvePosition(
    action: JarvisAction,
    positions: LeveragedPosition[],
  ): LeveragedPosition | undefined {
    if (!action.position_id) return undefined;
    const key = action.position_id.trim().toLowerCase();
    return positions.find(
      (p) =>
        p.position_key.toLowerCase() === key ||
        p.oracle_id.toLowerCase() === key,
    );
  }

  private classifyTradeError(err: unknown): {
    eventType: JarvisEventTypeValue;
    message: string;
  } | null {
    const code = extractJarvisErrorCode(err);
    if (code.includes('keeper_not_registered_executor')) {
      return {
        eventType: JarvisEventType.EXECUTOR_REQUIRED,
        message:
          'Register the keeper as executor in Portfolio → Account so I can trade for you.',
      };
    }
    if (code.includes('insufficient_trading_balance')) {
      return {
        eventType: JarvisEventType.LOW_BALANCE,
        message: 'Your account balance is too low to complete this trade.',
      };
    }
    if (code.includes('keeper_not_configured') || code.includes('trading_paused')) {
      return {
        eventType: JarvisEventType.SKIPPED,
        message: 'Trading is temporarily unavailable — I will retry on the next cycle.',
      };
    }
    return null;
  }

  private async emitTradeFailure(
    owner: string,
    accountId: string,
    err: unknown,
    fallback: string,
  ): Promise<void> {
    const classified = this.classifyTradeError(err);
    if (classified) {
      await this.emitEvent(owner, accountId, classified.eventType, classified.message);
      return;
    }
    logKeeperWarn(
      this.logger,
      `jarvis trade failed ${accountId}`,
      err,
    );
    await this.emitEvent(owner, accountId, JarvisEventType.ERROR, fallback);
  }

  private async emitEvent(
    owner: string,
    accountId: string,
    eventType: JarvisEventTypeValue,
    message: string,
    metadata?: unknown,
  ): Promise<JarvisEventRecord> {
    const validatedMetadata = parseJarvisEventMetadata(eventType, metadata);
    const row = this.eventsRepo.create({
      user_address: owner,
      account_id: accountId,
      event_type: eventType,
      message,
      metadata: validatedMetadata,
      read: false,
      created_at_ms: String(Date.now()),
    });
    const saved = await this.eventsRepo.save(row);
    const record = JarvisEventRecordSchema.parse(toEventRecord(saved));
    const unread = await this.eventsRepo.count({
      where: {
        user_address: owner,
        account_id: accountId,
        read: false,
      },
    });
    this.gateway.broadcastEvent(record);
    this.gateway.broadcastUnread(owner, accountId, unread);
    return record;
  }
}

function extractJarvisErrorCode(err: unknown): string {
  let code = '';
  if (err && typeof err === 'object') {
    if ('getResponse' in err && typeof err.getResponse === 'function') {
      const response = (err as { getResponse: () => unknown }).getResponse();
      if (typeof response === 'string') {
        code = response;
      } else if (response && typeof response === 'object' && 'message' in response) {
        const msg = (response as { message?: string | string[] }).message;
        code = Array.isArray(msg) ? msg.join(' ') : String(msg ?? '');
      } else if (response && typeof response === 'object' && 'error' in response) {
        code = String((response as { error?: unknown }).error ?? '');
      }
    } else if ('message' in err && typeof err.message === 'string') {
      code = err.message;
    }
  }
  if (!code) code = String(err ?? '');
  return code;
}

function toEventRecord(row: JarvisEventEntity): JarvisEventRecord {
  return {
    id: row.id,
    user_address: row.user_address,
    account_id: row.account_id,
    event_type: row.event_type,
    message: row.message,
    metadata: row.metadata,
    read: row.read,
    created_at_ms: row.created_at_ms,
  };
}
