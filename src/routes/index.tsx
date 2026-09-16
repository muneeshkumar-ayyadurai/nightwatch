import { createFileRoute } from "@tanstack/react-router";
import { LandingView } from "@/components/marketing";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <LandingView />;
}
