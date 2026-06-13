import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Coins,
  Layers,
  ListOrdered,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ui } from "@/lib/copy";
import { MARGIN_CALL_BPS } from "@/lib/leverx/protocol";
import {
  LEVERAGE_MAX,
  LEVERAGE_MIN,
  LEVERAGE_STEP,
  MAX_MARGIN_USD,
  MIN_MARGIN_USD,
} from "@/lib/leverx/trade-limits";
import {
  landingCtaSecondary,
  pageSimple,
  segTab,
  segTabActive,
  segTabsClass,
} from "@/lib/leverx/tw";
import { PREDICT_TESTNET_EXPIRATION_DAYS } from "@/lib/predict/knowledge";

const MARGIN_RANGE = `${MIN_MARGIN_USD}–${MAX_MARGIN_USD} dUSDC`;
const LEVERAGE_RANGE = `${LEVERAGE_MIN}×–${LEVERAGE_MAX}×`;
const MARGIN_CALL_PCT = (MARGIN_CALL_BPS / 100).toFixed(0);

const CHAPTERS = [
  { id: "introduction", label: "Introduction" },
  { id: "instruments", label: "Instruments" },
  { id: "orders", label: "Order types" },
  { id: "leverage", label: "Leverage" },
  { id: "risk", label: "Risk" },
  { id: "walkthrough", label: "Walkthrough" },
  { id: "earn", label: "Earn" },
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
              {ui.appTagline}. Bet on price going up, down, or staying in a range — with{" "}
              {MARGIN_RANGE} margin at {LEVERAGE_RANGE} leverage on Sui testnet.
            </p>
          </div>
          <Link to="/markets" className="guide-hero-cta">
            Browse markets
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="guide-hero-stats">
          <div className="guide-hero-stat">
            <span className="guide-hero-stat-value">{LEVERAGE_MAX}×</span>
            <span className="guide-hero-stat-label">Max leverage</span>
          </div>
          <div className="guide-hero-stat">
            <span className="guide-hero-stat-value">3</span>
            <span className="guide-hero-stat-label">Market types</span>
          </div>
          <div className="guide-hero-stat">
            <span className="guide-hero-stat-value">~6 min</span>
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
            subtitle="Leveraged bets on where prices finish"
            first
          >
            <p>
              LeverX lets you bet on where an asset&apos;s price will be at expiry — above a target,
              below it, or inside a range. Post {MARGIN_RANGE} margin and choose leverage up to{" "}
              {LEVERAGE_MAX}× to size your position. Contracts settle against live oracle prices on
              DeepBook Predict — not a traditional order book.
            </p>
            <div className="guide-pillar-grid guide-pillar-grid--single">
              <PillarCard
                icon={<Zap className="h-4 w-4" />}
                title="dUSDC margin"
                body="Deposit $10 dUSDC at 2× to control a $20 position — the extra comes from the vault."
                accent="shield"
              />
            </div>
          </GuideChapter>

          <GuideChapter
            id="instruments"
            index="02"
            title="UP, DOWN & RANGE"
            subtitle="Three ways to take a view"
          >
            <div className="guide-pillar-grid">
              <PillarCard
                icon={<TrendingUp className="h-4 w-4" />}
                title="UP"
                body="Pays if the final price is above your target."
                accent="long"
              />
              <PillarCard
                icon={<TrendingDown className="h-4 w-4" />}
                title="DOWN"
                body="Pays if the final price is below your target."
                accent="short"
              />
              <PillarCard
                icon={<Layers className="h-4 w-4" />}
                title="RANGE"
                body="Pays if the final price lands inside your chosen band."
                accent="shield"
              />
            </div>
            <GuideCallout variant="note" title="Each market is unique">
              Every trade is tied to an asset, expiry time, target price, and direction. Pick the
              combination that matches your view.
            </GuideCallout>
          </GuideChapter>

          <GuideChapter
            id="orders"
            index="03"
            title="Market & limit orders"
            subtitle="Open now or queue your price"
          >
            <div className="guide-pillar-grid">
              <PillarCard
                icon={<Zap className="h-4 w-4" />}
                title="Market"
                body="Opens right away at the best available LP mint price, with optional slippage protection."
                accent="long"
              />
              <PillarCard
                icon={<ListOrdered className="h-4 w-4" />}
                title="Limit · Resting"
                body="Set a max price per contract. Your order waits under Open Orders until the market reaches it."
                accent="shield"
              />
              <PillarCard
                icon={<ArrowRight className="h-4 w-4" />}
                title="Limit · Fill now"
                body="Opens immediately only if the live price is within your limit and placement slippage."
                accent="short"
              />
            </div>
            <GuideCallout variant="note" title="Order book panel">
              Bids show resting limits from other traders; the ask is the live vault mint quote for
              the selected UP, DOWN, or RANGE outcome.
            </GuideCallout>
          </GuideChapter>

          <GuideChapter
            id="leverage"
            index="04"
            title="Margin & safety"
            subtitle={`${LEVERAGE_RANGE} leverage with ${MARGIN_RANGE} margin`}
          >
            <p>
              When you open a trade, you deposit dUSDC from your wallet ({MARGIN_RANGE}) and pick
              leverage from {LEVERAGE_MIN}× to {LEVERAGE_MAX}× in {LEVERAGE_STEP}× steps. At 1× there
              is no vault borrow. New leverage above 1× cannot be opened in the final hour before
              expiry; existing borrowed positions in that window are force-deleveraged to 1× (or
              liquidated if underwater). Position size = margin × leverage; anything above your
              deposit is borrowed from the shared pool.
            </p>
            <div className="guide-leverage-demo">
              <div className="guide-leverage-row guide-leverage-row-highlight">
                <span className="guide-leverage-label">$10 dUSDC deposit</span>
                <span className="guide-leverage-value">$20 position at 2×</span>
              </div>
              <div className="guide-leverage-bar" aria-hidden>
                <div className="guide-leverage-bar-fill" style={{ width: "50%" }} />
              </div>
              <div className="guide-leverage-legend">
                <span>
                  <i className="guide-swatch guide-swatch-you" />
                  Your dUSDC margin
                </span>
                <span>
                  <i className="guide-swatch guide-swatch-borrow" />
                  Vault borrow
                </span>
              </div>
            </div>
            <GuideCallout variant="tip" title="Market expiry">
              Demo markets expire in {expirationList} days. Pick a target and direction that match
              your view before the market closes.
            </GuideCallout>
          </GuideChapter>

          <GuideChapter
            id="risk"
            index="05"
            title="When price moves"
            subtitle="Protecting yourself along the way"
          >
            <p>
              If the market moves against you, mark value can fall relative to borrowed dUSDC. Health
              tracks collateral vs debt; below {MARGIN_CALL_PCT}% the pool may step in and close the
              trade. Use take-profit and stop-loss levels on contract premium to exit on your terms
              before that happens.
            </p>
            <GuidePanel label="Tools that help">
              <dl className="guide-risk-grid">
                <div>
                  <dt>Take profit</dt>
                  <dd>Close when contract premium rises above your entry (¢ per contract).</dd>
                </div>
                <div>
                  <dt>Stop loss</dt>
                  <dd>Close when contract premium falls below your entry.</dd>
                </div>
                <div>
                  <dt>Margin call</dt>
                  <dd>
                    If health drops below {MARGIN_CALL_PCT}%, the position may be auto-closed by the
                    pool.
                  </dd>
                </div>
                <div>
                  <dt>At expiry</dt>
                  <dd>Trades settle against the final oracle price when the market closes.</dd>
                </div>
              </dl>
            </GuidePanel>
          </GuideChapter>

          <GuideChapter
            id="walkthrough"
            index="06"
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
                  <span>Choose an asset, target price, and UP / DOWN / RANGE direction.</span>
                </span>
              </li>
              <li>
                <span className="guide-step-icon">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="guide-step-body">
                  <strong>Set your trade</strong>
                  <span>
                    Choose market or limit, deposit ({MARGIN_RANGE}), leverage ({LEVERAGE_RANGE}),
                    and optional take-profit / stop-loss on premium.
                  </span>
                </span>
              </li>
              <li>
                <span className="guide-step-icon">
                  <ArrowRight className="h-4 w-4" />
                </span>
                <span className="guide-step-body">
                  <strong>Confirm in your wallet</strong>
                  <span>Review the details and approve the trade.</span>
                </span>
              </li>
            </ol>
          </GuideChapter>

          <GuideChapter
            id="earn"
            index="07"
            title="Earn without trading"
            subtitle="Pool liquidity, helpers, and points"
          >
            <div className="guide-pillar-grid">
              <PillarCard
                icon={<Coins className="h-4 w-4" />}
                title="Pool"
                body="Deposit dUSDC to the shared pool and earn a share of trading fees as activity grows."
                accent="shield"
              />
              <PillarCard
                icon={<Zap className="h-4 w-4" />}
                title="Helper"
                body="Run a small background app that closes expired trades, fills limits, and steps in on risky positions — and earn protocol fees."
                accent="long"
              />
              <PillarCard
                icon={<Sparkles className="h-4 w-4" />}
                title="Points"
                body="Genesis season leaderboard ranks wallets by leveraged trading volume on testnet."
                accent="short"
              />
            </div>
            <div className="guide-cta-row">
              <Link to="/vault" className={cn(landingCtaSecondary, "text-sm")}>
                View pool
              </Link>
              <Link to="/keeper" className={cn(landingCtaSecondary, "text-sm")}>
                Set up helper
              </Link>
              <Link to="/points" className={cn(landingCtaSecondary, "text-sm")}>
                Points leaderboard
              </Link>
            </div>
          </GuideChapter>

          <GuideChapter id="start" index="08" title="Your first trade" subtitle="Ready to try it?">
            <p>
              Open any market from the list. Live spot prices, order-book bids, LP mint quotes, and
              pool stats update as activity happens on testnet.
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

          <GuideChapter id="faq" index="09" title="Good to know" subtitle="Common questions">
            <dl className="guide-faq">
              <div className="guide-faq-item">
                <dt>Is this real money?</dt>
                <dd>No — LeverX runs on Sui testnet with demo dUSDC for testing only.</dd>
              </div>
              <div className="guide-faq-item">
                <dt>Where do prices come from?</dt>
                <dd>
                  DeepBook Predict oracles for each asset. Spot, forward, and contract premiums
                  update from on-chain state and the Predict server.
                </dd>
              </div>
              <div className="guide-faq-item">
                <dt>How long do markets last?</dt>
                <dd>
                  Testnet expirations are {expirationList} days from listing. Pick a tenor that
                  matches your view.
                </dd>
              </div>
              <div className="guide-faq-item">
                <dt>Market vs limit — which should I use?</dt>
                <dd>
                  Use market when you want to open now. Use a resting limit when you have a target
                  premium and can wait; use fill-now limit when price is already in range.
                </dd>
              </div>
              <div className="guide-faq-item">
                <dt>What wallet do I need?</dt>
                <dd>Any Sui testnet wallet — Slush, Sui Wallet, or similar.</dd>
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
