import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Layers,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ui } from "@/lib/copy";
import {
  landingCtaSecondary,
  pageSimple,
  segTab,
  segTabActive,
  segTabsClass,
} from "@/lib/leverx/tw";
import { PREDICT_TESTNET_EXPIRATION_DAYS } from "@/lib/predict/knowledge";

const CHAPTERS = [
  { id: "introduction", label: "Introduction" },
  { id: "instruments", label: "Instruments" },
  { id: "leverage", label: "Leverage" },
  { id: "risk", label: "Risk" },
  { id: "walkthrough", label: "Walkthrough" },
  { id: "start", label: "Get started" },
  { id: "faq", label: "FAQ" },
] as const;

type ChapterId = (typeof CHAPTERS)[number]["id"];

export function GuideStorybook() {
  const [activeChapter, setActiveChapter] = useState<ChapterId>("introduction");
  const expirationList = PREDICT_TESTNET_EXPIRATION_DAYS.join(", ");

  useEffect(() => {
    const headings = CHAPTERS.map((c) => document.getElementById(c.id)).filter(Boolean);
    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) {
          setActiveChapter(visible[0].target.id as ChapterId);
        }
      },
      { rootMargin: "-18% 0px -58% 0px", threshold: [0, 0.25, 0.5, 1] },
    );

    headings.forEach((el) => observer.observe(el!));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={cn(pageSimple, "guide-storybook animate-page-in")}>
      <header className="guide-hero">
        <div className="guide-hero-top">
          <div>
            <p className="guide-hero-eyebrow">
              <BookOpen className="h-3.5 w-3.5" aria-hidden />
              Guide
            </p>
            <h1 className="guide-hero-title">How LeverX works</h1>
            <p className="guide-hero-lead">
              {ui.appTagline}. Trade DeepBook Predict UP, DOWN, and RANGE with up to 10× leverage
              on Sui testnet.
            </p>
          </div>
          <Link to="/markets" className="guide-hero-cta">
            Browse markets
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="guide-hero-stats">
          <div className="guide-hero-stat">
            <span className="guide-hero-stat-value">10×</span>
            <span className="guide-hero-stat-label">Max leverage</span>
          </div>
          <div className="guide-hero-stat">
            <span className="guide-hero-stat-value">3</span>
            <span className="guide-hero-stat-label">Instrument types</span>
          </div>
          <div className="guide-hero-stat">
            <span className="guide-hero-stat-value">~4 min</span>
            <span className="guide-hero-stat-label">Read time</span>
          </div>
        </div>
      </header>

      <nav className="guide-mobile-toc lg:hidden" aria-label="Guide chapters">
        <div className={cn(segTabsClass("scroll"), "w-full")}>
          {CHAPTERS.map((chapter) => (
            <a
              key={chapter.id}
              href={`#${chapter.id}`}
              className={cn(segTab, activeChapter === chapter.id && segTabActive)}
            >
              {chapter.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="guide-layout">
        <nav className="guide-toc" aria-label="Guide chapters">
          <p className="guide-toc-label">Contents</p>
          <ol className="guide-toc-list">
            {CHAPTERS.map((chapter) => (
              <li key={chapter.id}>
                <a
                  href={`#${chapter.id}`}
                  className={cn(
                    "guide-toc-link",
                    activeChapter === chapter.id && "guide-toc-link-active",
                  )}
                >
                  {chapter.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="guide-article">
          <GuideChapter
            id="introduction"
            index="01"
            title="What is LeverX?"
            subtitle="Leverage on DeepBook Predict binary options"
            first
          >
            <p>
              DeepBook Predict uses oracle-driven binary and range instruments — not vanilla options
              or per-strike order books. LeverX adds a margin layer: deposit collateral and trade
              with up to 10× leverage on those instruments.
            </p>
            <div className="guide-pillar-grid guide-pillar-grid--single">
              <PillarCard
                icon={<Zap className="h-4 w-4" />}
                title="Up to 10×"
                body="Turn $5 of collateral into $50 of conviction on testnet."
                accent="shield"
              />
            </div>
          </GuideChapter>

          <GuideChapter
            id="instruments"
            index="02"
            title="UP, DOWN & RANGE"
            subtitle="DeepBook Predict instrument types"
          >
            <div className="guide-pillar-grid">
              <PillarCard
                icon={<TrendingUp className="h-4 w-4" />}
                title="UP"
                body="Pays when settlement is above the strike at expiry."
                accent="long"
              />
              <PillarCard
                icon={<TrendingDown className="h-4 w-4" />}
                title="DOWN"
                body="Pays when settlement is at or below the strike at expiry."
                accent="short"
              />
              <PillarCard
                icon={<Layers className="h-4 w-4" />}
                title="RANGE"
                body="Vertical range — pays when settlement lands inside (lower, upper]."
                accent="shield"
              />
            </div>
            <GuideCallout variant="note" title="Market keys">
              Binary positions use a MarketKey (oracle, expiry, strike, direction). Vertical ranges
              use a RangeKey (oracle, expiry, lower strike, higher strike).
            </GuideCallout>
          </GuideChapter>

          <GuideChapter
            id="leverage"
            index="03"
            title="Leveraged trades"
            subtitle="How margin amplifies your position"
          >
            <p>
              When you open a leveraged trade, you deposit collateral (margin) and borrow the rest
              from the LeverX vault. Your position size = margin × leverage. Higher leverage means
              bigger potential gains — and bigger risk if the market moves against you.
            </p>
            <div className="guide-leverage-demo">
              <div className="guide-leverage-row guide-leverage-row-highlight">
                <span className="guide-leverage-label">$10 margin × 10×</span>
                <span className="guide-leverage-value">$100 position</span>
              </div>
              <div className="guide-leverage-bar" aria-hidden>
                <div className="guide-leverage-bar-fill" style={{ width: "10%" }} />
                <div className="guide-leverage-bar-borrow" style={{ width: "90%" }} />
              </div>
              <div className="guide-leverage-legend">
                <span>
                  <i className="guide-swatch guide-swatch-you" />
                  Your margin
                </span>
                <span>
                  <i className="guide-swatch guide-swatch-borrow" />
                  Borrowed from vault
                </span>
              </div>
            </div>
            <GuideCallout variant="tip" title="Testnet expirations">
              Predict oracles on testnet expire in {expirationList} days. Pick a strike and side
              that match your view before the oracle settles.
            </GuideCallout>
          </GuideChapter>

          <GuideChapter
            id="risk"
            index="04"
            title="When price moves"
            subtitle="Liquidation and take-profit / stop-loss"
          >
            <p>
              If the market moves against your position, your margin can be depleted. At that point
              the position may be liquidated automatically. Use take-profit and stop-loss orders to
              exit at your chosen levels before that happens.
            </p>
            <GuidePanel label="Risk controls">
              <dl className="guide-risk-grid">
                <div>
                  <dt>Take profit</dt>
                  <dd>Lock in gains when price reaches your target.</dd>
                </div>
                <div>
                  <dt>Stop loss</dt>
                  <dd>Cap losses by exiting if price moves too far against you.</dd>
                </div>
                <div>
                  <dt>Liquidation</dt>
                  <dd>Automatic close if margin is exhausted — size and leverage matter.</dd>
                </div>
                <div>
                  <dt>Oracle settlement</dt>
                  <dd>Positions resolve against the oracle spot at expiry.</dd>
                </div>
              </dl>
            </GuidePanel>
          </GuideChapter>

          <GuideChapter
            id="walkthrough"
            index="05"
            title="Step by step"
            subtitle="From wallet to open position"
          >
            <ol className="guide-steps">
              <li>
                <span className="guide-step-icon">
                  <Wallet className="h-4 w-4" />
                </span>
                <span className="guide-step-body">
                  <strong>Connect wallet</strong>
                  <span>Use any Sui testnet wallet (Slush, Sui Wallet, etc.).</span>
                </span>
              </li>
              <li>
                <span className="guide-step-icon">
                  <Layers className="h-4 w-4" />
                </span>
                <span className="guide-step-body">
                  <strong>Pick a market</strong>
                  <span>Choose an oracle, strike, and UP / DOWN / RANGE side.</span>
                </span>
              </li>
              <li>
                <span className="guide-step-icon">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="guide-step-body">
                  <strong>Set trade params</strong>
                  <span>Margin, leverage, and optional take-profit / stop-loss.</span>
                </span>
              </li>
              <li>
                <span className="guide-step-icon">
                  <ArrowRight className="h-4 w-4" />
                </span>
                <span className="guide-step-body">
                  <strong>Sign & confirm</strong>
                  <span>Your Predict Manager executes the trade on-chain.</span>
                </span>
              </li>
            </ol>
          </GuideChapter>

          <GuideChapter id="start" index="06" title="Your first trade" subtitle="Ready to try it?">
            <p>
              Open the trade terminal from any market card. Live OracleSVI prices, order book depth,
              and vault liquidity are pulled from the Predict Server on testnet.
            </p>
            <div className="guide-cta-row">
              <Link to="/markets" className="btn-connect gap-1.5 text-sm">
                Browse markets
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link to="/portfolio" className={cn(landingCtaSecondary, "text-sm")}>
                View portfolio
              </Link>
            </div>
          </GuideChapter>

          <GuideChapter id="faq" index="07" title="Good to know" subtitle="Common questions">
            <dl className="guide-faq">
              <div className="guide-faq-item">
                <dt>Is this mainnet?</dt>
                <dd>No — LeverX runs on Sui testnet with DeepBook Predict testnet oracles.</dd>
              </div>
              <div className="guide-faq-item">
                <dt>Where does price data come from?</dt>
                <dd>
                  The Predict Server exposes OracleSVI spot prices, forward curves, and trade history
                  for each oracle.
                </dd>
              </div>
              <div className="guide-faq-item">
                <dt>What wallet do I need?</dt>
                <dd>
                  Any Sui wallet on testnet — Slush, Sui Wallet, or another Wallet Standard
                  wallet.
                </dd>
              </div>
            </dl>
          </GuideChapter>
        </article>
      </div>
    </div>
  );
}

function GuideChapter({
  id,
  index,
  title,
  subtitle,
  first,
  children,
}: {
  id: ChapterId;
  index: string;
  title: string;
  subtitle: string;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn("guide-chapter scroll-mt-28", !first && "guide-chapter--ruled")}
    >
      <div className="guide-chapter-header">
        <span className="guide-chapter-index">{index}</span>
        <div className="min-w-0">
          <h2 className="guide-chapter-title">{title}</h2>
          <p className="guide-chapter-subtitle">{subtitle}</p>
        </div>
      </div>
      <div className="guide-chapter-body">{children}</div>
    </section>
  );
}

function GuidePanel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="guide-panel">
      <p className="guide-panel-label">{label}</p>
      <div className="guide-panel-body">{children}</div>
    </div>
  );
}

function GuideCallout({
  variant,
  title,
  children,
}: {
  variant: "tip" | "note";
  title: string;
  children: ReactNode;
}) {
  return (
    <aside className={cn("guide-callout", variant === "tip" && "guide-callout-tip")}>
      <p className="guide-callout-title">{title}</p>
      <div className="guide-callout-body">{children}</div>
    </aside>
  );
}

function PillarCard({
  icon,
  title,
  body,
  accent,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  accent: "long" | "short" | "shield";
}) {
  return (
    <div className={cn("guide-pillar", `guide-pillar-${accent}`)}>
      <div className="guide-pillar-icon">{icon}</div>
      <h3 className="guide-pillar-title">{title}</h3>
      <p className="guide-pillar-body">{body}</p>
    </div>
  );
}
