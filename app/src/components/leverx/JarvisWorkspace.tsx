import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  Loader2,
  Moon,
  PauseCircle,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCircle,
  Wallet,
  Zap,
} from "lucide-react";
import { JarvisSettingsDialog } from "@/components/leverx/JarvisSettingsDialog";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import {
  isJarvisConfigured,
  useDisableJarvis,
  useEnableJarvis,
  useJarvisEvents,
  useJarvisLive,
  useJarvisStatus,
  useMarkJarvisRead,
} from "@/hooks/useJarvis";
import type { JarvisConnectionState } from "@/hooks/useJarvisWebSocket";
import { leverxInfo } from "@/lib/leverx/info-copy";
import type { JarvisEventRecord, JarvisEventType, JarvisGuardrails } from "@/lib/leverx/keeper-client";
import { labelCaps, tradeSurface } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

const WELCOME_KEY = "leverx-jarvis-welcome-seen";
const TRADE_EVENT_TYPES = new Set<JarvisEventType>([
  "opening_position",
  "closing_position",
]);

type Props = {
  owner: string;
  accountId: string;
};

type EventVisual = {
  icon: typeof Sparkles;
  accent: string;
  bubble: string;
};

type EventMetadata = {
  reasoning?: string;
  confidence?: number;
  leverage?: number;
  portfolio_pct?: number;
  dry_run?: boolean;
};

const WARNING_BUBBLE = "border-warning/25 bg-warning/5";

function eventVisual(type: JarvisEventType, dryRun?: boolean): EventVisual {
  if (dryRun) {
    return {
      icon: Bot,
      accent: "from-muted/30 to-transparent",
      bubble: "border-dashed border-muted-foreground/40 bg-muted/10",
    };
  }

  switch (type) {
    case "welcome":
    case "enabled":
      return {
        icon: Sparkles,
        accent: "from-accent/30 to-transparent",
        bubble: "border-accent/30 bg-accent/5",
      };
    case "disabled":
      return {
        icon: PauseCircle,
        accent: "from-muted/40 to-transparent",
        bubble: "border-border bg-muted/20",
      };
    case "startup":
    case "running":
    case "cycle_complete":
      return {
        icon: Bot,
        accent: "from-primary/25 to-transparent",
        bubble: "border-primary/20 bg-primary/5",
      };
    case "analyzing_trades":
    case "analyzing_markets":
      return {
        icon: Search,
        accent: "from-sky-500/20 to-transparent",
        bubble: "border-sky-500/20 bg-sky-500/5",
      };
    case "opening_position":
      return {
        icon: TrendingUp,
        accent: "from-success/25 to-transparent",
        bubble: "border-success/25 bg-success/5",
      };
    case "closing_position":
      return {
        icon: TrendingDown,
        accent: "from-warning/25 to-transparent",
        bubble: "border-warning/25 bg-warning/5",
      };
    case "repaying_debt":
      return {
        icon: Zap,
        accent: "from-amber-500/20 to-transparent",
        bubble: "border-amber-500/20 bg-amber-500/5",
      };
    case "idle":
    case "skipped":
      return {
        icon: Moon,
        accent: "from-muted/30 to-transparent",
        bubble: "border-border bg-muted/10",
      };
    case "account_required":
      return {
        icon: UserCircle,
        accent: "from-warning/25 to-transparent",
        bubble: WARNING_BUBBLE,
      };
    case "no_funds":
    case "low_balance":
      return {
        icon: Wallet,
        accent: "from-warning/25 to-transparent",
        bubble: WARNING_BUBBLE,
      };
    case "executor_required":
      return {
        icon: ShieldAlert,
        accent: "from-warning/25 to-transparent",
        bubble: WARNING_BUBBLE,
      };
    case "error":
      return {
        icon: AlertTriangle,
        accent: "from-destructive/25 to-transparent",
        bubble: "border-destructive/30 bg-destructive/5",
      };
    default:
      return {
        icon: Bot,
        accent: "from-muted/20 to-transparent",
        bubble: "border-border bg-card",
      };
  }
}

function parseEventMetadata(metadata: Record<string, unknown> | null): EventMetadata {
  if (!metadata) return {};
  return {
    reasoning: typeof metadata.reasoning === "string" ? metadata.reasoning : undefined,
    confidence: typeof metadata.confidence === "number" ? metadata.confidence : undefined,
    leverage: typeof metadata.leverage === "number" ? metadata.leverage : undefined,
    portfolio_pct: typeof metadata.portfolio_pct === "number" ? metadata.portfolio_pct : undefined,
    dry_run: metadata.dry_run === true,
  };
}

function formatEventTime(ms: string): string {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "";
  return new Date(n).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ActivityBubble({ event }: { event: JarvisEventRecord }) {
  const meta = parseEventMetadata(event.metadata);
  const isDryRun =
    meta.dry_run ||
    event.message.startsWith("[DRY RUN]") ||
    event.message.toLowerCase().includes("dry run");
  const visual = eventVisual(event.event_type, isDryRun);
  const Icon = visual.icon;
  const hasWhy =
    Boolean(meta.reasoning) ||
    meta.confidence != null ||
    meta.leverage != null ||
    meta.portfolio_pct != null;
  const [whyOpen, setWhyOpen] = useState(false);

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl border px-3 py-3 sm:px-4",
        visual.bubble,
        !event.read && "ring-1 ring-accent/20",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b opacity-70",
          visual.accent,
        )}
      />
      <div className="relative flex gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/80">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {isDryRun ? (
              <Badge variant="outline" className="border-dashed text-[10px] uppercase">
                Simulated
              </Badge>
            ) : null}
          </div>
          <p className="text-sm leading-relaxed text-foreground">{event.message}</p>
          {hasWhy ? (
            <div className="pt-1">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                onClick={() => setWhyOpen((v) => !v)}
              >
                Why?
                <ChevronDown
                  className={cn("h-3 w-3 transition-transform", whyOpen && "rotate-180")}
                />
              </button>
              {whyOpen ? (
                <div className="mt-2 space-y-1 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  {meta.confidence != null ? (
                    <p>
                      <span className="font-medium text-foreground">Confidence:</span>{" "}
                      {meta.confidence}%
                    </p>
                  ) : null}
                  {meta.leverage != null ? (
                    <p>
                      <span className="font-medium text-foreground">Leverage:</span>{" "}
                      {meta.leverage}×
                    </p>
                  ) : null}
                  {meta.portfolio_pct != null ? (
                    <p>
                      <span className="font-medium text-foreground">Portfolio:</span>{" "}
                      {meta.portfolio_pct}%
                    </p>
                  ) : null}
                  {meta.reasoning ? (
                    <p className="leading-relaxed">{meta.reasoning}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <p className="font-mono text-[10px] text-muted-foreground">
            {formatEventTime(event.created_at_ms)}
          </p>
        </div>
      </div>
    </article>
  );
}

function StatusPill({
  enabled,
  configured,
}: {
  enabled: boolean;
  configured: boolean;
}) {
  if (!configured) {
    return <Badge variant="secondary">Unavailable</Badge>;
  }
  return (
    <Badge variant={enabled ? "default" : "secondary"}>
      {enabled ? "Active" : "Paused"}
    </Badge>
  );
}

function ConnectionIndicator({ state }: { state: JarvisConnectionState }) {
  if (state === "connected") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"
        title="Connected — live updates"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
        Live
      </span>
    );
  }
  if (state === "connecting") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Reconnecting…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/50" aria-hidden />
      Offline
    </span>
  );
}

function GuardrailsSummary({ guardrails }: { guardrails: JarvisGuardrails }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline" className="font-mono text-[10px]">
        ≤{guardrails.max_leverage}×
      </Badge>
      <Badge variant="outline" className="font-mono text-[10px]">
        ≤{guardrails.max_portfolio_pct}% / trade
      </Badge>
      <Badge variant="outline" className="font-mono text-[10px]">
        max {guardrails.max_open_positions} positions
      </Badge>
      <Badge variant="outline" className="text-[10px] capitalize">
        {guardrails.risk_profile}
      </Badge>
      {guardrails.dry_run ? (
        <Badge variant="outline" className="border-dashed text-[10px] uppercase">
          Practice mode
        </Badge>
      ) : null}
    </div>
  );
}

function countRecentTrades(events: JarvisEventRecord[]): number {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return events.filter(
    (e) =>
      TRADE_EVENT_TYPES.has(e.event_type) &&
      Number(e.created_at_ms) >= cutoff &&
      !parseEventMetadata(e.metadata).dry_run &&
      !e.message.startsWith("[DRY RUN]"),
  ).length;
}

export function JarvisWorkspace({ owner, accountId }: Props) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const welcomeSeen =
    typeof window !== "undefined" && localStorage.getItem(WELCOME_KEY) === "1";

  const { data: status, isLoading: statusLoading } = useJarvisStatus(owner, accountId);
  const { data: events = [], isLoading: eventsLoading } = useJarvisEvents(owner, accountId);
  const enableJarvis = useEnableJarvis();
  const disableJarvis = useDisableJarvis();
  const markRead = useMarkJarvisRead();
  const { connectionState } = useJarvisLive(owner, accountId);

  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) => Number(b.created_at_ms) - Number(a.created_at_ms),
      ),
    [events],
  );

  const displayEvents = useMemo(
    () => [...sortedEvents].reverse(),
    [sortedEvents],
  );

  const tradesLast24h = useMemo(() => countRecentTrades(events), [events]);
  const guardrails = status?.guardrails;

  const showWelcome = !welcomeSeen && !status?.enabled && displayEvents.length === 0;

  useEffect(() => {
    if (!owner || !accountId || !status?.unread_count) return;
    const timer = window.setTimeout(() => {
      markRead.mutate({ owner, accountId });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [owner, accountId, status?.unread_count, markRead]);

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [displayEvents.length]);

  const toggleBusy = enableJarvis.isPending || disableJarvis.isPending;
  const configured = isJarvisConfigured() && (status?.configured ?? true);

  const handleToggle = () => {
    if (!configured || toggleBusy) return;
    if (status?.enabled) {
      disableJarvis.mutate({ owner, accountId });
      return;
    }
    localStorage.setItem(WELCOME_KEY, "1");
    enableJarvis.mutate({ owner, accountId });
  };

  return (
    <div className="space-y-4">
      <JarvisSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        owner={owner}
        accountId={accountId}
      />

      <div className={cn(tradeSurface, "overflow-hidden")}>
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30">
                <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
              </span>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <LabelWithInfo
                    label="Jarvis"
                    labelClassName={labelCaps}
                    info={leverxInfo.jarvis}
                    infoTitle="AI trading assistant"
                  />
                  <StatusPill
                    enabled={status?.enabled ?? false}
                    configured={configured}
                  />
                  {status?.enabled ? <ConnectionIndicator state={connectionState} /> : null}
                </div>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Checks your account every 5 minutes, manages risk, and looks for opportunities
                  in markets closing soon.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 self-start">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!configured}
                aria-label="Settings"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant={status?.enabled ? "outline" : "default"}
                size="sm"
                disabled={!configured || toggleBusy}
                onClick={handleToggle}
              >
                {toggleBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    …
                  </>
                ) : status?.enabled ? (
                  "Turn off"
                ) : (
                  "Turn on"
                )}
              </Button>
            </div>
          </div>

          {status?.enabled && guardrails ? (
            <GuardrailsSummary guardrails={guardrails} />
          ) : null}

          {status?.enabled ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {status.next_run_at_ms ? (
                <span>
                  Next scan ~{" "}
                  {new Date(status.next_run_at_ms).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
              {tradesLast24h > 0 ? (
                <span>{tradesLast24h} trade{tradesLast24h === 1 ? "" : "s"} in last 24h</span>
              ) : null}
              {status.last_decision_at_ms ? (
                <span>
                  Last decision{" "}
                  {new Date(status.last_decision_at_ms).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
            </div>
          ) : null}

          {!configured ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              Jarvis isn&apos;t available on this server yet. Please try again later.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{leverxInfo.jarvisExecutor}</p>
          )}
        </div>
      </div>

      <section className={cn(tradeSurface, "flex min-h-[420px] flex-col")}>
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className={labelCaps}>Recent activity</h2>
          {(status?.unread_count ?? 0) > 0 ? (
            <Badge variant="secondary">{status!.unread_count} unread</Badge>
          ) : null}
        </header>

        <div
          ref={feedRef}
          className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
        >
          {showWelcome ? (
            <WelcomeCard />
          ) : null}

          {statusLoading || eventsLoading ? (
            <LoadingState compact message="Loading Jarvis activity…" />
          ) : displayEvents.length === 0 ? (
            <EmptyFeed enabled={status?.enabled ?? false} />
          ) : (
            displayEvents.map((event) => (
              <ActivityBubble key={event.id} event={event} />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function WelcomeCard() {
  return (
    <div className="rounded-xl border border-dashed border-accent/30 bg-accent/5 px-4 py-5 text-center">
      <Sparkles className="mx-auto mb-2 h-6 w-6 text-accent" aria-hidden />
      <p className="text-sm font-medium text-foreground">Welcome to Jarvis</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Turn on Jarvis to start managing your account. Trades, scans, and decisions will show up
        here as they happen.
      </p>
    </div>
  );
}

function EmptyFeed({ enabled }: { enabled: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
      <Bot className="h-8 w-8 text-muted-foreground/50" aria-hidden />
      <p className="text-sm text-muted-foreground">
        {enabled
          ? "Jarvis is running — updates will appear here after the first scan."
          : "Turn on Jarvis to see trades and decisions here."}
      </p>
    </div>
  );
}
