import { createFileRoute } from "@tanstack/react-router";
import { GuideStorybook } from "@/components/GuideStorybook";
import { pageTitle } from "@/lib/brand";
import { ui } from "@/lib/copy";

export const Route = createFileRoute("/_app/guide")({
  head: () => ({
    meta: [
      { title: pageTitle("How it works") },
      {
        name: "description",
        content: `${ui.appTagline}. Learn how leveraged Predict trades work on Sui testnet.`,
      },
    ],
  }),
  component: GuidePage,
});

function GuidePage() {
  return <GuideStorybook />;
}
