import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { InfoPopover, LabelWithInfo } from "@/components/leverx/InfoPopover";
import { pageTitle } from "@/lib/brand";
import { ui } from "@/lib/copy";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { pageSimple, pageSimpleTitle } from "@/lib/leverx/tw";
import { routePendingOptions } from "@/lib/router/route-options";

const KEEPER_IMAGE = "devarogundade/leverx-keeper";

const DOCKER_RUN = `docker run -d \\
  --name leverx-keeper \\
  -p 3001:3001 \\
  -e KEEPER_PRIVATE_KEY=your_wallet_private_key \\
  ${KEEPER_IMAGE}`;

const DOCKER_PULL = `docker pull ${KEEPER_IMAGE}`;

export const Route = createFileRoute("/_app/keeper")({
  ...routePendingOptions,
  loader: () => null,
  head: () => ({
    meta: [
      { title: pageTitle("Helper") },
      {
        name: "description",
        content: "Trade price predictions with dUSDC margin at up to 10× leverage on the LeverX demo.",
      },
    ],
  }),
  component: KeeperPage,
});

function KeeperPage() {
  return (
    <section className={pageSimple}>
      <div className="page-simple-title-wrap">
        <h1 className={pageSimpleTitle}>{ui.keeperPageTitle}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{ui.keeperPageHint}</p>
      </div>

      <div className="keeper-steps">
        <KeeperStep
          step={1}
          title={ui.keeperStepPull}
          hint={leverxInfo.keeperPull}
          code={DOCKER_PULL}
        />
        <KeeperStep
          step={2}
          title={
            <LabelWithInfo label={ui.keeperStepKey} info={leverxInfo.keeperPrivateKey} />
          }
          hint={leverxInfo.keeperKeyHint}
          code="KEEPER_PRIVATE_KEY=your_wallet_private_key"
        />
        <KeeperStep
          step={3}
          title={
            <LabelWithInfo label={ui.keeperStepRun} info={leverxInfo.keeperRun} />
          }
          hint={leverxInfo.keeperRunHint}
          code={DOCKER_RUN}
        />
      </div>

      <div className="keeper-after-run">
        <p className="text-sm text-muted-foreground">
          <LabelWithInfo label={ui.keeperHealthLabel} info={leverxInfo.keeperHealth} />
        </p>
        <pre className="keeper-code-block">
          <code>curl http://localhost:3001/health</code>
        </pre>
        <p className="text-sm text-muted-foreground">{ui.keeperIndexerHint}</p>
      </div>

      <p className="text-sm text-muted-foreground">
        {ui.keeperRewardsHint}{" "}
        <InfoPopover title="Rewards">{leverxInfo.keeperRewards}</InfoPopover>
      </p>

      <Link to="/vault" className="keeper-vault-link">
        {ui.keeperVaultLink}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}

function KeeperStep({
  step,
  title,
  hint,
  code,
}: {
  step: number;
  title: ReactNode;
  hint: ReactNode;
  code: string;
}) {
  return (
    <article className="keeper-step-card">
      <span className="keeper-step-num">{step}</span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>
        <pre className="keeper-code-block mt-3">
          <code>{code}</code>
        </pre>
      </div>
    </article>
  );
}
