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
              {ui.appTagline}. Bet on price going up, down, or staying in a range — with dUSDC
              margin from 0.1–100 dUSDC at 1×–10× leverage on the demo network.
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
            <span className="guide-hero-stat-label">Market types</span>
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
            subtitle="Leveraged bets on where prices finish"
            first
          >
            <p>
              LeverX lets you bet on where an asset&apos;s price will be at expiry — above a target,
              below it, or inside a range. Post 0.1–100 dUSDC margin and choose leverage up to 10× to
              size your position.
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
                body="Pays if the final price is at or below your target."
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
            id="leverage"
            index="03"
            title="Margin & safety"
            subtitle="1×–10× leverage with 0.1–100 dUSDC margin"
          >
            <p>
              When you open a trade, you deposit dUSDC from your wallet (0.1–100 dUSDC) and pick
              leverage from 1× to 10×. At 1× there is no vault borrow. Leverage above 1× closes
              one hour before market expiry. Position size = margin × leverage;
              anything above your
              deposit is borrowed from the vault. If the market moves against you, health drops; at
              95% the position may be auto-closed.
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
            index="04"
            title="When price moves"
            subtitle="Protecting yourself along the way"
          >
            <p>
              If the market moves against you, your deposit can run down. At that point the trade
              may close automatically. Use take-profit and stop-loss levels to exit on your terms
              before that happens.
            </p>
            <GuidePanel label="Tools that help">
              <dl className="guide-risk-grid">
                <div>
                  <dt>Take profit</dt>
                  <dd>Lock in gains when price reaches your target.</dd>
                </div>
                <div>
                  <dt>Stop loss</dt>
                  <dd>Cap losses if price moves too far against you.</dd>
                </div>
                <div>
                  <dt>Auto-close</dt>
                  <dd>If your deposit runs too low, the trade may close on its own.</dd>
                </div>
                <div>
                  <dt>At expiry</dt>
                  <dd>Trades settle against the final price when the market closes.</dd>
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
                  <span>Choose an asset, target price, and UP / DOWN / RANGE direction.</span>
                </span>
              </li>
              <li>
                <span className="guide-step-icon">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="guide-step-body">
                  <strong>Set your trade</strong>
                  <span>dUSDC deposit (0.1–100), leverage (1×–10×), and optional take-profit / stop-loss.</span>
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

          <GuideChapter id="start" index="06" title="Your first trade" subtitle="Ready to try it?">
            <p>
              Open any market from the list. Live prices, buy/sell levels, and pool size update as
              activity happens on the demo network.
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
                <dt>Is this real money?</dt>
                <dd>No — LeverX runs on a demo network for testing only.</dd>
              </div>
              <div className="guide-faq-item">
                <dt>Where do prices come from?</dt>
                <dd>Live feeds for each asset, updated as markets move.</dd>
              </div>
              <div className="guide-faq-item">
                <dt>What wallet do I need?</dt>
                <dd>Any Sui wallet on the demo network — Slush, Sui Wallet, or similar.</dd>
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
