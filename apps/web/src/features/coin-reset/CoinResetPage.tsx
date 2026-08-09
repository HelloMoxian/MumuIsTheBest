import { type FormEvent, useEffect, useState } from "react";
import {
  loadLearningCoinBalance,
  setLearningCoinBalance,
} from "../../shared/learning-coins";
import { useNumericKeypadSubmission } from "../../shared/numeric-keypad";
import "./coin-reset.css";

type ManagementStatus = "idle" | "loading" | "saving" | "success" | "error";

export function CoinResetPage() {
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [targetBalance, setTargetBalance] = useState("");
  const [status, setStatus] = useState<ManagementStatus>("loading");
  const [message, setMessage] = useState("正在读取万物构成塔的知识币余额…");

  useEffect(() => {
    const controller = new AbortController();
    loadLearningCoinBalance(controller.signal)
      .then((result) => {
        setCoinBalance(result.coinBalance);
        setTargetBalance(String(result.coinBalance));
        setStatus("idle");
        setMessage("输入家长密码和目标余额，可以清零，也可以设置为指定整数。");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "暂时无法读取知识币余额。");
      });
    return () => controller.abort();
  }, []);

  useNumericKeypadSubmission(({ value }) => {
    setTargetBalance(String(value));
    setStatus("idle");
    setMessage(`数字键盘已经放入目标余额 ${value.toLocaleString("zh-CN")}，输入家长密码后确认保存。`);
  });

  async function submitBalance(event: FormEvent) {
    event.preventDefault();
    const parsedBalance = Number(targetBalance);
    if (
      !password.trim()
      || status === "saving"
      || !Number.isInteger(parsedBalance)
      || parsedBalance < 0
      || parsedBalance > 1_000_000_000
    ) {
      setStatus("error");
      setMessage("请输入家长密码，以及 0 至 10 亿之间的整数余额。");
      return;
    }
    setStatus("saving");
    setMessage("正在安全保存知识币余额…");
    try {
      const result = await setLearningCoinBalance(password.trim(), parsedBalance);
      setCoinBalance(result.progress.coinBalance);
      setPassword("");
      setStatus("success");
      setMessage(`知识币余额已经设置为 ${parsedBalance.toLocaleString("zh-CN")}，万物构成塔的解锁进度没有改变。`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "知识币余额暂时没有设置成功。");
    }
  }

  const busy = status === "loading" || status === "saving";

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
            <h1 id="coin-reset-title">设置知识币</h1>
            <p>这里只调整知识币余额，不会清除已经点亮的节点、知识或背包道具。</p>
          </div>

          <div className="coin-balance-panel" aria-live="polite">
            <span>当前知识币</span>
            <strong>{coinBalance === null ? "—" : coinBalance.toLocaleString("zh-CN")}</strong>
            <small>答对数学题获得的币会汇总到这里</small>
          </div>

          <form className="coin-reset-form" onSubmit={(event) => void submitBalance(event)}>
            <div className="coin-reset-fields">
              <label htmlFor="coin-reset-password">
                <span>家长密码</span>
                <input
                  id="coin-reset-password"
                  type="password"
                  inputMode="numeric"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (status === "error") setStatus("idle");
                  }}
                  maxLength={64}
                  autoComplete="off"
                  placeholder="请输入 6 位密码"
                  disabled={busy}
                  aria-describedby="coin-reset-message"
                />
              </label>
              <label htmlFor="coin-target-balance">
                <span>目标余额</span>
                <input
                  id="coin-target-balance"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1_000_000_000}
                  step={1}
                  value={targetBalance}
                  onChange={(event) => {
                    setTargetBalance(event.target.value);
                    if (status === "error") setStatus("idle");
                  }}
                  placeholder="输入 0 或指定余额"
                  disabled={busy}
                  aria-describedby="coin-reset-message"
                />
              </label>
            </div>
            <button
              className="coin-zero-button"
              type="button"
              disabled={busy}
              onClick={() => {
                setTargetBalance("0");
                setStatus("idle");
                setMessage("目标余额已填为 0，输入家长密码后确认保存即可清零。");
              }}
            >
              快速填入 0（清零）
            </button>
            <button type="submit" disabled={busy || !password.trim() || !targetBalance.trim()}>
              {status === "saving" ? "正在保存…" : "确认设置余额"}
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
            <span><b>+2</b> 加减练习 · 每题</span>
            <span><b>+4 / +6 / +8</b> 算术大战 · 简单 / 中等 / 超难</span>
            <span><b>+2 / +3 / +5</b> 乘法小能手 · 乘法 / 逆向除法 / 进阶</span>
            <span><b>+10 / +30 / +60 / +150</b> 找数字 · 百 / 千 / 万 / 十万</span>
            <span><b>+20</b> 猫鼠游戏</span>
            <span className="is-triple"><b>×3</b> 三倍玩法 · 按对应基础分乘三</span>
          </div>
        </section>
      </main>
    </div>
  );
}
