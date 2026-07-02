import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getJSON } from "../api";
import type { AwardResult, Progress } from "../types";

interface Toast {
  id: number;
  title: string;
  sub?: string;
}

interface GamifyContextValue {
  progress: Progress | null;
  refresh: () => Promise<void>;
  celebrate: (award?: AwardResult) => void;
}

const GamifyContext = createContext<GamifyContextValue>({
  progress: null,
  refresh: async () => {},
  celebrate: () => {},
});

export function useGamify() {
  return useContext(GamifyContext);
}

let toastId = 0;

export function GamifyProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const refresh = useCallback(async () => {
    try {
      setProgress(await getJSON<Progress>("/api/progress"));
    } catch {
      // server not up yet
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pushToast = useCallback((title: string, sub?: string) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, title, sub }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const celebrate = useCallback(
    (award?: AwardResult) => {
      if (award) {
        pushToast(`+${award.xpGained} XP`, award.leveledUp ? "LEVEL UP! 🎉" : undefined);
        for (const b of award.newBadges) {
          pushToast(`${b.emoji} Badge unlocked: ${b.name}`, b.description);
        }
      }
      void refresh();
    },
    [pushToast, refresh],
  );

  return (
    <GamifyContext.Provider value={{ progress, refresh, celebrate }}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.title}
            {t.sub && <div className="sub-line">{t.sub}</div>}
          </div>
        ))}
      </div>
    </GamifyContext.Provider>
  );
}

export function XpBar() {
  const { progress } = useGamify();
  if (!progress) return null;
  const { level, xp } = progress;
  const span = (level.nextXp ?? xp) - level.xp || 1;
  const pct = level.nextXp ? Math.min(100, ((xp - level.xp) / span) * 100) : 100;
  return (
    <div className="xpbar-wrap">
      <div className="xpbar">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="xp-meta">
        <span>
          Lv {level.level} · {level.title}
        </span>
        <span>{level.nextXp ? `${xp} / ${level.nextXp} XP → ${level.nextTitle}` : `${xp} XP · MAX`}</span>
      </div>
    </div>
  );
}
