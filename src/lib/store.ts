import { create } from "zustand";
import {
  createInitialState,
  tick,
  type Mode,
  type RegimeId,
  type SimState,
} from "@/lib/sim";

interface SimStore extends SimState {
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
  kill: () => void;
  resume: () => void;
  reset: () => void;
}

export const useSim = create<SimStore>((set, get) => ({
  ...createInitialState(),
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
      ...createInitialState((prev.seed + 41) | 0),
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
