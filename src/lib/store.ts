import { create } from "zustand";
import { DEFAULT_PAIR_ID, type NseTape } from "@/lib/nse";
import {
  appendBars,
  createInitialState,
  playTape,
  tick,
  type Mode,
  type RegimeId,
  type SimState,
} from "@/lib/sim";
import type { ValidationReport } from "@/lib/validate-ou";

interface SimStore extends SimState {
  feedStatus: "sim" | "loading" | "nse";
  validation: ValidationReport | null;
  step: () => void;
  setRunning: (running: boolean) => void;
  setSpeed: (speed: number) => void;
  setMode: (mode: Mode) => void;
  setForceRegime: (regime: RegimeId | null) => void;
  setFilterOn: (on: boolean) => void;
  setKellyBlend: (n: number) => void;
  setMaxDd: (n: number) => void;
  setDailyLoss: (n: number) => void;
  setAutoFlatten: (on: boolean) => void;
  setPair: (pairId: string) => void;
  markFeedLoading: () => void;
  hydrateFeed: (tape: NseTape) => void;
  appendFeed: (tape: NseTape) => void;
  kill: () => void;
  resume: () => void;
  reset: () => void;
}

export const useSim = create<SimStore>((set, get) => ({
  ...createInitialState(),
  feedStatus: "loading",
  validation: null,
  step: () => set(tick(get())),
  setRunning: (running) => set({ running }),
  setSpeed: (speed) => set({ speed }),
  setMode: (mode) => set({ mode }),
  setForceRegime: (forceRegime) => set({ forceRegime }),
  setFilterOn: (filterOn) => set({ filterOn }),
  setKellyBlend: (kellyBlend) => set({ kellyBlend }),
  setMaxDd: (maxDd) => set({ maxDd }),
  setDailyLoss: (dailyLoss) => set({ dailyLoss }),
  setAutoFlatten: (autoFlattenCrisis) => set({ autoFlattenCrisis }),
  setPair: (pairId) => {
    const prev = get();
    set({
      ...createInitialState(prev.seed, pairId),
      feedStatus: "loading",
      validation: null,
      mode: prev.mode,
      speed: prev.speed,
      kellyBlend: prev.kellyBlend,
      maxDd: prev.maxDd,
      dailyLoss: prev.dailyLoss,
      filterOn: prev.filterOn,
      autoFlattenCrisis: prev.autoFlattenCrisis,
    });
  },
  markFeedLoading: () => set({ feedStatus: "loading" }),
  hydrateFeed: (tape) => {
    const prev = get();
    const played = playTape(prev.seed, tape);
    set({
      ...played,
      feedStatus: "nse",
      mode: prev.mode,
      speed: prev.speed,
      kellyBlend: prev.kellyBlend,
      maxDd: prev.maxDd,
      dailyLoss: prev.dailyLoss,
      filterOn: prev.filterOn,
      autoFlattenCrisis: prev.autoFlattenCrisis,
      killed: false,
      killReason: null,
      validation: tape.validation ?? null,
    });
  },
  appendFeed: (tape) => {
    const prev = get();
    if (prev.pairId !== tape.pairId) return;
    set({ ...appendBars(prev, tape), feedStatus: "nse" });
  },
  kill: () =>
    set((s) =>
      tick({
        ...s,
        killed: true,
        killReason: "Manual kill switch",
        running: false,
        filtered: { ...s.filtered, paused: true },
      }),
    ),
  resume: () =>
    set({
      killed: false,
      killReason: null,
      running: true,
      filtered: { ...get().filtered, paused: false },
    }),
  reset: () => {
    const prev = get();
    set({
      ...createInitialState((prev.seed + 41) | 0, prev.pairId || DEFAULT_PAIR_ID),
      feedStatus: "loading",
      validation: null,
      mode: prev.mode,
      speed: prev.speed,
      kellyBlend: prev.kellyBlend,
      maxDd: prev.maxDd,
      dailyLoss: prev.dailyLoss,
      filterOn: prev.filterOn,
      autoFlattenCrisis: prev.autoFlattenCrisis,
    });
  },
}));
