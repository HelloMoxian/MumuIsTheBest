import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AddSubtractGame } from "./features/add-subtract/AddSubtractGame";
import { ArithmeticBattleGame } from "./features/arithmetic-battle/ArithmeticBattleGame";
import { MultiplicationGame } from "./features/multiplication/MultiplicationGame";
import { MysteryFunctionGame } from "./features/mystery-function/MysteryFunctionGame";
import { NumericKeypadLayer } from "./shared/NumericKeypadLayer";
import { EnergyCoinBalancePill } from "./shared/EnergyCoinBalancePill";
import {
  LearningCoinBalancePill,
  LearningCoinLayer,
  useLearningCoinStatus,
} from "./shared/LearningCoinLayer";
import type { LearningCoinSource } from "./shared/learning-coins";
import { openNumericKeypad } from "./shared/numeric-keypad";
import {
  CompactExperienceControls,
  GlobalExperienceLayer,
  LocalizedLines,
  translateUiText,
} from "./shared/experience";
import "./styles.css";

const TetrisGame = lazy(async () => {
  const module = await import("./features/tetris/TetrisGame");
  return { default: module.TetrisGame };
});

const FindNumberGame = lazy(async () => {
  const module = await import("./features/find-number/FindNumberGame");
  return { default: module.FindNumberGame };
});

const CatMouseGame = lazy(async () => {
  const module = await import("./features/cat-mouse-game/CatMouseGame");
  return { default: module.CatMouseGame };
});

const CoinResetPage = lazy(async () => {
  const module = await import("./features/coin-reset/CoinResetPage");
  return { default: module.CoinResetPage };
});

const CommonCharactersGame = lazy(async () => {
  const module = await import("./features/chinese-characters/CommonCharactersGame");
  return { default: module.CommonCharactersGame };
});

const PinyinBridgePage = lazy(async () => {
  const module = await import("./features/pinyin-bridge/PinyinBridgePage");
  return { default: module.PinyinBridgePage };
});

const RhymeEnlightenmentPage = lazy(async () => {
  const module = await import("./features/rhyme-enlightenment/RhymeEnlightenmentPage");
  return { default: module.RhymeEnlightenmentPage };
});

const MissionLabRoute = lazy(async () => {
  const module = await import("./features/mission-lab/MissionLabRoute");
  return { default: module.MissionLabRoute };
});

const PeriodicTablePage = lazy(async () => {
  const module = await import("./features/periodic-table/PeriodicTablePage");
  return { default: module.PeriodicTablePage };
});

const ReactionFurnacePage = lazy(async () => {
  const module = await import("./features/reaction-furnace/ReactionFurnacePage");
  return { default: module.ReactionFurnacePage };
});

const MoleculeFactoryPage = lazy(async () => {
  const module = await import("./features/molecule-factory/MoleculeFactoryPage");
  return { default: module.MoleculeFactoryPage };
});

const WorldTowerPage = lazy(async () => {
  const module = await import("./features/world-tower/WorldTowerPage");
  return { default: module.WorldTowerPage };
});

const MathKnowledgeTowerPage = lazy(async () => {
  const module = await import("./features/math-knowledge-tower/MathKnowledgeTowerPage");
  return { default: module.MathKnowledgeTowerPage };
});

const EnglishEchoIslandPage = lazy(async () => {
  const module = await import("./features/english-echo-island/EnglishEchoIslandPage");
  return { default: module.EnglishEchoIslandPage };
});

const BejeweledGame = lazy(async () => {
  const module = await import("./features/bejeweled/BejeweledGame");
  return { default: module.BejeweledGame };
});

const GemConnectGame = lazy(async () => {
  const module = await import("./features/gem-connect/GemConnectGame");
  return { default: module.GemConnectGame };
});

const FruitSliceGame = lazy(async () => {
  const module = await import("./features/fruit-slice/FruitSliceGame");
  return { default: module.FruitSliceGame };
});

const GalaxyRacerGame = lazy(async () => {
  const module = await import("./features/galaxy-racer/GalaxyRacerGame");
  return { default: module.GalaxyRacerGame };
});

const RedFortressGame = lazy(async () => {
  const module = await import("./features/red-fortress/RedFortressGame");
  return { default: module.RedFortressGame };
});

const DrawingStudioPage = lazy(async () => {
  const module = await import("./features/drawing-studio/DrawingStudioPage");
  return { default: module.DrawingStudioPage };
});

const RockMineralGame = lazy(async () => {
  const module = await import("./features/rock-minerals/RockMineralGame");
  return { default: module.RockMineralGame };
});

const UniversityTop100Page = lazy(async () => {
  const module = await import("./features/university-top100/UniversityTop100Page");
  return { default: module.UniversityTop100Page };
});

function ChemistryLoading({ label }: { label: string }) {
  return (
    <div className="app-shell" aria-live="polite">
      <div className="star-field" aria-hidden="true" />
      <main className="asr-lab">
        <section className="safety-note">
          <span aria-hidden="true">⬡</span><p><strong>正在打开{label}…</strong></p>
        </section>
      </main>
    </div>
  );
}

const MISSION_LAB_ROUTES = new Set([
  "/chemistry/experiment-master",
]);

const DEFAULT_ENDPOINT =
  "wss://llm-v5rvizd868hi5qxb.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference";
const MAX_ASR_SECONDS = 10 * 60;
const ENCOURAGEMENTS = [
  "今天认真一点点，明天进步一大步。",
  "每一次尝试，都是在给自己加能量。",
  "不会没关系，愿意学就很了不起。",
  "慢慢来，也是在向前走。",
  "把小问题想明白，就是大本领。",
  "努力练习，答案会越来越清楚。",
  "今天比昨天多懂一点，真棒！",
  "勇敢问为什么，知识就会来找你。",
  "认真完成的小任务，会变成闪闪的成长。",
  "遇到难题不逃跑，木木正在变强大。",
  "多试一次，离成功就更近一点。",
  "好奇心是最棒的探索小火箭。",
  "每学会一个新知识，星空就多亮一颗星。",
  "耐心想一想，办法常常就出现了。",
  "努力不是比赛，是每天给自己一个拥抱。",
  "答错也没关系，它在告诉你下一步怎么走。",
  "小小的坚持，会长成大大的自信。",
  "先认真听，再大胆说，木木真会学习。",
  "每一道题，都是一次聪明的练习。",
  "今天的汗水，是明天的超能力。",
  "把‘我不会’换成‘我再试试’。",
  "学习像闯关，耐心就是秘密道具。",
  "认真观察，世界里藏着好多答案。",
  "动动小脑袋，新的办法正在靠近。",
  "进步不需要很快，只要每天都在发生。",
  "努力的木木，每天都有新发现。",
  "把问题拆小一点，勇气就变大一点。",
  "学会等待和思考，也是一种厉害。",
  "每一次专心，都会让自己更闪亮。",
  "勇敢开口问，就是探索的开始。",
  "认真练习的样子，本来就很酷。",
  "今天完成一小步，梦想就靠近一小步。",
  "不怕慢，只怕不出发；木木已经出发啦！",
  "你愿意坚持，这件事本身就值得骄傲。",
  "学习的新本领，正在一点一点装进口袋。",
  "发现、提问、尝试，木木的成长三颗星。",
  "每次专注十分钟，都是给未来的礼物。",
  "难题像迷宫，耐心会带你找到出口。",
  "知识很好玩，努力会让它越来越好玩。",
  "今天的木木，正在成为更喜欢学习的自己。",
] as const;

type SessionState = "idle" | "connecting" | "listening" | "finishing" | "completed" | "error";
type TranscriptLine = { id: number; text: string };
type AsrConfiguration = {
  endpoint: string;
  isConfigured: boolean;
  storage: "local-file" | "environment" | "none";
};
type SubjectIconKind = "games" | "math" | "english" | "chemistry" | "nature" | "chinese" | "classics" | "planning";
type GamePlaceholder = {
  title: string;
  mark: string;
  description: string;
  shape?: "wide" | "tall" | "compact";
  comingSoon?: boolean;
  href?: string;
  rewardSource?: LearningCoinSource;
};
type SubjectBoard = {
  id: string;
  title: string;
  caption: string;
  icon: SubjectIconKind;
  games: GamePlaceholder[];
};

const SUBJECT_BOARDS: SubjectBoard[] = [
  {
    id: "games",
    title: "游戏",
    caption: "动一动、想一想，一起探索游戏星河",
    icon: "games",
    games: [
      {
        title: "俄罗斯方块",
        mark: "▦",
        description: "拼出晶莹水晶，单人双人自由玩，消行听中英鼓励",
        shape: "wide",
        href: "/games/tetris",
      },
      {
        title: "星际极速赛",
        mark: "✦",
        description: "移动头部换车道，驾驶三套赛车连续点亮六座星门",
        shape: "wide",
        href: "/games/galaxy-racer",
      },
      {
        title: "切水果",
        mark: "⚡",
        description: "摄像头识别挥手，支持单人和双人对战",
        shape: "wide",
        href: "/games/fruit-slice",
      },
      {
        title: "画图",
        mark: "✎",
        description: "在无限白板上画线、摆图元和自由涂色",
        shape: "wide",
        href: "/games/drawing-studio",
      },
      {
        title: "宝石连连看",
        mark: "◆",
        description: "连接彩色宝石，轻松探索十关，记录每一次通关时间",
        shape: "wide",
        href: "/games/gem-connect",
      },
      {
        title: "赤色要塞",
        mark: "∞",
        description: "双车协作闯四关，营救升级并挑战关卡 Boss",
        shape: "wide",
        href: "/games/red-fortress",
      },
      {
        title: "宝石迷阵",
        mark: "◆",
        description: "交换闪亮宝石，触发连锁消除，永久收藏每一份星光",
        shape: "wide",
        href: "/games/bejeweled",
      },
    ],
  },
  {
    id: "math",
    title: "数学",
    caption: "让数字变成好玩的闯关伙伴",
    icon: "math",
    games: [
      { title: "加减练习", mark: "＋−", description: "0—20 快速计算", shape: "wide", href: "/math/add-subtract", rewardSource: "math:add-subtract" },
      {
        title: "算数大战",
        mark: "⚔",
        description: "同时解开多颗答案星",
        shape: "compact",
        href: "/math/arithmetic-battle",
        rewardSource: "math:arithmetic-battle",
      },
      {
        title: "乘法小能手",
        mark: "×",
        description: "乘法与整除星际挑战",
        shape: "tall",
        href: "/math/multiplication",
        rewardSource: "math:multiplication",
      },
      {
        title: "神秘函数",
        mark: "ƒ",
        description: "拨动参数，看曲线变身",
        shape: "compact",
        href: "/math/mystery-function",
      },
      {
        title: "找数字",
        mark: "⌕",
        description: "问问大小，缩小数字范围",
        shape: "wide",
        href: "/math/find-number",
        rewardSource: "math:find-number",
      },
      {
        title: "猫鼠游戏",
        mark: "x?",
        description: "观察动画场景，列式解开谜题",
        shape: "compact",
        href: "/math/cat-mouse-game",
        rewardSource: "math:cat-mouse-game",
      },
      {
        title: "数学知识塔",
        mark: "517",
        description: "点亮四级熟练度，从一年级向九年级攀登",
        shape: "wide",
        href: "/math/knowledge-tower",
      },
    ],
  },
  {
    id: "english",
    title: "英语",
    caption: "先听声音，再把英文和中文连起来",
    icon: "english",
    games: [
      {
        title: "英语回声岛",
        mark: "Aa",
        description: "1000 句双语真人录音，专注听懂一整句",
        shape: "wide",
        href: "/english/echo-island",
        rewardSource: "english:echo-island",
      },
    ],
  },
  {
    id: "chemistry",
    title: "化学",
    caption: "把小小粒子变成大大发现",
    icon: "chemistry",
    games: [
      {
        title: "元素周期表",
        mark: "He",
        description: "认识 118 位元素朋友",
        shape: "wide",
        href: "/chemistry/periodic-table",
      },
      {
        title: "反应熔炉",
        mark: "⚗",
        description: "把原子组装成奇妙物质",
        shape: "compact",
        href: "/chemistry/reaction-furnace",
      },
      {
        title: "分子工厂",
        mark: "✦",
        description: "投放原子，选择合成并发现原子团",
        shape: "wide",
        href: "/chemistry/molecule-factory",
      },
      {
        title: "实验大师",
        mark: "⌁",
        description: "先预测，再解释实验现象",
        shape: "compact",
        href: "/chemistry/experiment-master",
      },
      {
        title: "物质塔",
        mark: "✦",
        description: "十六层精选节点，从基本粒子发现到宇宙",
        shape: "wide",
        href: "/world-tower",
      },
    ],
  },
  {
    id: "nature",
    title: "自然",
    caption: "向地下出发，读懂岩石记录的地球故事",
    icon: "nature",
    games: [
      {
        title: "岩石与矿物",
        mark: "◇",
        description: "敲开未知地层，发现并研究 128 种自然样本",
        shape: "wide",
        href: "/nature/rock-minerals",
      },
    ],
  },
  {
    id: "chinese",
    title: "语文",
    caption: "读一读、认一认，文字会发光",
    icon: "chinese",
    games: [
      { title: "拼音星桥", mark: "ā", description: "浏览全部拼音和相关汉字", shape: "compact", href: "/chinese/pinyin" },
      { title: "常用500字", mark: "500", description: "每天认识一点", shape: "wide", href: "/chinese/common-characters/500" },
      { title: "常用1000字", mark: "1000", description: "收集文字星星", shape: "compact", href: "/chinese/common-characters/1000" },
      { title: "常用1500字", mark: "1500", description: "读懂更多故事", shape: "compact", href: "/chinese/common-characters/1500" },
      { title: "常用2000字", mark: "2000", description: "探索更大字海", shape: "compact", href: "/chinese/common-characters/2000" },
      { title: "常用2500字", mark: "2500", description: "知识小宇宙", shape: "wide", href: "/chinese/common-characters/2500" },
    ],
  },
  {
    id: "classics",
    title: "国学",
    caption: "读懂古人的词语、画面和故事",
    icon: "classics",
    games: [
      {
        title: "声律启蒙",
        mark: "韵",
        description: "逐句听读，发现对子里的意思",
        shape: "wide",
        href: "/classics/rhyme-enlightenment",
      },
    ],
  },
  {
    id: "planning",
    title: "规划",
    caption: "看看更远的目标，认识未来可以去的地方",
    icon: "planning",
    games: [
      {
        title: "大学",
        mark: "TOP",
        description: "按专业查看世界大学 Top100",
        shape: "wide",
        href: "/universities/top100",
      },
    ],
  },
];

function SubjectGlyph({ kind }: { kind: SubjectIconKind }) {
  if (kind === "games") {
    return <span className="subject-glyph glyph-games" aria-hidden="true"><i /><b>⚡</b></span>;
  }
  if (kind === "math") {
    return <span className="subject-glyph glyph-math" aria-hidden="true"><i /><b>×</b></span>;
  }
  if (kind === "chemistry") {
    return <span className="subject-glyph glyph-chemistry" aria-hidden="true"><i /><i /><i /></span>;
  }
  if (kind === "nature") {
    return <span className="subject-glyph glyph-nature" aria-hidden="true"><i /><i /><b>◇</b></span>;
  }
  if (kind === "english") {
    return <span className="subject-glyph glyph-letter glyph-english" aria-hidden="true">Aa</span>;
  }
  if (kind === "chinese") {
    return <span className="subject-glyph glyph-letter" aria-hidden="true">文</span>;
  }
  if (kind === "classics") {
    return <span className="subject-glyph glyph-letter glyph-classics" aria-hidden="true">雅</span>;
  }
  if (kind === "planning") {
    return <span className="subject-glyph glyph-planning" aria-hidden="true"><i /><i /><b>TOP</b></span>;
  }
  return null;
}

class PcmCapture {
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private processor?: ScriptProcessorNode;
  private silentGain?: GainNode;
  private stream?: MediaStream;

  async start(onChunk: (chunk: ArrayBuffer) => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    this.context = new AudioContext();
    this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.silentGain = this.context.createGain();
    this.silentGain.gain.value = 0;

    this.processor.onaudioprocess = (event) => {
      const samples = event.inputBuffer.getChannelData(0);
      onChunk(toPcm16(samples, this.context?.sampleRate ?? 48_000, 16_000));
    };

    this.source.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(this.context.destination);
    await this.context.resume();
  }

  async stop() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.silentGain?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    await this.context?.close();
    this.context = undefined;
    this.source = undefined;
    this.processor = undefined;
    this.silentGain = undefined;
    this.stream = undefined;
  }
}

function toPcm16(input: Float32Array, inputRate: number, targetRate: number): ArrayBuffer {
  const ratio = inputRate / targetRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Int16Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let total = 0;
    let count = 0;
    for (let sample = start; sample < end; sample += 1) {
      total += input[sample];
      count += 1;
    }
    const value = Math.max(-1, Math.min(1, count ? total / count : 0));
    output[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }

  return output.buffer;
}

function getSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/asr/stream`;
}

function stateCopy(state: SessionState) {
  const copy: Record<SessionState, string> = {
    idle: "准备就绪",
    connecting: "正在连接星际识别舱",
    listening: "正在聆听",
    finishing: "正在整理最后一句",
    completed: "本次识别完成",
    error: "需要检查一下",
  };
  return copy[state];
}

function App() {
  const { status: learningCoinStatus } = useLearningCoinStatus();
  const [encouragement] = useState(
    () => ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)],
  );
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [configuration, setConfiguration] = useState<AsrConfiguration | null>(null);
  const [isSavingConfiguration, setIsSavingConfiguration] = useState(false);
  const [state, setState] = useState<SessionState>("idle");
  const [statusDetail, setStatusDetail] = useState("先保存本机配置，然后按下开始录入。");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [finalLines, setFinalLines] = useState<TranscriptLine[]>([]);
  const [interim, setInterim] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(MAX_ASR_SECONDS);
  const socketRef = useRef<WebSocket | null>(null);
  const captureRef = useRef(new PcmCapture());
  const safetyTimerRef = useRef<number | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);

  const clearSafetyTimer = () => {
    if (safetyTimerRef.current !== null) window.clearInterval(safetyTimerRef.current);
    safetyTimerRef.current = null;
    sessionStartedAtRef.current = null;
  };

  const endCapture = async () => {
    await captureRef.current.stop();
  };

  const stopRecognition = async (becauseOfLimit = false) => {
    clearSafetyTimer();
    await endCapture();
    setInterim("");
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      setState("finishing");
      setStatusDetail(becauseOfLimit ? "已到 10 分钟上限，正在整理最后一句…" : "正在把最后一句送回星际实验舱…");
      socketRef.current.send(JSON.stringify({ type: "stop" }));
    } else {
      setState("completed");
    }
  };

  const beginListening = async () => {
    if (!configuration?.isConfigured) {
      setError({ code: "API_KEY_REQUIRED", message: "请先在顶部粘贴 API Key，并点击“保存本机配置”。" });
      setState("error");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError({ code: "MIC_UNAVAILABLE", message: "这个浏览器无法使用麦克风，请换用现代浏览器并允许麦克风权限。" });
      setState("error");
      return;
    }

    setError(null);
    setInterim("");
    setFinalLines([]);
    setState("connecting");
    setStatusDetail("正在建立安全的识别通道…");

    const socket = new WebSocket(getSocketUrl());
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "start" }));
    };

    socket.onmessage = async (event) => {
      const message = JSON.parse(String(event.data)) as {
        type: string;
        label?: string;
        status?: string;
        code?: string;
        message?: string;
        text?: string;
        sentenceId?: number;
        isFinal?: boolean;
      };

      if (message.type === "ready") {
        try {
          await captureRef.current.start((chunk) => {
            if (socket.readyState === WebSocket.OPEN) socket.send(chunk);
          });
          setState("listening");
          sessionStartedAtRef.current = Date.now();
          setRemainingSeconds(MAX_ASR_SECONDS);
          setStatusDetail("麦克风已开启。慢慢说，右侧会实时出现文字。单次最多 10 分钟。");
          safetyTimerRef.current = window.setInterval(() => {
            const startedAt = sessionStartedAtRef.current;
            if (!startedAt) return;
            const remaining = Math.max(0, MAX_ASR_SECONDS - Math.floor((Date.now() - startedAt) / 1000));
            setRemainingSeconds(remaining);
            if (remaining === 0) void stopRecognition(true);
          }, 250);
        } catch {
          setError({
            code: "MIC_PERMISSION_DENIED",
            message: "没有拿到麦克风权限。请在浏览器地址栏中允许麦克风后再试一次。",
          });
          setState("error");
          socket.send(JSON.stringify({ type: "stop" }));
        }
        return;
      }

      if (message.type === "result") {
        const text = message.text?.trim() ?? "";
        if (message.isFinal) {
          setFinalLines((lines) => {
            const remaining = lines.filter((line) => line.id !== message.sentenceId);
            return text ? [...remaining, { id: message.sentenceId ?? Date.now(), text }] : remaining;
          });
          setInterim("");
        } else {
          setInterim(text);
        }
        return;
      }

      if (message.type === "finished") {
        clearSafetyTimer();
        await endCapture();
        setInterim("");
        setState("completed");
        setStatusDetail(message.label ?? "识别完成。可以再开启一次新的任务。 ");
        return;
      }

      if (message.type === "status") {
        setStatusDetail(message.label ?? "识别连接状态发生变化。 ");
        return;
      }

      if (message.type === "limit") {
        clearSafetyTimer();
        await endCapture();
        setState("finishing");
        setStatusDetail(message.label ?? "已达到单次 10 分钟上限，正在停止识别。");
        return;
      }

      if (message.type === "error") {
        clearSafetyTimer();
        await endCapture();
        setError({ code: message.code ?? "ASR_ERROR", message: message.message ?? "识别服务出现了问题。" });
        setState("error");
      }
    };

    socket.onerror = () => {
      setError({ code: "LOCAL_SOCKET_ERROR", message: "本机语音服务连接失败。请确认开发服务已同时启动。" });
      setState("error");
    };

    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null;
    };
  };

  useEffect(() => {
    void fetch("/api/asr/config")
      .then(async (response) => {
        if (!response.ok) throw new Error("无法读取本机配置");
        return response.json() as Promise<AsrConfiguration>;
      })
      .then((savedConfiguration) => {
        setConfiguration(savedConfiguration);
        setEndpoint(savedConfiguration.endpoint);
        setStatusDetail(savedConfiguration.isConfigured ? "已加载本机 ASR 配置，可以开始录入。" : "粘贴 API Key 后保存到本机配置。 ");
      })
      .catch(() => setStatusDetail("暂时无法读取本机配置；请确认本地服务已经启动。"));

    return () => {
      clearSafetyTimer();
      void endCapture();
      socketRef.current?.close();
    };
  }, []);

  const saveConfiguration = async () => {
    setError(null);
    setIsSavingConfiguration(true);
    try {
      const response = await fetch("/api/asr/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() || undefined, endpoint: endpoint.trim() }),
      });
      const result = (await response.json()) as AsrConfiguration & { message?: string };
      if (!response.ok) throw new Error(result.message ?? "无法保存本机配置。");
      setConfiguration(result);
      setApiKey("");
      setStatusDetail("本机 ASR 配置已保存。密钥不会显示或同步到 Git。 ");
    } catch (saveError) {
      setError({
        code: "CONFIG_SAVE_FAILED",
        message: saveError instanceof Error ? saveError.message : "无法保存本机配置。",
      });
    } finally {
      setIsSavingConfiguration(false);
    }
  };

  const hasTranscript = finalLines.length > 0 || interim;
  const recording = state === "listening";
  const busy = state === "connecting" || state === "finishing";
  const timeLabel = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;

  return (
    <div className="app-shell">
      <div className="star-field" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="木木学习岛首页">
          <span className="brand-mark" aria-hidden="true">🚀</span>
          <span>木木学习岛</span>
        </a>
        <CompactExperienceControls />
        <nav className="nav-actions" aria-label="主导航">
          <a className="nav-link" href="#top">学习大厅</a>
          <button
            className="test-trigger numeric-keypad-nav-button"
            type="button"
            onClick={openNumericKeypad}
            aria-label="打开或收起右侧数字键盘"
          >
            数字键盘
          </button>
          <div className="test-menu">
            <button
              className="test-trigger"
              type="button"
              aria-expanded={menuOpen}
              aria-controls="test-menu-items"
              onClick={() => setMenuOpen((open) => !open)}
            >
              功能测试 <span aria-hidden="true">⌄</span>
            </button>
            {menuOpen && (
              <div id="test-menu-items" className="test-menu-items" role="menu">
                <a href="#asr-lab" role="menuitem" onClick={() => setMenuOpen(false)}>
                  <span aria-hidden="true">🎙️</span>
                  <span><strong>语音识别测试</strong><small>边说边出字</small></span>
                </a>
                <a href="/parent/coin-reset" role="menuitem" onClick={() => setMenuOpen(false)}>
                  <span aria-hidden="true">✦</span>
                  <span><strong>货币管理</strong><small>一次设置知识币与能量币</small></span>
                </a>
              </div>
            )}
          </div>
          <LearningCoinBalancePill className="home-learning-coin-balance" />
          <EnergyCoinBalancePill />
          <button className="avatar" type="button" aria-label="小小宇航员资料">👩‍🚀</button>
        </nav>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-art" aria-hidden="true" />
          <div className="hero-content">
            <p className="eyebrow"><span aria-hidden="true">✦</span> 木木的学习乐园 · 每天进步一点点</p>
            <h1 id="hero-title" data-no-ui-translation>
              <LocalizedLines
                zh={<>木木最努力，<em>{encouragement}</em></>}
                en={<>Mumu keeps trying. <em>{translateUiText(encouragement)}</em></>}
              />
            </h1>
            <p className="hero-copy">
              把好玩的小任务、知识问答和探索挑战，装进同一座星际学习岛。每一次认真尝试，都会让木木更有力量。
            </p>
            <a className="hero-button" href="#subject-board">开始今天的小冒险 <span aria-hidden="true">↓</span></a>
          </div>
        </section>

        <section id="subject-board" className="subject-board" aria-labelledby="subject-board-title">
          <div className="subject-board-heading">
            <div>
              <p className="eyebrow"><span aria-hidden="true">✦</span> 学科探索地图 · 玩法正在集合</p>
              <h2 id="subject-board-title" data-no-ui-translation>
                <LocalizedLines
                  zh={<>挑一块星图，<em>开始努力闯关。</em></>}
                  en={<>Choose a star map. <em>Start your learning mission.</em></>}
                />
              </h2>
            </div>
            <p>每一门学科都有不同的好玩入口。先从想试试的那一块开始吧！</p>
          </div>

          <div className="subject-rows">
            {SUBJECT_BOARDS.map((subject) => (
              <section className={`subject-row subject-${subject.id}`} key={subject.id} aria-labelledby={`${subject.id}-title`}>
                <div className="subject-intro">
                  <SubjectGlyph kind={subject.icon} />
                  <div>
                    <span className="subject-kicker">探索学科</span>
                    <h3 id={`${subject.id}-title`}>{subject.title}</h3>
                    <p>{subject.caption}</p>
                  </div>
                  <span className="subject-spark" aria-hidden="true">✦</span>
                </div>
                <div className="game-cluster" aria-label={`${subject.title}小游戏`}>
                  {subject.games.map((game) => {
                    const activePromotion = game.rewardSource
                      && learningCoinStatus?.promotion.source === game.rewardSource
                      ? learningCoinStatus.promotion
                      : null;
                    const isTripleReward = Boolean(activePromotion);
                    const gameHref = game.href && activePromotion
                      ? `${game.href}?promotion=${encodeURIComponent(activePromotion.id)}`
                      : game.href;
                    const content = (
                      <>
                        {isTripleReward && <span className="game-triple-badge">×3 知识币</span>}
                        <span className="game-mark" aria-hidden="true">{game.mark}</span>
                        <div>
                          <h4>{game.title}</h4>
                          <p>{game.description}</p>
                        </div>
                        <span className="game-status">
                          {game.href ? "开始练习 →" : game.comingSoon ? "正在准备" : "即将开放"}
                        </span>
                      </>
                    );
                    const className = `game-card ${game.shape ?? ""} ${game.comingSoon ? "is-coming" : ""} ${game.href ? "is-ready" : ""} ${isTripleReward ? "is-triple-reward" : ""}`;
                    return gameHref ? (
                      <a className={className} href={gameHref} key={game.title}>{content}</a>
                    ) : (
                      <article className={className} key={game.title}>{content}</article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section id="asr-lab" className="asr-lab" aria-labelledby="asr-title">
          <div className="section-title-row">
            <div>
              <p className="eyebrow"><span aria-hidden="true">◉</span> ALIYUN FUN-ASR REALTIME</p>
              <h2 id="asr-title">语音识别实验室</h2>
            </div>
            <span className={`connection-pill state-${state}`}><i aria-hidden="true" />{stateCopy(state)}</span>
          </div>

          <section className="credential-panel" aria-label="本机识别配置">
            <div className="credential-copy">
              <span className="security-orb" aria-hidden="true">🔐</span>
              <div>
                <strong>{configuration?.isConfigured ? "本机识别配置已就绪" : "配置你的识别引擎"}</strong>
                <p>{configuration?.isConfigured ? "密钥只保存在这台电脑的受保护文件中，不会显示、上传或写入 Git。" : "首次粘贴 API Key 后，点击保存；之后无需重复粘贴。"}</p>
              </div>
            </div>
            <label className="field api-key-field">
              <span>阿里云 API Key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={configuration?.isConfigured ? "已安全保存；如需更换，请粘贴新 Key" : "粘贴 sk-… API Key"}
                autoComplete="off"
                spellCheck="false"
                disabled={busy || recording}
                aria-describedby="api-key-help"
              />
              <small id="api-key-help">仅在点击“保存本机配置”时发送给本机服务；保存后不会回显明文。</small>
            </label>
            <label className="field endpoint-field">
              <span>实时 API 地址</span>
              <input
                type="url"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                autoComplete="off"
                spellCheck="false"
                disabled={busy || recording}
              />
              <small>仅接受阿里云百炼业务空间的安全 WebSocket 地址。</small>
            </label>
            <div className="credential-actions">
              <span className={`config-chip ${configuration?.isConfigured ? "is-configured" : ""}`}>
                <i aria-hidden="true" />{configuration?.isConfigured ? "已保存到本机" : "等待配置"}
              </span>
              <button
                className="save-config-button"
                type="button"
                onClick={() => void saveConfiguration()}
                disabled={busy || recording || isSavingConfiguration}
              >
                {isSavingConfiguration ? "正在保存…" : "保存本机配置"}
              </button>
            </div>
          </section>

          <div className="lab-grid">
            <article className="console-card microphone-card">
              <div className="card-heading"><span>声音采集器</span><span className="tiny-chip">上限 {timeLabel} · PCM</span></div>
              <div className={`microphone-stage ${recording ? "is-listening" : ""}`} aria-hidden="true">
                <span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="floating-atom atom-a">+</span>
                <span className="floating-atom atom-b">•</span><span className="floating-atom atom-c">✦</span>
                <div className="mic-orb"><span>🎙️</span></div>
                <div className="wave-bars"><i /><i /><i /><i /><i /><i /><i /></div>
              </div>
              <p className="status-copy" aria-live="polite">{statusDetail}</p>
              {recording ? (
                <button className="record-button stop" type="button" onClick={() => void stopRecognition()}>
                  <span aria-hidden="true">■</span> 停止录入
                </button>
              ) : (
                <button className="record-button" type="button" disabled={busy} onClick={() => void beginListening()}>
                  <span aria-hidden="true">●</span> {busy ? "正在准备…" : "开始录入"}
                </button>
              )}
              <p className="microphone-note">建议一次说一句话，说完后稍停一停。每次识别最多 10 分钟。</p>
            </article>

            <article className="console-card transcript-card" aria-labelledby="transcript-title">
              <div className="card-heading">
                <span id="transcript-title">实时识别文字</span>
                <span className="live-dot"><i />LIVE</span>
              </div>
              <div className="transcript-output" aria-live="polite" aria-atomic="false">
                {!hasTranscript && <div className="empty-transcript"><span aria-hidden="true">🛰️</span><strong>文字会出现在这里</strong><p>开始录入后，边说边看结果。</p></div>}
                {finalLines.map((line) => <p className="final-line" key={line.id}>{line.text}</p>)}
                {interim && <p className="interim-line">{interim}<span className="cursor" /></p>}
              </div>
              <div className="transcript-footer"><span>结果只停留在当前页面</span><span>不自动保存</span></div>
            </article>
          </div>

          {error && (
            <aside className="error-panel" role="alert">
              <span aria-hidden="true">⚠️</span>
              <div><strong>{error.code}</strong><p>{error.message}</p></div>
              <button type="button" onClick={() => { setError(null); setState("idle"); }}>知道了</button>
            </aside>
          )}

          <aside className="safety-note">
            <span aria-hidden="true">🪐</span>
            <p><strong>给家长的小提示：</strong>这是连通性测试，不会保存孩子的音频或识别文本。若出现错误，会显示可理解的原因，但不会显示或回传 API Key。</p>
          </aside>
        </section>
      </main>

      <footer>木木学习岛 · 努力让每一天都有新收获</footer>
    </div>
  );
}

function CurrentPage() {
  if (window.location.pathname === "/games/tetris") {
    return <Suspense fallback={<ChemistryLoading label="水晶俄罗斯方块" />}><TetrisGame /></Suspense>;
  }
  if (window.location.pathname === "/games/gem-connect") {
    return <Suspense fallback={<ChemistryLoading label="宝石连连看" />}><GemConnectGame /></Suspense>;
  }
  if (window.location.pathname === "/games/bejeweled") {
    return <Suspense fallback={<ChemistryLoading label="宝石迷阵" />}><BejeweledGame /></Suspense>;
  }
  if (window.location.pathname === "/universities/top100" || window.location.pathname === "/university/top100") {
    return <Suspense fallback={<ChemistryLoading label="大学 Top100 星图" />}><UniversityTop100Page /></Suspense>;
  }
  if (window.location.pathname === "/games/drawing-studio") {
    return <Suspense fallback={<ChemistryLoading label="星空画图舱" />}><DrawingStudioPage /></Suspense>;
  }
  if (window.location.pathname === "/games/fruit-slice") {
    return <Suspense fallback={<ChemistryLoading label="切水果体感舱" />}><FruitSliceGame /></Suspense>;
  }
  if (window.location.pathname === "/games/galaxy-racer") {
    return <Suspense fallback={<ChemistryLoading label="星际极速赛" />}><GalaxyRacerGame /></Suspense>;
  }
  if (window.location.pathname === "/games/red-fortress") {
    return <Suspense fallback={<ChemistryLoading label="双车远征要塞" />}><RedFortressGame /></Suspense>;
  }
  if (window.location.pathname === "/nature/rock-minerals") {
    return <Suspense fallback={<ChemistryLoading label="岩石与矿物探索舱" />}><RockMineralGame /></Suspense>;
  }
  if (window.location.pathname === "/math/add-subtract") return <AddSubtractGame />;
  if (window.location.pathname === "/math/arithmetic-battle") return <ArithmeticBattleGame />;
  if (window.location.pathname === "/math/multiplication") return <MultiplicationGame />;
  if (window.location.pathname === "/math/mystery-function") return <MysteryFunctionGame />;
  if (window.location.pathname === "/math/find-number") {
    return (
      <Suspense
        fallback={(
          <div className="app-shell" aria-live="polite">
            <div className="star-field" aria-hidden="true" />
            <main className="asr-lab">
              <section className="safety-note"><span aria-hidden="true">⌕</span><p><strong>正在打开数字雷达舱…</strong></p></section>
            </main>
          </div>
        )}
      >
        <FindNumberGame />
      </Suspense>
    );
  }
  if (window.location.pathname === "/math/cat-mouse-game") {
    return (
      <Suspense fallback={<ChemistryLoading label="猫鼠游戏" />}>
        <CatMouseGame />
      </Suspense>
    );
  }
  if (window.location.pathname === "/math/knowledge-tower") {
    return (
      <Suspense fallback={<ChemistryLoading label="数学知识塔" />}>
        <MathKnowledgeTowerPage />
      </Suspense>
    );
  }
  if (window.location.pathname === "/english/echo-island") {
    return (
      <Suspense fallback={<ChemistryLoading label="英语回声岛" />}>
        <EnglishEchoIslandPage />
      </Suspense>
    );
  }
  if (window.location.pathname === "/parent/coin-reset") {
    return (
      <Suspense fallback={<ChemistryLoading label="货币管理" />}>
        <CoinResetPage />
      </Suspense>
    );
  }
  if (window.location.pathname === "/chemistry/periodic-table") {
    return <Suspense fallback={<ChemistryLoading label="元素周期表" />}><PeriodicTablePage /></Suspense>;
  }
  if (window.location.pathname === "/chemistry/reaction-furnace") {
    return <Suspense fallback={<ChemistryLoading label="反应熔炉" />}><ReactionFurnacePage /></Suspense>;
  }
  if (
    window.location.pathname === "/chemistry/treasure-box"
    || window.location.pathname === "/chemistry/treasure-basin"
  ) {
    window.history.replaceState({}, "", "/chemistry/molecule-factory");
    return <Suspense fallback={<ChemistryLoading label="分子工厂" />}><MoleculeFactoryPage /></Suspense>;
  }
  if (window.location.pathname === "/chemistry/molecule-factory") {
    return <Suspense fallback={<ChemistryLoading label="分子工厂" />}><MoleculeFactoryPage /></Suspense>;
  }
  if (window.location.pathname === "/world-tower") {
    return <Suspense fallback={<ChemistryLoading label="物质塔" />}><WorldTowerPage /></Suspense>;
  }
  if (window.location.pathname === "/chinese/pinyin") {
    return (
      <Suspense
        fallback={(
          <div className="app-shell" aria-live="polite">
            <div className="star-field" aria-hidden="true" />
            <main className="asr-lab">
              <section className="safety-note"><span aria-hidden="true">ā</span><p><strong>正在铺开拼音星桥…</strong></p></section>
            </main>
          </div>
        )}
      >
        <PinyinBridgePage />
      </Suspense>
    );
  }
  if (window.location.pathname === "/classics/rhyme-enlightenment") {
    return (
      <Suspense
        fallback={(
          <div className="app-shell" aria-live="polite">
            <div className="star-field" aria-hidden="true" />
            <main className="asr-lab">
              <section className="safety-note"><span aria-hidden="true">雅</span><p><strong>正在展开声律启蒙精读舱…</strong></p></section>
            </main>
          </div>
        )}
      >
        <RhymeEnlightenmentPage />
      </Suspense>
    );
  }
  if (MISSION_LAB_ROUTES.has(window.location.pathname)) {
    return (
      <Suspense
        fallback={(
          <div className="app-shell" aria-live="polite">
            <div className="star-field" aria-hidden="true" />
            <main className="asr-lab">
              <section className="safety-note"><span aria-hidden="true">✦</span><p><strong>正在连接木木的探索任务舱…</strong></p></section>
            </main>
          </div>
        )}
      >
        <MissionLabRoute />
      </Suspense>
    );
  }
  if (/^\/chinese\/common-characters\/(500|1000|1500|2000|2500)$/.test(window.location.pathname)) {
    return (
      <Suspense
        fallback={(
          <div className="app-shell" aria-live="polite">
            <div className="star-field" aria-hidden="true" />
            <main className="asr-lab">
              <section className="safety-note"><span aria-hidden="true">文</span><p><strong>正在铺开木木的文字星图…</strong></p></section>
            </main>
          </div>
        )}
      >
        <CommonCharactersGame />
      </Suspense>
    );
  }
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <GlobalExperienceLayer>
    <LearningCoinLayer>
      <NumericKeypadLayer>
        <CurrentPage />
      </NumericKeypadLayer>
    </LearningCoinLayer>
  </GlobalExperienceLayer>,
);
