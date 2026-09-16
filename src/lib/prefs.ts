import type { Mode } from "@/lib/sim";

export interface DeskPrefs {
  filterOn: boolean;
  kellyBlend: number;
  maxDd: number;
  dailyLoss: number;
  mode: Mode;
  autoFlattenCrisis: boolean;
  speed: number;
  pairId: string;
}

const PREFS_KEY = "nightwatch.prefs.v1";
const ONBOARD_KEY = "nightwatch.onboarded.v1";
const WAITLIST_KEY = "nightwatch.waitlist.v1";

export function readPrefs(): Partial<DeskPrefs> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<DeskPrefs>;
  } catch {
    return null;
  }
}

export function writePrefs(p: DeskPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* quota */
  }
}

export function prefsChanged(
  a: DeskPrefs,
  b: DeskPrefs,
): boolean {
  return (
    a.filterOn !== b.filterOn ||
    a.kellyBlend !== b.kellyBlend ||
    a.maxDd !== b.maxDd ||
    a.dailyLoss !== b.dailyLoss ||
    a.mode !== b.mode ||
    a.autoFlattenCrisis !== b.autoFlattenCrisis ||
    a.speed !== b.speed ||
    a.pairId !== b.pairId
  );
}

export function snapshotPrefs(s: DeskPrefs): DeskPrefs {
  return {
    filterOn: s.filterOn,
    kellyBlend: s.kellyBlend,
    maxDd: s.maxDd,
    dailyLoss: s.dailyLoss,
    mode: s.mode,
    autoFlattenCrisis: s.autoFlattenCrisis,
    speed: s.speed,
    pairId: s.pairId,
  };
}

export function isOnboarded(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(ONBOARD_KEY) === "1";
}

export function markOnboarded() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARD_KEY, "1");
}

export function readWaitlist(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(WAITLIST_KEY);
}

export function writeWaitlist(email: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WAITLIST_KEY, email.trim().toLowerCase());
}
