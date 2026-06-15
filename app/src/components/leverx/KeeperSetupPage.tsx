import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Check,
  Clock,
  Coins,
  Copy,
  Download,
  KeyRound,
  Scale,
  Terminal,
  Zap,
} from "lucide-react";
import { LandingKeeperIllustration } from "@/components/landing/LandingIllustrations";
import { InfoPopover, LabelWithInfo } from "@/components/leverx/InfoPopover";
import { ui } from "@/lib/copy";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { pageSimple, pageSimpleTitle, tradeSurface } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

const KEEPER_IMAGE = "devarogundade/leverx-keeper";

const DOCKER_RUN = `docker run -d \\
  --name leverx-keeper \\
  -p 3001:3001 \\
  -e KEEPER_PRIVATE_KEY=your_wallet_private_key \\
  ${KEEPER_IMAGE}`;

const DOCKER_PULL = `docker pull ${KEEPER_IMAGE}`;

const FEATURES = [
  { icon: Clock, label: "Close expired trades", detail: "Settles markets after expiry" },
  { icon: Scale, label: "Match limit orders", detail: "Fills resting orders at fair prices" },
  { icon: Zap, label: "Step in on risk", detail: "Helps liquidate underwater positions" },
  { icon: Coins, label: "Earn fees", detail: "Share of protocol fees when you win the race" },
] as const;

export function KeeperSetupPage() {
  return (
    <section className={cn(pageSimple, "keeper-page mx-auto max-w-[var(--page-max)]")}>
      <div className="keeper-hero">
        <div className="keeper-hero-copy">
          <p className="keeper-eyebrow">
            <Activity className="h-3.5 w-3.5" aria-hidden />
            Helper node
          </p>
          <h1 className={pageSimpleTitle}>{ui.keeperPageTitle}</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {ui.keeperPageHint}
          </p>
          <ul className="keeper-features">
            {FEATURES.map(({ icon: Icon, label, detail }) => (
              <li key={label} className="keeper-feature">
                <span className="keeper-feature-icon" aria-hidden>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="keeper-feature-text">
                  <span className="keeper-feature-label">{label}</span>
                  <span className="keeper-feature-detail">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="keeper-hero-visual" aria-hidden>
          <LandingKeeperIllustration />
        </div>
      </div>

      <div className={cn(tradeSurface, "keeper-setup-panel")}>
        <div className="keeper-setup-head">
          <h2 className="keeper-setup-title">Quick setup</h2>
          <p className="keeper-setup-subtitle">Three steps — about five minutes on a machine with Docker.</p>
        </div>

        <ol className="keeper-steps">
          <KeeperStep
            step={1}
            icon={Download}
            title={ui.keeperStepPull}
            hint={leverxInfo.keeperPull}
            code={DOCKER_PULL}
            codeLabel="Pull image"
          />
          <KeeperStep
            step={2}
            icon={KeyRound}
            title={
              <LabelWithInfo label={ui.keeperStepKey} info={leverxInfo.keeperPrivateKey} />
            }
            hint={leverxInfo.keeperKeyHint}
            code="KEEPER_PRIVATE_KEY=your_wallet_private_key"
            codeLabel="Environment variable"
          />
          <KeeperStep
            step={3}
            icon={Terminal}
            title={<LabelWithInfo label={ui.keeperStepRun} info={leverxInfo.keeperRun} />}
            hint={leverxInfo.keeperRunHint}
            code={DOCKER_RUN}
            codeLabel="Run container"
            last
          />
        </ol>
      </div>

      <div className="keeper-bottom-grid">
        <div className={cn(tradeSurface, "keeper-health-card")}>
          <div className="keeper-health-head">
            <span className="keeper-health-dot" aria-hidden />
            <h2 className="keeper-health-title">
              <LabelWithInfo label={ui.keeperHealthLabel} info={leverxInfo.keeperHealth} />
            </h2>
          </div>
          <KeeperCodeBlock code="curl http://localhost:3001/health" label="Health check" />
          <p className="text-sm leading-relaxed text-muted-foreground">{ui.keeperIndexerHint}</p>
        </div>

        <div className={cn(tradeSurface, "keeper-rewards-card")}>
          <div className="keeper-rewards-icon" aria-hidden>
            <Coins className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{ui.keeperRewardsHint}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <InfoPopover title="Rewards">{leverxInfo.keeperRewards}</InfoPopover>
            </p>
          </div>
        </div>
      </div>

      <Link to="/vault" className={cn(tradeSurface, "keeper-vault-cta")}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{ui.keeperVaultLink}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Deposit dUSDC to the pool and earn passively — no server required.
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </section>
  );
}

function KeeperStep({
  step,
  icon: Icon,
  title,
  hint,
  code,
  codeLabel,
  last = false,
}: {
  step: number;
  icon: typeof Download;
  title: ReactNode;
  hint: ReactNode;
  code: string;
  codeLabel?: string;
  last?: boolean;
}) {
  return (
    <li className={cn("keeper-step", last && "keeper-step--last")}>
      <div className="keeper-step-rail" aria-hidden>
        <span className="keeper-step-num">{step}</span>
        {!last ? <span className="keeper-step-line" /> : null}
      </div>
      <article className="keeper-step-card">
        <div className="keeper-step-head">
          <span className="keeper-step-icon" aria-hidden>
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="keeper-step-title">{title}</h3>
        </div>
        <p className="keeper-step-hint">{hint}</p>
        <KeeperCodeBlock code={code} label={codeLabel} />
      </article>
    </li>
  );
}

function KeeperCodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="keeper-code">
      <div className="keeper-code-header">
        <span className="keeper-code-label">{label ?? "Command"}</span>
        <button type="button" className="keeper-code-copy" onClick={onCopy}>
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="keeper-code-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}
