import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAnthropic } from '@langchain/anthropic';
import { DynamicStructuredTool } from '@langchain/core/tools';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { z } from 'zod';
import type { JarvisConfig } from '../config/jarvis.config';
import {
  JarvisDecisionSchema,
  JarvisInitialContextSchema,
  JarvisPhaseRequestSchema,
  type JarvisDecision,
  type JarvisPhaseRequest,
} from './jarvis.schemas';
import { JarvisDataService } from './jarvis-data.service';
import { getFullJarvisKnowledgeBase } from './jarvis-knowledge';
import { createJarvisTools } from './tools/jarvis-tools';

const MAX_AGENT_ITERATIONS = 10;
const LLM_RETRY_BACKOFF_MS = 2000;

function isTransientLlmError(err: unknown): boolean {
  const message = String(err ?? '').toLowerCase();
  if (message.includes('429') || message.includes('rate limit')) return true;
  if (message.includes('500') || message.includes('502') || message.includes('503')) return true;
  if (message.includes('529') || message.includes('overloaded')) return true;
  if (err && typeof err === 'object' && 'status' in err) {
    const status = Number((err as { status?: number }).status);
    if (status === 429 || (status >= 500 && status < 600)) return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type { JarvisPhaseRequest };

@Injectable()
export class JarvisAiService {
  private readonly logger = new Logger(JarvisAiService.name);
  private readonly cfg: JarvisConfig;

  constructor(
    config: ConfigService,
    private readonly data: JarvisDataService,
  ) {
    this.cfg = config.get<JarvisConfig>('jarvis')!;
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.anthropicApiKey);
  }

  async runPhase(request: JarvisPhaseRequest): Promise<JarvisDecision | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const parsedRequest = JarvisPhaseRequestSchema.parse(request);
    let decision: JarvisDecision | null = null;
    const tools = createJarvisTools({
      owner: parsedRequest.owner,
      accountId: parsedRequest.accountId,
      phase: parsedRequest.phase,
      systemContext: parsedRequest.systemContext,
      data: this.data,
      onDecision: (value) => {
        const parsed = JarvisDecisionSchema.safeParse(value);
        if (parsed.success) {
          decision = parsed.data;
        } else {
          this.logger.warn(
            `Jarvis decision validation failed (${parsedRequest.phase}): ${parsed.error.message}`,
          );
        }
      },
    });

    const llm = new ChatAnthropic({
      apiKey: this.cfg.anthropicApiKey!,
      model: this.cfg.model,
      temperature: 0.2,
      maxTokens: 4096,
    }).bindTools(tools);

    const initialContext = await this.buildInitialContext(parsedRequest).catch((err) => {
      this.logger.warn(
        `Jarvis initial context failed (${parsedRequest.phase}): ${String(err)}`,
      );
      return null;
    });
    if (!initialContext) {
      return null;
    }

    const systemPrompt = this.buildSystemPrompt(parsedRequest.phase, parsedRequest.systemContext.user_guardrails);
    const humanPrompt = this.buildHumanPrompt(parsedRequest, initialContext);

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt),
    ];

    const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

    try {
      for (let step = 0; step < MAX_AGENT_ITERATIONS; step++) {
        const response = await this.invokeLlmWithRetry(llm, messages);
        messages.push(response);

        const toolCalls = response.tool_calls ?? [];
        if (toolCalls.length === 0) {
          break;
        }

        for (const toolCall of toolCalls) {
          const tool = toolsByName[toolCall.name];
          if (!tool) {
            messages.push(
              new ToolMessage({
                tool_call_id: toolCall.id ?? toolCall.name,
                content: JSON.stringify({ error: `unknown_tool:${toolCall.name}` }),
              }),
            );
            continue;
          }

          const result = await (tool as DynamicStructuredTool).invoke(toolCall.args ?? {});
          messages.push(
            new ToolMessage({
              tool_call_id: toolCall.id ?? toolCall.name,
              content: typeof result === 'string' ? result : JSON.stringify(result),
            }),
          );
        }

        if (decision) {
          return JarvisDecisionSchema.parse(decision);
        }
      }
    } catch (err) {
      this.logger.warn(`Jarvis agent failed (${parsedRequest.phase}): ${String(err)}`);
      return null;
    }

    if (decision) {
      const parsed = JarvisDecisionSchema.safeParse(decision);
      if (parsed.success) {
        return parsed.data;
      }
      this.logger.warn(
        `Jarvis decision validation failed (${parsedRequest.phase}): ${parsed.error.message}`,
      );
    }

    return null;
  }

  private async buildInitialContext(
    request: JarvisPhaseRequest,
  ): Promise<z.infer<typeof JarvisInitialContextSchema>> {
    const account = await this.data.getAccountSnapshot(request.owner, request.accountId);
    const platformRules = this.data.getPlatformRules();

    if (request.phase === 'positions') {
      return JarvisInitialContextSchema.parse({
        system: request.systemContext,
        account,
        platform_rules: platformRules,
      });
    }

    const market_candidates = await this.data.buildMarketsInitialBundle();

    return JarvisInitialContextSchema.parse({
      system: request.systemContext,
      account,
      platform_rules: platformRules,
      market_candidates,
    });
  }

  private async invokeLlmWithRetry(
    llm: ReturnType<ChatAnthropic['bindTools']>,
    messages: BaseMessage[],
  ): Promise<AIMessage> {
    try {
      return (await llm.invoke(messages)) as AIMessage;
    } catch (err) {
      if (!isTransientLlmError(err)) throw err;
      this.logger.warn(`Jarvis LLM transient error, retrying once: ${String(err)}`);
      await sleep(LLM_RETRY_BACKOFF_MS);
      return (await llm.invoke(messages)) as AIMessage;
    }
  }

  private buildSystemPrompt(
    phase: 'positions' | 'markets',
    guardrails: JarvisPhaseRequest['systemContext']['user_guardrails'],
  ): string {
    const phaseGoal =
      phase === 'positions'
        ? 'Review every open position and decide whether to hold, partially repay debt, close, or skip.'
        : 'Scan candidate markets ending soon and decide whether to open a new UP or DOWN trade or skip.';

    const knowledgeBase = getFullJarvisKnowledgeBase();

    const riskHint =
      guardrails.risk_profile === 'conservative'
        ? 'User prefers conservative risk — favor lower leverage, smaller portfolio_pct, and early de-risking.'
        : guardrails.risk_profile === 'aggressive'
          ? 'User accepts higher risk — you may use higher leverage and portfolio_pct within their caps.'
          : 'User prefers balanced risk — moderate leverage and sizing within their caps.';

    return [
      'You are Jarvis, LeverX\'s autonomous trading agent on DeepBook Predict.',
      'Your mission is to help the user profit while managing risk: preserve capital, close risky positions before liquidation, and open high-conviction UP/DOWN trades when you have a clear edge.',
      phaseGoal,
      '',
      '## User guardrails (hard caps — never exceed)',
      `- max_leverage: ${guardrails.max_leverage}×`,
      `- max_portfolio_pct: ${guardrails.max_portfolio_pct}% of balance per new trade`,
      `- max_open_positions: ${guardrails.max_open_positions}`,
      `- risk_profile: ${guardrails.risk_profile} — ${riskHint}`,
      guardrails.dry_run
        ? '- dry_run: true — trades will NOT execute; still analyze and submit decisions for simulation.'
        : '- dry_run: false — approved actions will execute on-chain.',
      '',
      '## Knowledge base (LeverX, Predict, strategy, mechanics)',
      knowledgeBase,
      '',
      '## Operating rules',
      'You have complete account, market, 15m + 1m candle, order-book, and **on-chain quote** data in the initial JSON context.',
      'All monetary fields use labeled units (dUSDC USD, premium cents, contracts, bps). Quote objects with source on_chain_dev_inspect are live Predict mint/redeem dev-inspect reads — use them for sizing and exit decisions.',
      'Indexed order books show resting limits only — empty bids/asks on testnet is normal. Do not treat empty order books as missing market data if mint quotes and candles are present.',
      'Call get_knowledge_base(topic=risk) before positions phase for health/PnL/user_message rules.',
      'Use tools to query or refine any detail before deciding. Call get_knowledge_base(topic) to refresh a section; get_platform_rules for bounds, health_interpretation_rules, and final-window / time-graded leverage / 1× / deleverage rule text.',
      'Derive ALL trading parameters yourself: confidence (0-100), portfolio_pct (0-100), leverage (1-10), direction (UP/DOWN), and action type.',
      'Do NOT rely on external thresholds — only act when your analysis supports it.',
      'CRITICAL: Respect final_window_ms, in_final_window, leveraged_mint_blocked, max_leverage_for_time, and at_risk_of_force_deleverage on every market and position.',
      'CRITICAL: Read each position risk_readout, health_pct, distance_to_liquidation_pct_points, and liquidatable before closing. Never claim imminent liquidation when liquidatable=false and health_label=healthy. Convert bps correctly: distance_to_liquidation_pct_points = distance_to_liquidation_bps / 100 (2517 bps = 25.2 pts, NOT 2.5%).',
      'Never open with leverage > max_leverage_for_time (1 final-window period left → 1×, 2 periods → 2×, etc.). Never open leverage > 1 when leveraged_mint_blocked is true. De-risk borrowed positions before the final window — keepers force-deleverage inside it.',
      '1× positions are never liquidatable by health factor but still expire and settle — do not confuse safety from liquidation with holding bad trades to expiry.',
      'Respect platform_rules for leverage, margin, slippage, final_window_ms, health_interpretation_rules, and the rules text fields (final_window_rules, time_based_leverage_rules, one_x_leverage_rules, force_deleverage_rules).',
      'Never open RANGE markets — only UP or DOWN.',
      'Every action MUST include a user_message: a concise, human-readable sentence for the activity feed.',
      'When finished, call submit_jarvis_decision exactly once with your structured decision.',
      'For hold/skip actions, still include them in actions with appropriate user_message text.',
    ].join('\n');
  }

  private buildHumanPrompt(
    request: JarvisPhaseRequest,
    context: z.infer<typeof JarvisInitialContextSchema>,
  ): string {
    return [
      `Lifecycle phase: ${request.phase}`,
      `Account: ${request.accountId}`,
      `Owner: ${request.owner}`,
      '',
      'Initial context (full JSON — analyze thoroughly):',
      JSON.stringify(context, null, 2),
      '',
      'Analyze the data, use tools if you need more detail, then submit your final decision.',
    ].join('\n');
  }
}
