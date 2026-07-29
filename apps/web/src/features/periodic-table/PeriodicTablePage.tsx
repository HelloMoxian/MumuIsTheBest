import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  AsrRecognitionSession,
  readAsrConfiguration,
  type RecognitionResult,
  type RecognitionState,
} from "../add-subtract/asr-client";
import {
  chemicalSummary,
  discoveryLabel,
  elementCompounds,
  elementUses,
  kelvinLabel,
  neutronEstimate,
  nucleusParticleCounts,
  stateLabel,
  type ElementRecord,
} from "./element-knowledge";
import { ELEMENTS } from "./elements.generated";
import {
  applyNavigationCommands,
  findElement,
  isBackCommand,
  isDetailCommand,
  parseNavigationCommands,
} from "./logic";
import "./periodic-table.css";

type VoiceState = RecognitionState | "idle" | "unconfigured";
type ElementButtonMap = Map<number, HTMLButtonElement>;
type VoiceSentenceProgress = {
  directionCount: number;
  detailHandled: boolean;
  backHandled: boolean;
};

const CATEGORY_ORDER = [
  "alkali-metal",
  "alkaline-earth",
  "transition-metal",
  "post-transition-metal",
  "metalloid",
  "nonmetal",
  "halogen",
  "noble-gas",
  "lanthanide",
  "actinide",
] as const;

const CATEGORY_LABELS: Readonly<Record<(typeof CATEGORY_ORDER)[number], string>> = {
  "alkali-metal": "碱金属",
  "alkaline-earth": "碱土金属",
  "transition-metal": "过渡金属",
  "post-transition-metal": "其他金属",
  metalloid: "类金属",
  nonmetal: "非金属",
  halogen: "卤素",
  "noble-gas": "稀有气体",
  lanthanide: "镧系",
  actinide: "锕系",
};

function voiceLabel(state: VoiceState) {
  const labels: Record<VoiceState, string> = {
    idle: "语音导航未开启",
    unconfigured: "需要先配置语音",
    connecting: "正在连接语音",
    listening: "正在听方向指令",
    finishing: "正在结束识别",
    limited: "本次已到 2 分钟",
    stopped: "语音导航已停止",
    error: "语音暂时不可用",
  };
  return labels[state];
}

function AtomicModel({ element }: { element: ElementRecord }) {
  const neutronCount = neutronEstimate(element);
  const nucleusCounts = nucleusParticleCounts(element);
  const displayedNucleonCount = nucleusCounts.protons + nucleusCounts.neutrons;
  const nucleons = Array.from({ length: displayedNucleonCount }, (_, index) => {
    const currentProtonCount = Math.floor((index * nucleusCounts.protons) / displayedNucleonCount);
    const nextProtonCount = Math.floor(((index + 1) * nucleusCounts.protons) / displayedNucleonCount);
    const kind = nextProtonCount > currentProtonCount ? "proton" : "neutron";
    const angle = index * 2.399963 + element.atomicNumber * 0.29;
    const maxRadius = displayedNucleonCount <= 1
      ? 0
      : nucleusCounts.exactDisplay
        ? Math.min(54, 16 + Math.sqrt(displayedNucleonCount) * 8.5)
        : 55;
    const radius = maxRadius * Math.sqrt((index + 0.35) / displayedNucleonCount);
    return {
      kind,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.88,
      rotation: (index * 47 + element.atomicNumber * 13) % 180,
    };
  });
  const nucleusSize = nucleusCounts.exactDisplay
    ? Math.min(148, 108 + displayedNucleonCount * 2)
    : 152;
  const nucleonSize = displayedNucleonCount <= 4
    ? 36
    : displayedNucleonCount <= 12
      ? 30
      : 25;

  return (
    <figure className={`atom-model atom-${element.category}`} aria-labelledby="atom-caption">
      <div className="atom-canvas" aria-hidden="true">
        <div className="atom-aura" />
        {element.shells.map((electronCount, shellIndex) => {
          const outer = shellIndex === element.shells.length - 1;
          const size = 34 + shellIndex * (58 / Math.max(1, element.shells.length - 1));
          const tilt = (shellIndex % 2 ? -1 : 1) * (7 + shellIndex * 4);
          const orbitDuration = 11 + shellIndex * 4.5;
          const shellStyle = {
            "--shell-size": `${size}%`,
            "--shell-tilt": `${tilt}deg`,
            "--electron-counter-tilt": `${-tilt}deg`,
            "--orbit-duration": `${orbitDuration}s`,
          } as CSSProperties;
          return (
            <div
              className={`electron-shell ${outer ? "is-outer" : "is-inner"} ${shellIndex % 2 ? "is-reverse" : "is-forward"}`}
              style={shellStyle}
              key={`${element.atomicNumber}-shell-${shellIndex}`}
            >
              <span className="orbit-line" />
              <span className="electron-track">
                {Array.from({ length: electronCount }, (_, electronIndex) => {
                  const start = (electronIndex / Math.max(1, electronCount)) * 100;
                  const electronStyle = {
                    "--electron-start": `${start}%`,
                    "--electron-delay": `${-(start / 100) * orbitDuration}s`,
                  } as CSSProperties;
                  return (
                    <span
                      className="electron-runner"
                      style={electronStyle}
                      key={`${shellIndex}-${electronIndex}`}
                    >
                      <i className="electron">−</i>
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
        <div
          className={`nucleus ${nucleusCounts.exactDisplay ? "is-exact" : "is-representative"}`}
          style={{ "--nucleus-size": `${nucleusSize}px` } as CSSProperties}
        >
          <span className="nucleon-cluster">
            {nucleons.map((nucleon, index) => {
            const particleStyle = {
              left: `calc(50% + ${nucleon.x}px)`,
              top: `calc(50% + ${nucleon.y}px)`,
              "--nucleon-size": `${nucleonSize + (index % 3) * 2}px`,
              "--nucleon-rotation": `${nucleon.rotation}deg`,
              "--particle-delay": `${-(index % 8) * 0.23}s`,
            } as CSSProperties;
            return (
              <i
                className={nucleon.kind}
                style={particleStyle}
                key={index}
              />
            );
            })}
          </span>
          <strong className="nucleus-symbol">{element.symbol}</strong>
          <span className="nuclear-charge">
            <small>核电荷</small><b>{element.atomicNumber}<sup>+</sup></b>
          </span>
        </div>
      </div>
      <figcaption id="atom-caption">
        <span>电子层：{element.shells.join(" · ")}</span>
        <small>{element.atomicNumber} 个质子 · 约 {neutronCount} 个中子 · {element.atomicNumber} 个电子</small>
        <em>
          {nucleusCounts.exactDisplay ? "核子按数量展示" : "较重原子核使用比例示意"}
          {" · "}粉色为质子，蓝色为中子，带 − 圆点为电子
        </em>
      </figcaption>
    </figure>
  );
}

function Property({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | number | null;
  wide?: boolean;
}) {
  return (
    <div className={`element-property ${wide ? "is-wide" : ""}`}>
      <span>{label}</span>
      <strong>{value ?? "暂无可靠数据"}</strong>
    </div>
  );
}

function ElementDetail({
  element,
  onClose,
}: {
  element: ElementRecord;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const compounds = elementCompounds(element);
  const uses = elementUses(element);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="element-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className={`element-dialog category-${element.category}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="element-detail-title"
      >
        <header className="element-dialog-header">
          <div>
            <span className="detail-route">元素档案 · 第 {element.atomicNumber} 号</span>
            <span className="detail-category">{element.categoryLabel}</span>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose}>
            <span aria-hidden="true">←</span> 返回周期表
          </button>
        </header>

        <div className="element-dialog-scroll">
          <div className="element-detail-layout">
            <aside className="atom-column">
              <div className="element-identity">
                <span className="identity-number">{element.atomicNumber}</span>
                <strong>{element.symbol}</strong>
                <div>
                  <h2 id="element-detail-title">{element.chineseName}</h2>
                  <p>{element.pinyin} · {element.englishName}</p>
                </div>
                <span className="identity-mass">Ar {element.atomicMass}</span>
              </div>
              <AtomicModel element={element} />
              <div className="atom-note">
                <span aria-hidden="true">✦</span>
                <p>{chemicalSummary(element)}</p>
              </div>
            </aside>

            <article className="element-story">
              <section className="story-hero">
                <p className="story-kicker">认识 {element.chineseName} · {element.symbol}</p>
                <h3>{uses[0]}</h3>
                <p>{uses[1]}</p>
              </section>

              <section className="story-section">
                <div className="story-heading">
                  <span aria-hidden="true">◫</span>
                  <div><small>PHYSICAL PROFILE</small><h3>物理与原子资料</h3></div>
                </div>
                <div className="property-grid">
                  <Property label="相对原子质量" value={element.atomicMass} />
                  <Property label="常温状态" value={stateLabel(element.standardState)} />
                  <Property label="周期 / 族" value={`第 ${element.period} 周期 · ${element.group ? `第 ${element.group} 族` : "内过渡元素"}`} />
                  <Property label="元素类别" value={element.categoryLabel} />
                  <Property label="密度" value={element.density ? `${element.density} g/cm³` : null} />
                  <Property label="原子半径" value={element.atomicRadius ? `${element.atomicRadius} pm` : null} />
                  <Property label="熔点" value={kelvinLabel(element.meltingPoint)} />
                  <Property label="沸点" value={kelvinLabel(element.boilingPoint)} />
                  <Property label="电负性" value={element.electronegativity} />
                  <Property label="第一电离能" value={element.ionizationEnergy ? `${element.ionizationEnergy} eV` : null} />
                  <Property label="电子亲和能" value={element.electronAffinity ? `${element.electronAffinity} eV` : null} />
                  <Property label="发现年代" value={discoveryLabel(element.yearDiscovered)} />
                  <Property label="电子排布" value={element.electronConfiguration} wide />
                  <Property label="常见氧化态" value={element.oxidationStates} wide />
                </div>
              </section>

              <section className="story-section">
                <div className="story-heading">
                  <span aria-hidden="true">⚛</span>
                  <div><small>CHEMICAL CHARACTER</small><h3>化学性格</h3></div>
                </div>
                <p className="chemical-copy">{chemicalSummary(element)}</p>
                <div className="electron-sequence" aria-label={`电子层排布 ${element.shells.join("、")}`}>
                  {element.shells.map((count, index) => (
                    <span
                      className={index === element.shells.length - 1 ? "is-outer" : ""}
                      key={index}
                    >
                      <small>第 {index + 1} 层</small>
                      <strong>{count}</strong>
                      <em>个电子</em>
                    </span>
                  ))}
                </div>
              </section>

              <section className="story-section">
                <div className="story-heading">
                  <span aria-hidden="true">⌁</span>
                  <div><small>HUMAN CONNECTION</small><h3>它怎样参与人类世界</h3></div>
                </div>
                <div className="use-list">
                  {uses.map((use, index) => (
                    <div key={use}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <p>{use}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="story-section compounds-section">
                <div className="story-heading">
                  <span aria-hidden="true">⬡</span>
                  <div><small>COMPOUND CONSTELLATION</small><h3>相关化合物星图</h3></div>
                </div>
                <div className="compound-grid">
                  {compounds.map((compound) => (
                    <article key={`${compound.formula}-${compound.name}`}>
                      <strong>{compound.formula}</strong>
                      <h4>{compound.name}</h4>
                      <p>{compound.note}</p>
                    </article>
                  ))}
                </div>
              </section>

              <aside className="element-data-note">
                <strong>资料说明</strong>
                <p>
                  基础数值来自 PubChem Periodic Table；中文名称参照中国化学会发布的
                  IUPAC 中文元素周期表。超重元素的部分性质是预测值，未知项不会用猜测填补。
                </p>
              </aside>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PeriodicTablePage() {
  const [selectedAtomicNumber, setSelectedAtomicNumber] = useState(1);
  const [detailElement, setDetailElement] = useState<ElementRecord | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceDetail, setVoiceDetail] = useState("可以说“上、下、左、右、详细信息、返回”");
  const [asrConfigured, setAsrConfigured] = useState<boolean | null>(null);

  const selectedElement = useMemo(
    () => findElement(selectedAtomicNumber),
    [selectedAtomicNumber],
  );
  const elementButtonsRef = useRef<ElementButtonMap>(new Map());
  const recognitionRef = useRef<AsrRecognitionSession | null>(null);
  const consumedBySentenceRef = useRef(new Map<number, VoiceSentenceProgress>());
  const detailElementRef = useRef<ElementRecord | null>(null);
  const selectedAtomicNumberRef = useRef(1);

  useEffect(() => {
    selectedAtomicNumberRef.current = selectedAtomicNumber;
  }, [selectedAtomicNumber]);

  useEffect(() => {
    detailElementRef.current = detailElement;
  }, [detailElement]);

  useEffect(() => {
    void readAsrConfiguration()
      .then((configuration) => {
        setAsrConfigured(configuration.isConfigured);
        if (!configuration.isConfigured) {
          setVoiceState("unconfigured");
          setVoiceDetail("请先到首页“功能测试”中保存阿里云 API Key");
        }
      })
      .catch(() => {
        setAsrConfigured(false);
        setVoiceState("error");
        setVoiceDetail("暂时无法读取本机语音配置");
      });
    return () => {
      void recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const selectAndFocus = useCallback((atomicNumber: number) => {
    setSelectedAtomicNumber(atomicNumber);
    window.requestAnimationFrame(() => {
      elementButtonsRef.current.get(atomicNumber)?.focus({ preventScroll: true });
    });
  }, []);

  const processVoiceResult = useCallback((result: RecognitionResult) => {
    const previous = consumedBySentenceRef.current.get(result.sentenceId) ?? {
      directionCount: 0,
      detailHandled: false,
      backHandled: false,
    };
    const allDirections = parseNavigationCommands(result.text);
    const directions = allDirections.slice(previous.directionCount);
    const backCommand = isBackCommand(result.text);
    const detailCommand = isDetailCommand(result.text);
    consumedBySentenceRef.current.set(result.sentenceId, {
      directionCount: Math.max(previous.directionCount, allDirections.length),
      detailHandled: previous.detailHandled || detailCommand,
      backHandled: previous.backHandled || backCommand,
    });

    if (backCommand && !previous.backHandled) {
      if (detailElementRef.current) {
        setDetailElement(null);
        setVoiceDetail("已返回周期表，继续说方向就能移动");
      } else {
        setVoiceDetail("已经在周期表啦，可以继续探索");
      }
      return;
    }

    if (detailCommand && !previous.detailHandled) {
      setDetailElement(findElement(selectedAtomicNumberRef.current));
      setVoiceDetail("已打开元素详情，说“返回”可以回到周期表");
      return;
    }

    if (detailElementRef.current) return;
    if (directions.length > 0) {
      setSelectedAtomicNumber((current) => {
        const next = applyNavigationCommands(current, directions);
        selectedAtomicNumberRef.current = next;
        window.requestAnimationFrame(() => {
          elementButtonsRef.current.get(next)?.focus({ preventScroll: true });
        });
        return next;
      });
      setVoiceDetail(`识别到 ${directions.length} 个方向指令`);
    }
  }, []);

  const stopVoice = useCallback(async () => {
    const session = recognitionRef.current;
    recognitionRef.current = null;
    if (session) await session.stop();
    setVoiceState("stopped");
    setVoiceDetail("语音导航已停止，需要时可以重新开启");
  }, []);

  const startVoice = useCallback(async () => {
    if (!asrConfigured) {
      setVoiceState("unconfigured");
      setVoiceDetail("请先返回首页，在“功能测试”里保存阿里云 API Key");
      return;
    }
    await recognitionRef.current?.stop();
    consumedBySentenceRef.current.clear();
    const session = new AsrRecognitionSession({
      onState: (state, detail) => {
        setVoiceState(state);
        if (detail) setVoiceDetail(detail);
        if (state === "limited" || state === "stopped") recognitionRef.current = null;
      },
      onResult: processVoiceResult,
      onError: (message) => {
        recognitionRef.current = null;
        setVoiceState("error");
        setVoiceDetail(message);
      },
    });
    recognitionRef.current = session;
    await session.start();
  }, [asrConfigured, processVoiceResult]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (detailElementRef.current) return;
      const direction = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      }[event.key] as "up" | "down" | "left" | "right" | undefined;
      if (direction) {
        event.preventDefault();
        setSelectedAtomicNumber((current) => {
          const next = applyNavigationCommands(current, [direction]);
          selectedAtomicNumberRef.current = next;
          window.requestAnimationFrame(() => elementButtonsRef.current.get(next)?.focus());
          return next;
        });
      }
      if (event.key === "Enter") {
        const target = event.target as HTMLElement;
        if (target.closest(".periodic-element")) {
          setDetailElement(findElement(selectedAtomicNumberRef.current));
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const listening = voiceState === "listening";
  const voiceBusy = voiceState === "connecting" || voiceState === "finishing";

  return (
    <div className="periodic-page">
      <div className="periodic-stars" aria-hidden="true" />
      <header className="periodic-topbar">
        <a href="/" className="periodic-back"><span aria-hidden="true">←</span> 学习大厅</a>
        <div className="periodic-brand">
          <span aria-hidden="true">⚛</span>
          <div><strong>元素星际图鉴</strong><small>木木的化学探索舱</small></div>
        </div>
        <button
          type="button"
          className={`voice-control state-${voiceState}`}
          onClick={() => void (listening ? stopVoice() : startVoice())}
          disabled={voiceBusy}
          title={voiceDetail}
          aria-label={`${voiceLabel(voiceState)}。${voiceDetail}`}
        >
          <i aria-hidden="true" />
          <span>
            <strong>{voiceLabel(voiceState)}</strong>
            <small>{listening ? "点击停止" : voiceState === "limited" ? "点击继续识别" : "点击开启"}</small>
          </span>
        </button>
      </header>

      <main className="periodic-main">
        <section className="periodic-intro" aria-labelledby="periodic-page-title">
          <h1 id="periodic-page-title">元素周期表</h1>
        </section>

        <section className="category-legend" aria-label="元素类别图例">
          {CATEGORY_ORDER.map((category) => (
            <span className={`legend-${category}`} key={category}>
              <i aria-hidden="true" />{CATEGORY_LABELS[category]}
            </span>
          ))}
        </section>

        <section className="periodic-table-shell" aria-label="元素周期表">
          <div className="group-labels" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => <span key={index}>{index + 1}</span>)}
          </div>
          <div className="periodic-grid">
            {Array.from({ length: 7 }, (_, index) => (
              <span
                className="period-label"
                style={{ gridRow: index + 1, gridColumn: 1 }}
                key={`period-${index + 1}`}
                aria-hidden="true"
              >
                {index + 1}
              </span>
            ))}
            <span className="series-placeholder lanthanide-placeholder" aria-hidden="true">
              <strong>57—71</strong><small>镧系展开在下方</small>
            </span>
            <span className="series-placeholder actinide-placeholder" aria-hidden="true">
              <strong>89—103</strong><small>锕系展开在下方</small>
            </span>
            <span className="series-label lanthanide-label" aria-hidden="true">镧系</span>
            <span className="series-label actinide-label" aria-hidden="true">锕系</span>
            {ELEMENTS.map((element) => (
              <button
                type="button"
                key={element.atomicNumber}
                ref={(button) => {
                  if (button) elementButtonsRef.current.set(element.atomicNumber, button);
                  else elementButtonsRef.current.delete(element.atomicNumber);
                }}
                className={`periodic-element category-${element.category} ${selectedAtomicNumber === element.atomicNumber ? "is-selected" : ""}`}
                style={{
                  gridRow: element.displayRow,
                  gridColumn: element.displayColumn,
                }}
                aria-pressed={selectedAtomicNumber === element.atomicNumber}
                aria-label={`${element.atomicNumber}号元素，${element.chineseName}，${element.pinyin}，符号${element.symbol}，相对原子质量${element.atomicMass}`}
                tabIndex={selectedAtomicNumber === element.atomicNumber ? 0 : -1}
                onFocus={() => {
                  selectedAtomicNumberRef.current = element.atomicNumber;
                  setSelectedAtomicNumber(element.atomicNumber);
                }}
                onClick={() => {
                  selectAndFocus(element.atomicNumber);
                  setDetailElement(element);
                }}
              >
                <span className="cell-number">{element.atomicNumber}</span>
                <span className="cell-mass">{element.atomicMass}</span>
                <strong>{element.symbol}</strong>
                <span className="cell-name">{element.chineseName}</span>
                <small>{element.pinyin}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="selected-element-dock" aria-live="polite">
          <div className={`selected-symbol category-${selectedElement.category}`}>
            <span>{selectedElement.atomicNumber}</span><strong>{selectedElement.symbol}</strong>
          </div>
          <div>
            <small>当前选中</small>
            <h2>{selectedElement.chineseName} <span>{selectedElement.pinyin}</span></h2>
            <p>
              {selectedElement.categoryLabel} · 相对原子质量 {selectedElement.atomicMass} ·
              电子层 {selectedElement.shells.join(" / ")}
            </p>
          </div>
          <button type="button" onClick={() => setDetailElement(selectedElement)}>
            查看详细信息 <span aria-hidden="true">→</span>
          </button>
        </section>
      </main>

      {detailElement && (
        <ElementDetail element={detailElement} onClose={() => setDetailElement(null)} />
      )}
    </div>
  );
}
