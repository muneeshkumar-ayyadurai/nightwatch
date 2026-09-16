import { useEffect, type ReactNode } from "react";
import { fetchNseTape } from "@/lib/nse-feed";
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
  const pairId = useSim((s) => s.pairId);
  const feedStatus = useSim((s) => s.feedStatus);

  useEffect(() => {
    const saved = readPrefs();
    if (saved) {
      const { pairId: savedPair, ...rest } = saved;
      if (savedPair && savedPair !== useSim.getState().pairId) {
        useSim.getState().setPair(savedPair);
      }
      useSim.setState(rest);
    }
    return useSim.subscribe((s, prev) => {
      const next = snapshotPrefs(s);
      const before = snapshotPrefs(prev);
      if (prefsChanged(next, before)) writePrefs(next);
    });
  }, []);

  useEffect(() => {
    if (feedStatus !== "loading") return;
    let cancelled = false;
    fetchNseTape({ data: { pairId } })
      .then((tape) => {
        if (cancelled) return;
        if (tape) {
          try {
            useSim.getState().hydrateFeed(tape);
          } catch {
            useSim.setState({ feedStatus: "sim" });
          }
        } else useSim.setState({ feedStatus: "sim" });
      })
      .catch(() => {
        if (!cancelled) useSim.setState({ feedStatus: "sim" });
      });
    return () => {
      cancelled = true;
    };
  }, [pairId, feedStatus]);

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
