import { useEffect, useState } from "react";
import { isOnboarded, markOnboarded } from "@/lib/prefs";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    title: "Two books. One tape.",
    body: "The regime book and the always-on book trade the same KO/PEP spread. The only difference is the weather report. That gap is the product.",
  },
  {
    title: "Force a crisis.",
    body: "Use the regime chips on the desk. Crisis should flatten the filtered book while the naive book keeps reaching. If it does not, the gate is off.",
  },
  {
    title: "You are the approval gate.",
    body: "Kill switch, size, and whether the filter is on — those stay human. Nightwatch runs the tape. You decide when to stand aside.",
  },
];

export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isOnboarded()) setOpen(true);
  }, []);

  if (!open) return null;

  const last = step === STEPS.length - 1;
  const current = STEPS[step]!;

  function finish() {
    markOnboarded();
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboard-title"
        className="w-full max-w-md rounded-2xl bg-card p-6 text-card-foreground shadow-[var(--shadow-border)]"
      >
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          Paper desk · {step + 1} of {STEPS.length}
        </p>
        <h2
          id="onboard-title"
          className="mt-2 font-display text-3xl italic leading-none"
        >
          {current.title}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {current.body}
        </p>
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={finish}>
            Skip
          </Button>
          <Button onClick={last ? finish : () => setStep((n) => n + 1)}>
            {last ? "Open the desk" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
