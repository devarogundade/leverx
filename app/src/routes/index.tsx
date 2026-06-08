import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Coins, LineChart } from "lucide-react";
import { LandingFeatureSection } from "@/components/landing/LandingFeatureSection";
import { LandingAssetGrid } from "@/components/landing/LandingAssetGrid";
import { LandingHeader } from "@/components/landing/LandingHeader";
import {
  LandingChartIllustration,
  LandingKeeperIllustration,
  LandingMarketsIllustration,
  LandingOrderBookIllustration,
  LandingVaultIllustration,
} from "@/components/landing/LandingIllustrations";
import { APP_NAME } from "@/lib/brand";
import { landingCopy } from "@/lib/landing-copy";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="landing-page landing-page--scroll">
      <LandingHeader />
      <div className="landing-grid-bg absolute inset-0" aria-hidden />
      <LandingAssetGrid />
      <div className="landing-glow" aria-hidden />
      <div className="landing-vignette" aria-hidden />

      <div className="landing-scroll stagger">
        <section className="landing-hero">
          <div className="landing-brand">
            <div className="landing-logo bg-accent text-accent-foreground">LX</div>
            <span className="landing-brand-name">{APP_NAME}</span>
          </div>

          <p className="landing-eyebrow">{landingCopy.eyebrow}</p>

          <h1 className="landing-hero-title">
            {landingCopy.heroTitle}
            <br />
            <span className="landing-hero-accent">{landingCopy.heroTitleAccent}</span>
          </h1>

          <p className="landing-hero-lead">{landingCopy.heroLead}</p>

          <div className="landing-audience-row">
            <a href="#leverage" className="landing-audience-pill landing-audience-traders">
              <LineChart className="h-3.5 w-3.5" aria-hidden />
              {landingCopy.audienceTraders}
            </a>
            <a href="#earners" className="landing-audience-pill landing-audience-earners">
              <Coins className="h-3.5 w-3.5" aria-hidden />
              {landingCopy.audienceEarners}
            </a>
          </div>

          <div className="landing-cta-row">
            <Link to="/markets" className="landing-cta-primary">
              {landingCopy.ctaTrade}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link to="/guide" className="landing-cta-secondary">
              <BookOpen className="h-4 w-4" aria-hidden />
              {landingCopy.ctaHow}
            </Link>
          </div>

          <div className="landing-hero-visual">
            <LandingChartIllustration />
          </div>
        </section>

        <div className="landing-features-intro">
          <p className="landing-feature-eyebrow landing-features-intro-eyebrow">
            {landingCopy.featuresEyebrow}
          </p>
          <h2 className="landing-features-intro-title">{landingCopy.featuresIntroTitle}</h2>
        </div>

        <LandingFeatureSection
          id="leverage"
          eyebrow={landingCopy.leverageEyebrow}
          title={landingCopy.leverageTitle}
          lead={landingCopy.leverageLead}
          bullets={landingCopy.leverageBullets}
          cta={{ label: landingCopy.leverageCta, to: "/markets" }}
          illustration={<LandingChartIllustration />}
        />

        <LandingFeatureSection
          id="markets-feature"
          eyebrow={landingCopy.marketsEyebrow}
          title={landingCopy.marketsTitle}
          lead={landingCopy.marketsLead}
          bullets={landingCopy.marketsBullets}
          cta={{ label: landingCopy.marketsCta, to: "/markets" }}
          illustration={<LandingMarketsIllustration />}
          reverse
        />

        <LandingFeatureSection
          id="orderbook"
          eyebrow={landingCopy.orderbookEyebrow}
          title={landingCopy.orderbookTitle}
          lead={landingCopy.orderbookLead}
          bullets={landingCopy.orderbookBullets}
          cta={{ label: landingCopy.orderbookCta, to: "/markets" }}
          illustration={<LandingOrderBookIllustration />}
        />

        <section id="earners" className="landing-earners-block">
          <div className="landing-earners-head">
            <p className="landing-feature-eyebrow">{landingCopy.audienceEarners}</p>
            <h2 className="landing-feature-title">{landingCopy.earnersTitle}</h2>
            <p className="landing-feature-lead landing-earners-lead">{landingCopy.earnersLead}</p>
          </div>

          <LandingFeatureSection
            id="vault"
            eyebrow={landingCopy.vaultEyebrow}
            title={landingCopy.vaultTitle}
            lead={landingCopy.vaultLead}
            bullets={landingCopy.vaultBullets}
            cta={{ label: landingCopy.vaultCta, to: "/vault" }}
            illustration={<LandingVaultIllustration />}
            className="landing-feature-block--nested"
          />

          <LandingFeatureSection
            id="keeper"
            eyebrow={landingCopy.keeperEyebrow}
            title={landingCopy.keeperTitle}
            lead={landingCopy.keeperLead}
            bullets={landingCopy.keeperBullets}
            cta={{ label: landingCopy.keeperCta, to: "/keeper" }}
            illustration={<LandingKeeperIllustration />}
            reverse
            className="landing-feature-block--nested"
          />
        </section>

        <footer className="landing-section landing-section--foot">
          <p className="landing-footnote">{landingCopy.footnote}</p>
          <nav className="landing-links" aria-label="External links">
            <Link to="/guide">Guide</Link>
            <span aria-hidden>·</span>
            <a href="https://discord.gg/sui" target="_blank" rel="noreferrer">
              Discord
            </a>
            <span aria-hidden>·</span>
            <a href="https://x.com/SuiNetwork" target="_blank" rel="noreferrer">
              X
            </a>
          </nav>
        </footer>
      </div>
    </div>
  );
}
