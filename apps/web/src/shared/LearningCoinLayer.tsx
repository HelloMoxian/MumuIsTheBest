import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  awardLearningCoins,
  LEARNING_COINS_AWARDED_EVENT,
  LEARNING_COINS_CHANGED_EVENT,
  LEARNING_REWARD_SESSION_EVENT,
  loadLearningCoinBalance,
  startLearningRewardSession,
  type LearningRewardKey,
  type LearningCoinAward,
  type LearningCoinBalance,
  type LearningCoinSource,
  type LearningRewardSession,
} from "./learning-coins";
import "./learning-coins.css";

type CoinStatusContextValue = {
  status: LearningCoinBalance | null;
  error: string | null;
  refresh: () => Promise<void>;
};

type CoinParticle = {
  id: string;
  style: CSSProperties;
};

type CoinBurst = {
  id: string;
  amount: number;
  particles: CoinParticle[];
};

const CoinStatusContext = createContext<CoinStatusContextValue | null>(null);

const GAME_SOURCE_BY_PATH: Readonly<Record<string, LearningCoinSource>> = {
  "/math/add-subtract": "math:add-subtract",
  "/math/arithmetic-battle": "math:arithmetic-battle",
  "/math/multiplication": "math:multiplication",
  "/math/find-number": "math:find-number",
  "/math/cat-mouse-game": "math:cat-mouse-game",
};

function createBurst(award: LearningCoinAward): CoinBurst {
  const target = document.querySelector<HTMLElement>("[data-learning-coin-target]");
  const targetRect = target?.getBoundingClientRect();
  const endX = targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth - 78;
  const endY = targetRect ? targetRect.top + targetRect.height / 2 : 62;
  const startX = window.innerWidth * 0.5;
  const startY = Math.min(window.innerHeight * 0.68, window.innerHeight - 110);
  const visualCount = Math.min(award.rewardCoins, 150);
  const particles = Array.from({ length: visualCount }, (_, index) => {
    const spreadX = (Math.random() - 0.5) * Math.min(320, window.innerWidth * 0.42);
    const spreadY = (Math.random() - 0.5) * 120;
    const sx = startX + spreadX;
    const sy = startY + spreadY;
    const m1x = sx + (Math.random() - 0.5) * 100;
    const m1y = sy - 65 - Math.random() * 105;
    const m2x = endX + (Math.random() - 0.5) * Math.min(230, window.innerWidth * 0.3);
    const m2y = endY + 60 + Math.random() * 145;
    const delay = Math.min(index * 26, 3_250) + Math.random() * 95;
    const duration = 920 + Math.random() * 520;
    return {
      id: `${award.source}-${index}-${Math.random().toString(36).slice(2)}`,
      style: {
        "--coin-sx": `${sx}px`,
        "--coin-sy": `${sy}px`,
        "--coin-m1x": `${m1x}px`,
        "--coin-m1y": `${m1y}px`,
        "--coin-m2x": `${m2x}px`,
        "--coin-m2y": `${m2y}px`,
        "--coin-ex": `${endX}px`,
        "--coin-ey": `${endY}px`,
        "--coin-delay": `${delay}ms`,
        "--coin-duration": `${duration}ms`,
        "--coin-wobble": `${Math.random() * 26 - 13}deg`,
        "--coin-wobble-negative": `${Math.random() * -26}deg`,
      } as CSSProperties,
    };
  });
  return { id: crypto.randomUUID(), amount: award.rewardCoins, particles };
}

export function LearningCoinLayer({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LearningCoinBalance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<LearningRewardSession | null>(null);
  const [bursts, setBursts] = useState<CoinBurst[]>([]);
  const [isPulsing, setIsPulsing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const pulseTimerRef = useRef<number | null>(null);
  const burstTimersRef = useRef<number[]>([]);

  const refresh = useCallback(async () => {
    try {
      const next = await loadLearningCoinBalance();
      setStatus(next);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "知识币暂时没有回应。");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!status) return;
    const delay = Math.max(100, Date.parse(status.promotion.endsAt) - Date.now() + 120);
    const timer = window.setTimeout(() => void refresh(), delay);
    return () => window.clearTimeout(timer);
  }, [refresh, status]);

  useEffect(() => {
    const onBalanceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ coinBalance: number; updatedAt: string }>).detail;
      setStatus((current) => current ? { ...current, ...detail } : current);
    };
    const onSession = (event: Event) => {
      const next = (event as CustomEvent<LearningRewardSession>).detail;
      if (GAME_SOURCE_BY_PATH[window.location.pathname] === next.source) setSession(next);
    };
    const onAward = (event: Event) => {
      const award = (event as CustomEvent<LearningCoinAward>).detail;
      setStatus((current) => current ? {
        ...current,
        coinBalance: award.progress.coinBalance,
        updatedAt: award.progress.updatedAt,
      } : current);
      setAnnouncement(`获得 ${award.rewardCoins} 个知识币，现在共有 ${award.progress.coinBalance} 个。`);
      const burst = createBurst(award);
      setBursts((current) => [...current, burst]);
      let burstTimer = 0;
      burstTimer = window.setTimeout(() => {
        setBursts((current) => current.filter((candidate) => candidate.id !== burst.id));
        burstTimersRef.current = burstTimersRef.current.filter((timer) => timer !== burstTimer);
      }, 6_200);
      burstTimersRef.current.push(burstTimer);
      if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current);
      setIsPulsing(true);
      pulseTimerRef.current = window.setTimeout(() => setIsPulsing(false), 5_200);
    };
    window.addEventListener(LEARNING_COINS_CHANGED_EVENT, onBalanceChange);
    window.addEventListener(LEARNING_REWARD_SESSION_EVENT, onSession);
    window.addEventListener(LEARNING_COINS_AWARDED_EVENT, onAward);
    return () => {
      window.removeEventListener(LEARNING_COINS_CHANGED_EVENT, onBalanceChange);
      window.removeEventListener(LEARNING_REWARD_SESSION_EVENT, onSession);
      window.removeEventListener(LEARNING_COINS_AWARDED_EVENT, onAward);
      if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current);
      burstTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const contextValue = useMemo(() => ({ status, error, refresh }), [error, refresh, status]);
  const gameSource = GAME_SOURCE_BY_PATH[window.location.pathname];

  return (
    <CoinStatusContext.Provider value={contextValue}>
      {children}
      {gameSource && (
        <div
          className={`learning-coin-hud is-floating ${isPulsing ? "is-pulsing" : ""}`}
          data-learning-coin-target
          aria-label={status ? `知识币余额 ${status.coinBalance}` : "正在读取知识币余额"}
        >
          <span className="learning-coin-symbol" aria-hidden="true">✦</span>
          <span><small>知识币</small><strong>{status?.coinBalance ?? "…"}</strong></span>
          {session?.source === gameSource && session.multiplier === 3 && (
            <em>本局 ×3 已锁定</em>
          )}
        </div>
      )}
      <div className="learning-coin-live" aria-live="polite">{announcement}</div>
      <div className="learning-coin-burst-layer" aria-hidden="true">
        {bursts.map((burst) => (
          <div className="learning-coin-burst" key={burst.id}>
            <strong className="learning-coin-gain">+{burst.amount} 知识币</strong>
            {burst.particles.map((particle) => (
              <span className="learning-coin-particle" style={particle.style} key={particle.id}>
                <i>✦</i>
              </span>
            ))}
          </div>
        ))}
      </div>
    </CoinStatusContext.Provider>
  );
}

export function useLearningCoinStatus() {
  const context = useContext(CoinStatusContext);
  if (!context) throw new Error("useLearningCoinStatus 必须在 LearningCoinLayer 内使用。");
  return context;
}

export function LearningCoinBalancePill({ className = "" }: { className?: string }) {
  const { status, error } = useLearningCoinStatus();
  return (
    <div
      className={`learning-coin-hud ${className}`}
      data-learning-coin-target
      title={error ?? "知识币会在完成学习任务后增加"}
      aria-label={error ?? (status ? `知识币余额 ${status.coinBalance}` : "正在读取知识币余额")}
    >
      <span className="learning-coin-symbol" aria-hidden="true">✦</span>
      <span><small>知识币</small><strong>{status?.coinBalance ?? "…"}</strong></span>
    </div>
  );
}

export function useLearningRewardSession(source: LearningCoinSource) {
  const sessionPromiseRef = useRef<Promise<LearningRewardSession> | null>(null);
  const [session, setSession] = useState<LearningRewardSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const promotionId = typeof window === "undefined"
    ? undefined
    : new URLSearchParams(window.location.search).get("promotion") ?? undefined;

  const ensureSession = useCallback(() => {
    sessionPromiseRef.current ??= startLearningRewardSession(source, promotionId)
      .then((created) => {
        setSession(created);
        setError(null);
        return created;
      })
      .catch((sessionError) => {
        sessionPromiseRef.current = null;
        setError(sessionError instanceof Error ? sessionError.message : "奖励场次暂时无法建立。");
        throw sessionError;
      });
    return sessionPromiseRef.current;
  }, [promotionId, source]);

  useEffect(() => {
    void ensureSession().catch(() => undefined);
  }, [ensureSession]);

  const award = useCallback(async (rewardKey?: LearningRewardKey, eventId = crypto.randomUUID()) => {
    const lockedSession = await ensureSession();
    return awardLearningCoins(source, eventId, { sessionId: lockedSession.id, rewardKey });
  }, [ensureSession, source]);

  return useMemo(() => ({ session, error, award }), [award, error, session]);
}
