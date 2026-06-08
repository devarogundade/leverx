import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Coins, Landmark, LineChart, Server } from "lucide-react";
import { InfoPopover } from "@/components/leverx/InfoPopover";
import { LandingAssetGrid } from "@/components/landing/LandingAssetGrid";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { APP_NAME } from "@/lib/brand";
import { landingCopy } from "@/lib/landing-copy";
import { leverxInfo } from "@/lib/leverx/info-copy";

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
            <a href="#traders" className="landing-audience-pill landing-audience-traders">
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
        </section>

        <section id="traders" className="landing-section landing-section--traders">
          <div className="landing-section-head">
            <span className="landing-section-icon landing-section-icon--trade" aria-hidden>
              <LineChart className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <div>
              <h2 className="landing-section-title">{landingCopy.tradersTitle}</h2>
              <p className="landing-section-lead">{landingCopy.tradersLead}</p>
            </div>
          </div>
          <ul className="landing-section-list">
            <li>{landingCopy.tradersPoint1}</li>
            <li>{landingCopy.tradersPoint2}</li>
            <li>
              <span className="inline-flex items-center gap-1">
                {landingCopy.tradersPoint3}
                <InfoPopover title="Position health">{leverxInfo.landingHealth}</InfoPopover>
              </span>
            </li>
          </ul>
          <Link to="/markets" className="landing-section-cta">
            {landingCopy.tradersCta}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>

        <section id="earners" className="landing-section landing-section--earners">
          <div className="landing-section-head landing-section-head--center">
            <h2 className="landing-section-title">{landingCopy.earnersTitle}</h2>
            <p className="landing-section-lead">{landingCopy.earnersLead}</p>
          </div>

          <div className="landing-earn-grid">
            <article className="landing-earn-card">
              <div className="landing-earn-card-head">
                <span className="landing-section-icon" aria-hidden>
                  <Landmark className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <h3 className="landing-earn-card-title">
                  {landingCopy.lendersTitle}
                  <InfoPopover title="Vault">{leverxInfo.landingVault}</InfoPopover>
                </h3>
              </div>
              <p className="landing-earn-card-lead">{landingCopy.lendersLead}</p>
              <Link to="/vault" className="landing-section-cta landing-section-cta--inline">
                {landingCopy.lendersCta}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </article>

            <article className="landing-earn-card">
              <div className="landing-earn-card-head">
                <span className="landing-section-icon" aria-hidden>
                  <Server className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <h3 className="landing-earn-card-title">
                  {landingCopy.keepersTitle}
                  <InfoPopover title="Keeper">{leverxInfo.landingKeeper}</InfoPopover>
                </h3>
              </div>
              <p className="landing-earn-card-lead">{landingCopy.keepersLead}</p>
              <Link to="/keeper" className="landing-section-cta landing-section-cta--inline">
                {landingCopy.keepersCta}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </article>
          </div>
        </section>

        <footer className="landing-section landing-section--foot">
          <p className="landing-footnote">{landingCopy.footnote}</p>
          <nav className="landing-links" aria-label="External links">
            <Link to="/guide">Docs</Link>
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
