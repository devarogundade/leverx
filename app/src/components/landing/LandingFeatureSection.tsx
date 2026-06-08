import type { ReactNode } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  eyebrow: string;
  title: string;
  lead: string;
  bullets: readonly string[];
  cta?: { label: string; to: LinkProps["to"] };
  illustration: ReactNode;
  reverse?: boolean;
  className?: string;
}

export function LandingFeatureSection({
  id,
  eyebrow,
  title,
  lead,
  bullets,
  cta,
  illustration,
  reverse = false,
  className,
}: Props) {
  return (
    <section id={id} className={cn("landing-feature-block", reverse && "landing-feature-block--reverse", className)}>
      <div className="landing-feature-block-visual" aria-hidden>
        {illustration}
      </div>
      <div className="landing-feature-block-copy">
        <p className="landing-feature-eyebrow">{eyebrow}</p>
        <h2 className="landing-feature-title">{title}</h2>
        <p className="landing-feature-lead">{lead}</p>
        <ul className="landing-feature-bullets">
          {bullets.map((item) => (
            <li key={item}>
              <Check className="landing-feature-check" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {cta ? (
          <Link to={cta.to} className="landing-section-cta landing-feature-cta">
            {cta.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
