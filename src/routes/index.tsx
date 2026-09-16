import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { DeskView } from "@/components/desk";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <AppShell>
      <DeskView />
    </AppShell>
  );
}
