import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { DeskView } from "@/components/desk";
import { Onboarding } from "@/components/onboarding";

export const Route = createFileRoute("/desk")({ component: DeskPage });

function DeskPage() {
  return (
    <AppShell>
      <Onboarding />
      <DeskView />
    </AppShell>
  );
}
