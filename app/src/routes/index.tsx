import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Layers, Shield, Zap } from "lucide-react";
import { LandingAssetGrid } from "@/components/landing/LandingAssetGrid";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { APP_NAME } from "@/lib/brand";
import { predictSideLabel } from "@/lib/predict/instruments";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const FEATURES = [
  {
    icon: Zap,
    label: "10× leverage",
    detail: "Margin-backed conviction on every strike",
  },
  {
    icon: Layers,
    label: "UP · DOWN · RANGE",
    detail: "Full DeepBook Predict instrument set",
  },
  {
    icon: Shield,
    label: "Shared vault",
    detail: "OracleSVI pricing on Sui testnet",
  },
] as const;

function LandingPage() {
  return (
    <div className="landing-page">
      <LandingHeader />
      <div className="landing-grid-bg absolute inset-0" />
      <LandingAssetGrid />
      <div className="landing-glow" aria-hidden />
      <div className="landing-vignette" aria-hidden />

      <div className="landing-content stagger">
        <div className="landing-brand">
          <div className="landing-logo bg-accent text-accent-foreground">LX</div>
          <span className="landing-brand-name">{APP_NAME}</span>
        </div>

        <p className="landing-eyebrow">DeepBook Predict · Sui Testnet</p>

        <h1 className="landing-hero-title">
          The margin layer
          <br />
          for <span className="landing-hero-accent">deepbook predict.</span>
        </h1>

        <p className="landing-hero-lead">
          Trade <strong>UP</strong>, <strong>DOWN</strong>, and <strong>RANGE</strong> with up to
          10× leverage. Live OracleSVI pricing — turn a small margin into full conviction.
        </p>

        <div className="landing-instruments">
          {(["up", "down", "range"] as const).map((side) => (
            <span key={side} className={`landing-instrument-pill landing-instrument-${side}`}>
              {predictSideLabel[side]}
            </span>
          ))}
        </div>

        <div className="landing-cta-row">
          <Link to="/markets" className="landing-cta-primary">
            Start trading
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link to="/guide" className="landing-cta-secondary">
            <BookOpen className="h-4 w-4" aria-hidden />
            How it works
          </Link>
        </div>

        <div className="landing-features">
          {FEATURES.map(({ icon: Icon, label, detail }) => (
            <div key={label} className="landing-feature">
              <span className="landing-feature-icon" aria-hidden>
                <Icon className="h-4 w-4" strokeWidth={1.5} />
              </span>
              <div className="landing-feature-text">
                <span className="landing-feature-label">{label}</span>
                <span className="landing-feature-detail">{detail}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="landing-footnote">No mainnet funds · Market data from the LeverX indexer</p>

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
      </div>
    </div>
  );
}
