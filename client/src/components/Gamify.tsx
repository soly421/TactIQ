import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getJSON, getToken } from "../api";
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
const CONFETTI_COLORS = ["#ff5f00", "#ff8c3a", "#ffd166", "#12b76a", "#2970ff", "#f04438"];

export function GamifyProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confetti, setConfetti] = useState<number>(0);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    try {
      setProgress(await getJSON<Progress>("/api/progress"));
    } catch {
      // signed out or server unavailable
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
        for (const q of award.questsCompleted ?? []) {
          pushToast(`${q.emoji} Quest complete: +${q.bonusXp} XP`, q.title);
        }
        for (const b of award.newBadges) {
          pushToast(`${b.emoji} Badge unlocked: ${b.name}`, b.description);
        }
        if (award.leveledUp || (award.questsCompleted?.length ?? 0) > 0 || award.newBadges.length > 0) {
          setConfetti(Date.now());
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
      {confetti > 0 && <Confetti key={confetti} />}
    </GamifyContext.Provider>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    duration: 2 + Math.random() * 1.2,
  }));
  return (
    <div className="confetti-layer">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }}
        />
      ))}
    </div>
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
        <span>Lv {level.level} · {level.title}</span>
        <span>{level.nextXp ? `${xp} / ${level.nextXp} XP → ${level.nextTitle}` : `${xp} XP · MAX`}</span>
      </div>
    </div>
  );
}
