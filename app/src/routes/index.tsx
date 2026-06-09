import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen } from "lucide-react";
import { LandingAssetGrid } from "@/components/landing/LandingAssetGrid";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingChartIllustration } from "@/components/landing/LandingIllustrations";
import { APP_NAME } from "@/lib/brand";
import { landingCopy } from "@/lib/landing-copy";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="landing-page">
      <LandingHeader />

      <div className="landing-scroll stagger">
        <section className="landing-hero">
          <div className="landing-hero-bg" aria-hidden>
            <div className="landing-grid-bg" />
            <LandingAssetGrid />
          </div>
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
      </div>
    </div>
  );
}
