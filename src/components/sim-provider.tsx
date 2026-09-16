import { useEffect, type ReactNode } from "react";
import {
  prefsChanged,
  readPrefs,
  snapshotPrefs,
  writePrefs,
} from "@/lib/prefs";
import { useSim } from "@/lib/store";

export function SimProvider({ children }: { children: ReactNode }) {
  const running = useSim((s) => s.running);
  const speed = useSim((s) => s.speed);
  const killed = useSim((s) => s.killed);

  useEffect(() => {
    const saved = readPrefs();
    if (saved) useSim.setState(saved);
    return useSim.subscribe((s, prev) => {
      const next = snapshotPrefs(s);
      const before = snapshotPrefs(prev);
      if (prefsChanged(next, before)) writePrefs(next);
    });
  }, []);

  useEffect(() => {
    if (!running || killed) return;
    const ms = Math.max(80, 520 / speed);
    const id = window.setInterval(() => {
      useSim.getState().step();
    }, ms);
    return () => window.clearInterval(id);
  }, [running, speed, killed]);

  return children;
}
