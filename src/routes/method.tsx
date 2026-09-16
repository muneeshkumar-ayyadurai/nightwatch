import { createFileRoute } from "@tanstack/react-router";
import { MethodView } from "@/components/marketing";

export const Route = createFileRoute("/method")({ component: MethodPage });

function MethodPage() {
  return <MethodView />;
}
