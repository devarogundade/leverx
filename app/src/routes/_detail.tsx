import { createFileRoute } from "@tanstack/react-router";
import { DetailLayout } from "@/components/DetailLayout";

export const Route = createFileRoute("/_detail")({
  component: DetailLayout,
});
