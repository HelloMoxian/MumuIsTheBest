import { type FormEvent, useEffect, useState } from "react";
import {
  loadLearningCoinBalance,
  setLearningCoinBalance,
} from "../../shared/learning-coins";
import { useNumericKeypadSubmission } from "../../shared/numeric-keypad";
import "./coin-reset.css";

type ManagementStatus = "idle" | "loading" | "saving" | "success" | "error";
type BalanceField = "knowledge" | "energy";

type EnergyCoinBalance = {
  balance: number;
  updatedAt: string;
};

type EnergyCoinSetResult = EnergyCoinBalance & {
  coinDelta: number;
};

async function requestEnergyCoins<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) {
    throw new Error(body?.message ?? "能量币服务暂时没有回应，请稍后再试。");
  }
  return body as T;
}

function loadEnergyCoinBalance(signal?: AbortSignal) {
  return requestEnergyCoins<EnergyCoinBalance>("/api/games/fruit-slice/energy-coins", { signal });
}

function setEnergyCoinBalance(password: string, balance: number) {
  return requestEnergyCoins<EnergyCoinSetResult>("/api/games/fruit-slice/energy-coins/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, balance }),
  });
}

export function CoinResetPage() {
  const [knowledgeCoinBalance, setKnowledgeCoinBalance] = useState<number | null>(null);
  const [energyCoinBalance, setEnergyCoinBalanceState] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [targetKnowledgeBalance, setTargetKnowledgeBalance] = useState("");
  const [targetEnergyBalance, setTargetEnergyBalance] = useState("");
  const [activeBalanceField, setActiveBalanceField] = useState<BalanceField>("knowledge");
  const [status, setStatus] = useState<ManagementStatus>("loading");
  const [message, setMessage] = useState("正在读取知识币和能量币余额…");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      loadLearningCoinBalance(controller.signal),
      loadEnergyCoinBalance(controller.signal),
    ])
      .then(([knowledgeResult, energyResult]) => {
        setKnowledgeCoinBalance(knowledgeResult.coinBalance);
        setEnergyCoinBalanceState(energyResult.balance);
        setTargetKnowledgeBalance(String(knowledgeResult.coinBalance));
        setTargetEnergyBalance(String(energyResult.balance));
        setStatus("idle");
        setMessage("输入一次家长密码，就可以同时保存两种货币的目标余额。");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "暂时无法读取货币余额。");
      });
    return () => controller.abort();
  }, []);

  useNumericKeypadSubmission(({ value }) => {
    const label = activeBalanceField === "knowledge" ? "知识币" : "能量币";
    if (activeBalanceField === "knowledge") setTargetKnowledgeBalance(String(value));
    else setTargetEnergyBalance(String(value));
    setStatus("idle");
    setMessage(`数字键盘已经把${label}目标余额填为 ${value.toLocaleString("zh-CN")}。`);
  });

  async function submitBalance(event: FormEvent) {
    event.preventDefault();
    const parsedKnowledgeBalance = Number(targetKnowledgeBalance);
    const parsedEnergyBalance = Number(targetEnergyBalance);
    const invalidBalance = (value: number) => (
      !Number.isInteger(value) || value < 0 || value > 1_000_000_000
    );
    if (
      !password.trim()
      || status === "saving"
      || !targetKnowledgeBalance.trim()
      || !targetEnergyBalance.trim()
      || invalidBalance(parsedKnowledgeBalance)
      || invalidBalance(parsedEnergyBalance)
    ) {
      setStatus("error");
      setMessage("请输入家长密码，并为知识币和能量币填写 0 至 10 亿之间的整数余额。");
      return;
    }
    setStatus("saving");
    setMessage("正在安全保存知识币和能量币余额…");
    try {
      const [knowledgeResult, energyResult] = await Promise.all([
        setLearningCoinBalance(password.trim(), parsedKnowledgeBalance),
        setEnergyCoinBalance(password.trim(), parsedEnergyBalance),
      ]);
      setKnowledgeCoinBalance(knowledgeResult.progress.coinBalance);
      setEnergyCoinBalanceState(energyResult.balance);
      setPassword("");
      setStatus("success");
      setMessage(`知识币已设置为 ${parsedKnowledgeBalance.toLocaleString("zh-CN")}，能量币已设置为 ${parsedEnergyBalance.toLocaleString("zh-CN")}；已有学习和游戏进度都没有改变。`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "货币余额暂时没有设置成功。");
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
            <span className="coin-reset-chip">家长功能 · 货币管理</span>
            <h1 id="coin-reset-title">设置货币余额</h1>
            <p>这里只调整知识币和能量币余额，不会清除已经点亮的知识、游戏战报或矿物进度。</p>
          </div>

          <div className="coin-balance-overview" aria-live="polite">
            <div className="coin-balance-panel is-knowledge">
              <span>当前知识币</span>
              <strong>{knowledgeCoinBalance === null ? "—" : knowledgeCoinBalance.toLocaleString("zh-CN")}</strong>
              <small>学习奖励与矿物研究使用</small>
            </div>
            <div className="coin-balance-panel is-energy">
              <span>当前能量币</span>
              <strong>{energyCoinBalance === null ? "—" : energyCoinBalance.toLocaleString("zh-CN")}</strong>
              <small>体感游戏奖励与地质锤购买使用</small>
            </div>
          </div>

          <form className="coin-reset-form" onSubmit={(event) => void submitBalance(event)}>
            <div className="coin-reset-fields">
              <label className="coin-reset-password-field" htmlFor="coin-reset-password">
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
              <label htmlFor="knowledge-coin-target-balance">
                <span>知识币目标余额</span>
                <input
                  id="knowledge-coin-target-balance"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1_000_000_000}
                  step={1}
                  value={targetKnowledgeBalance}
                  onChange={(event) => {
                    setTargetKnowledgeBalance(event.target.value);
                    if (status === "error") setStatus("idle");
                  }}
                  onFocus={() => setActiveBalanceField("knowledge")}
                  placeholder="输入 0 或指定余额"
                  disabled={busy}
                  aria-describedby="coin-reset-message"
                />
              </label>
              <label htmlFor="energy-coin-target-balance">
                <span>能量币目标余额</span>
                <input
                  id="energy-coin-target-balance"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1_000_000_000}
                  step={1}
                  value={targetEnergyBalance}
                  onChange={(event) => {
                    setTargetEnergyBalance(event.target.value);
                    if (status === "error") setStatus("idle");
                  }}
                  onFocus={() => setActiveBalanceField("energy")}
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
                setTargetKnowledgeBalance("0");
                setTargetEnergyBalance("0");
                setStatus("idle");
                setMessage("两种目标余额都已填为 0，输入家长密码后确认保存即可清零。");
              }}
            >
              两种余额都填入 0（清零）
            </button>
            <button
              type="submit"
              disabled={busy || !password.trim() || !targetKnowledgeBalance.trim() || !targetEnergyBalance.trim()}
            >
              {status === "saving" ? "正在保存两种余额…" : "确认设置两种余额"}
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
