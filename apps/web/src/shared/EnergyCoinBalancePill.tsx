import { useEffect, useState } from "react";

const energyCoinUrl = new URL(
  "../../../../assets/game/energy-coin.v1.png",
  import.meta.url,
).href;

export function EnergyCoinBalancePill() {
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/games/fruit-slice/energy-coins", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { balance?: number; message?: string };
        if (!response.ok || typeof body.balance !== "number") {
          throw new Error(body.message ?? "能量币余额暂时无法读取。");
        }
        setBalance(body.balance);
        setError(null);
      })
      .catch((loadError) => {
        if ((loadError as DOMException).name !== "AbortError") {
          setError(loadError instanceof Error ? loadError.message : "能量币余额暂时无法读取。");
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <div
      className={`home-energy-coin-balance ${error ? "has-error" : ""}`}
      title={error ?? "木木完成体感游戏后可以获得能量币"}
      aria-label={error ?? `能量币余额 ${balance ?? "正在读取"}`}
    >
      <img src={energyCoinUrl} alt="" />
      <span><small>能量币</small><strong>{balance ?? "…"}</strong></span>
    </div>
  );
}
