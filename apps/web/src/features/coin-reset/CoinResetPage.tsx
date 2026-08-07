import { type FormEvent, useEffect, useState } from "react";
import {
  loadLearningCoinBalance,
  resetLearningCoins,
} from "../../shared/learning-coins";
import "./coin-reset.css";

type ResetStatus = "idle" | "loading" | "resetting" | "success" | "error";

export function CoinResetPage() {
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<ResetStatus>("loading");
  const [message, setMessage] = useState("正在读取万物构成塔的知识币余额…");

  useEffect(() => {
    const controller = new AbortController();
    loadLearningCoinBalance(controller.signal)
      .then((result) => {
        setCoinBalance(result.coinBalance);
        setStatus("idle");
        setMessage("输入家长密码后，可以把知识币余额重置为 0。");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "暂时无法读取知识币余额。");
      });
    return () => controller.abort();
  }, []);

  async function submitReset(event: FormEvent) {
    event.preventDefault();
    if (!password.trim() || status === "resetting") return;
    setStatus("resetting");
    setMessage("正在安全重置知识币…");
    try {
      const result = await resetLearningCoins(password.trim());
      setCoinBalance(result.progress.coinBalance);
      setPassword("");
      setStatus("success");
      setMessage("知识币已经重置为 0，万物构成塔的解锁进度没有改变。");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "知识币暂时没有重置成功。");
    }
  }

  const busy = status === "loading" || status === "resetting";

  return (
    <div className="coin-reset-page">
      <div className="coin-reset-stars" aria-hidden="true" />
      <header className="coin-reset-topbar">
        <a href="/">← 返回学习大厅</a>
        <strong><span aria-hidden="true">✦</span> 家长功能页</strong>
      </header>

      <main className="coin-reset-main">
        <section className="coin-reset-card" aria-labelledby="coin-reset-title">
          <div className="coin-reset-heading">
            <span className="coin-reset-chip">万物构成塔 · 知识币管理</span>
            <h1 id="coin-reset-title">重置知识币</h1>
            <p>这里只调整知识币余额，不会清除已经点亮的节点、知识或背包道具。</p>
          </div>

          <div className="coin-balance-panel" aria-live="polite">
            <span>当前知识币</span>
            <strong>{coinBalance === null ? "—" : coinBalance.toLocaleString("zh-CN")}</strong>
            <small>答对数学题获得的币会汇总到这里</small>
          </div>

          <form className="coin-reset-form" onSubmit={(event) => void submitReset(event)}>
            <label htmlFor="coin-reset-password">家长密码</label>
            <input
              id="coin-reset-password"
              type="password"
              inputMode="numeric"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (status === "error") {
                  setStatus("idle");
                  setMessage("输入家长密码后，可以把知识币余额重置为 0。");
                }
              }}
              maxLength={64}
              autoComplete="off"
              placeholder="请输入 6 位密码"
              disabled={busy}
              aria-describedby="coin-reset-message"
            />
            <button type="submit" disabled={busy || !password.trim()}>
              {status === "resetting" ? "正在重置…" : "确认重置为 0"}
            </button>
          </form>

          <p
            id="coin-reset-message"
            className={`coin-reset-message state-${status}`}
            role={status === "error" ? "alert" : "status"}
          >
            {message}
          </p>

          <div className="coin-reward-rules" aria-label="数学题知识币规则">
            <span><b>+1</b> 基础加减法</span>
            <span><b>+5</b> 复杂运算</span>
            <span><b>+20</b> 猫鼠游戏</span>
          </div>
        </section>
      </main>
    </div>
  );
}
