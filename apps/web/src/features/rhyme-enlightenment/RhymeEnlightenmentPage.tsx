import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTts } from "../../shared/speech";
import {
  RHYME_CHAPTERS,
  allSentences,
  annotatedChapterById,
  pairedTerms,
  sentenceNarration,
  type RhymeSentence,
} from "./content";
import { originalChapterById } from "./original";
import "./rhyme-enlightenment.css";

type ReadingMode = "original" | "detail";
type OriginalSentence = { id: string; text: string };
type DisplaySentence = RhymeSentence | OriginalSentence;
type DisplaySection = { title: string; sentences: readonly DisplaySentence[] };

function isAnnotatedSentence(sentence: DisplaySentence): sentence is RhymeSentence {
  return "meaning" in sentence;
}

function readingStatus(status: ReturnType<typeof useTts>["status"], readingAll: boolean) {
  if (status === "loading") return "正在准备声音";
  if (status === "speaking") return readingAll ? "正在从头朗读" : "正在朗读这一句";
  if (status === "paused") return "朗读已暂停";
  if (status === "unavailable") return "这台设备暂时没有中文声音";
  if (status === "error") return "这段声音暂时没有读出来";
  return "点击句子就能听";
}

export function RhymeEnlightenmentPage() {
  const tts = useTts({ stopOnUnmount: true });
  const [chapterId, setChapterId] = useState("upper-1");
  const chapter = useMemo(() => annotatedChapterById(chapterId), [chapterId]);
  const originalChapter = useMemo(() => originalChapterById(chapterId), [chapterId]);
  const chapterInfo = useMemo(
    () => RHYME_CHAPTERS.find((item) => item.id === chapterId),
    [chapterId],
  );
  const displaySections = useMemo<readonly DisplaySection[]>(() => {
    if (chapter) return chapter.sections;
    return (originalChapter?.sections ?? []).map((section, sectionIndex) => ({
      title: `第${["一", "二", "三"][sectionIndex]}则 · 原文`,
      sentences: section.map((text, sentenceIndex) => ({
        id: `${chapterId}-${sectionIndex + 1}-${sentenceIndex + 1}`,
        text,
      })),
    }));
  }, [chapter, chapterId, originalChapter]);
  const sentences = useMemo(
    () => displaySections.flatMap((section) => section.sentences),
    [displaySections],
  );
  const [selectedSentenceId, setSelectedSentenceId] = useState("dong-1-1");
  const [activeSentenceId, setActiveSentenceId] = useState<string | null>(null);
  const [readingMode, setReadingMode] = useState<ReadingMode>("original");
  const [readingAll, setReadingAll] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const playbackToken = useRef(0);
  const detailPanelRef = useRef<HTMLElement>(null);

  const selectedSentence = useMemo(
    () => sentences.find((sentence) => sentence.id === selectedSentenceId) ?? sentences[0],
    [selectedSentenceId, sentences],
  );

  const stopPlayback = useCallback(() => {
    playbackToken.current += 1;
    tts.stop();
    setReadingAll(false);
    setActiveSentenceId(null);
  }, [tts]);

  useEffect(() => () => {
    playbackToken.current += 1;
  }, []);

  useEffect(() => {
    if (!catalogOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCatalogOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [catalogOpen]);

  const speechFor = useCallback(
    (sentence: DisplaySentence) => (
      readingMode === "detail" && isAnnotatedSentence(sentence)
        ? sentenceNarration(sentence)
        : sentence.text
    ),
    [readingMode],
  );

  const speakOne = useCallback(async (sentence: DisplaySentence) => {
    stopPlayback();
    const token = playbackToken.current;
    setSelectedSentenceId(sentence.id);
    setActiveSentenceId(sentence.id);
    if (window.innerWidth <= 760) {
      requestAnimationFrame(() => detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
    await tts.speak({
      text: speechFor(sentence),
      lang: "zh-CN",
      rate: 0.82,
      pitch: 1.02,
      preferLocalVoice: true,
      maxSegmentLength: 110,
    });
    if (playbackToken.current === token) setActiveSentenceId(null);
  }, [speechFor, stopPlayback, tts]);

  const speakFromStart = useCallback(async () => {
    if (sentences.length === 0) return;
    stopPlayback();
    const token = playbackToken.current;
    setReadingAll(true);

    for (const sentence of sentences) {
      if (playbackToken.current !== token) return;
      setSelectedSentenceId(sentence.id);
      setActiveSentenceId(sentence.id);
      const result = await tts.speak({
        text: speechFor(sentence),
        lang: "zh-CN",
        rate: 0.82,
        pitch: 1.02,
        preferLocalVoice: true,
        maxSegmentLength: 110,
      });
      if (result.status !== "completed" || playbackToken.current !== token) return;
    }

    if (playbackToken.current === token) {
      setReadingAll(false);
      setActiveSentenceId(null);
    }
  }, [sentences, speechFor, stopPlayback, tts]);

  const chooseChapter = useCallback((nextChapterId: string) => {
    stopPlayback();
    setChapterId(nextChapterId);
    const nextChapter = annotatedChapterById(nextChapterId);
    const nextOriginal = originalChapterById(nextChapterId);
    setSelectedSentenceId(
      nextChapter
        ? allSentences(nextChapter)[0]?.id ?? ""
        : nextOriginal ? `${nextChapterId}-1-1` : "",
    );
    if (!nextChapter) setReadingMode("original");
    setCatalogOpen(false);
  }, [stopPlayback]);

  const changeMode = useCallback((mode: ReadingMode) => {
    if (mode === readingMode) return;
    stopPlayback();
    setReadingMode(mode);
  }, [readingMode, stopPlayback]);

  const canPause = tts.status === "speaking" || tts.status === "paused";
  const statusText = readingStatus(tts.status, readingAll);

  return (
    <div className="rhyme-page">
      <div className="rhyme-stars" aria-hidden="true" />

      <header className="rhyme-topbar">
        <a className="rhyme-back" href="/">
          <span aria-hidden="true">←</span> 返回学习大厅
        </a>
        <div className="rhyme-brand">
          <span aria-hidden="true">雅</span>
          <div>
            <strong>声律启蒙</strong>
            <small>国学 · 对句精读舱</small>
          </div>
        </div>
        <button className="catalog-trigger" type="button" onClick={() => setCatalogOpen(true)}>
          <span aria-hidden="true">☷</span>
          <span><strong>全书目录</strong><small>上、下卷共 30 章</small></span>
        </button>
      </header>

      <main className="rhyme-main">
        <section className="reading-controls" aria-label="朗读控制台">
          <div className="reading-mode" role="group" aria-label="朗读内容选择">
            <span>朗读内容</span>
            <button
              className={readingMode === "original" ? "is-selected" : ""}
              type="button"
              aria-pressed={readingMode === "original"}
              onClick={() => changeMode("original")}
            >
              只读原文
            </button>
            <button
              className={readingMode === "detail" ? "is-selected" : ""}
              type="button"
              disabled={!chapter}
              title={chapter ? undefined : "本章的逐句讲解还在校注中"}
              aria-pressed={readingMode === "detail"}
              onClick={() => changeMode("detail")}
            >
              原文和讲解
            </button>
          </div>

          <div className={`reading-state state-${tts.status}`} aria-live="polite">
            <i aria-hidden="true" />
            <span>{statusText}</span>
          </div>

          <div className="reading-actions">
            <button
              className="read-all-button"
              type="button"
              disabled={sentences.length === 0 || tts.status === "loading"}
              onClick={() => void speakFromStart()}
            >
              <span aria-hidden="true">▶</span> 从头朗读本章
            </button>
            <button
              type="button"
              disabled={!canPause}
              onClick={() => tts.status === "paused" ? tts.resume() : tts.pause()}
            >
              {tts.status === "paused" ? "继续" : "暂停"}
            </button>
            <button
              type="button"
              disabled={!canPause && !readingAll}
              onClick={stopPlayback}
            >
              停止
            </button>
          </div>
        </section>

        <div className="rhyme-reading-layout">
          <article className="rhyme-original-panel" aria-labelledby="rhyme-chapter-title">
            <header className="chapter-heading">
              <div>
                <span>{chapterInfo?.volume}</span>
                <h1 id="rhyme-chapter-title">{chapterInfo?.title}</h1>
              </div>
              <p>{chapter?.focus ?? "原文已经收录，可以逐句点读；逐句讲解将在校注完成后开放。"}</p>
            </header>

            <div className="rhyme-sections">
                {displaySections.map((section) => (
                  <section key={section.title} aria-labelledby={`${chapterId}-${section.title}`}>
                    <h2 id={`${chapterId}-${section.title}`}>{section.title}</h2>
                    <div className="sentence-list">
                      {section.sentences.map((sentence) => {
                        const selected = selectedSentence?.id === sentence.id;
                        const active = activeSentenceId === sentence.id;
                        return (
                          <button
                            className={`rhyme-sentence ${selected ? "is-selected" : ""} ${active ? "is-speaking" : ""}`}
                            type="button"
                            key={sentence.id}
                            aria-pressed={selected}
                            aria-label={`${sentence.text} 点击朗读${chapter ? "并查看讲解" : ""}`}
                            onClick={() => void speakOne(sentence)}
                          >
                            <span className="sentence-marker" aria-hidden="true">{active ? "▶" : "读"}</span>
                            <span>
                              <strong>{sentence.text}</strong>
                              {isAnnotatedSentence(sentence) && <small>{sentence.pinyin}</small>}
                            </span>
                            <em>{active ? "正在朗读" : chapter ? "点一下听讲" : "点一下听原文"}</em>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
            </div>
          </article>

          <aside ref={detailPanelRef} className="rhyme-detail-panel" aria-labelledby="detail-title">
            {selectedSentence && isAnnotatedSentence(selectedSentence) ? (
              <>
                <header className="detail-heading">
                  <span>正在理解</span>
                  <h2 id="detail-title">{selectedSentence.text}</h2>
                  <p>{selectedSentence.pinyin}</p>
                  <button type="button" onClick={() => void speakOne(selectedSentence)}>
                    <span aria-hidden="true">🔊</span>
                    {readingMode === "detail" ? "再听原文和讲解" : "再听一遍原文"}
                  </button>
                </header>

                <section className="detail-card meaning-card">
                  <div className="detail-card-title"><span aria-hidden="true">①</span><h3>先懂意思</h3></div>
                  <p>{selectedSentence.meaning}</p>
                </section>

                <section className="detail-card">
                  <div className="detail-card-title"><span aria-hidden="true">②</span><h3>词语小卡</h3></div>
                  <div className="term-grid">
                    {pairedTerms(selectedSentence).map(([left, right]) => (
                      <div className="term-pair" key={`${left.word}-${right.word}`}>
                        {[left, right].map((term) => (
                          <article key={term.word}>
                            <div><strong>{term.word}</strong><small>{term.pinyin}</small></div>
                            <p>{term.meaning}</p>
                          </article>
                        ))}
                        <span aria-label="对">对</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="detail-card pairing-card">
                  <div className="detail-card-title"><span aria-hidden="true">③</span><h3>为什么这样对</h3></div>
                  <p>{selectedSentence.pairing}</p>
                </section>

                <section className="detail-card story-card">
                  <div className="detail-card-title"><span aria-hidden="true">④</span><h3>{selectedSentence.storyTitle}</h3></div>
                  <p>{selectedSentence.story}</p>
                </section>
              </>
            ) : (
              <div className="detail-pending">
                <span aria-hidden="true">✦</span>
                <h2 id="detail-title">{selectedSentence?.text ?? "讲解正在认真准备"}</h2>
                <p>这句原文可以先读、先听。词语含义、配对原因和典故会按前五章的同一套规则继续补充。</p>
                {selectedSentence && (
                  <button type="button" onClick={() => void speakOne(selectedSentence)}>
                    <span aria-hidden="true">🔊</span> 朗读这句原文
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>

        {tts.error && <p className="rhyme-audio-error" role="alert">{tts.error.message} 原文和讲解仍然可以继续阅读。</p>}
      </main>

      {catalogOpen && (
        <div className="catalog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setCatalogOpen(false);
        }}>
          <section className="chapter-catalog" role="dialog" aria-modal="true" aria-labelledby="catalog-title">
            <header>
              <div>
                <span>全书 30 章</span>
                <h2 id="catalog-title">选择一章声律启蒙</h2>
                <p>30 章原文均可阅读和朗读；亮起的前五章还完成了逐句精注。</p>
              </div>
              <button type="button" autoFocus onClick={() => setCatalogOpen(false)}>× 关闭目录</button>
            </header>
            {(["上卷", "下卷"] as const).map((volume) => (
              <section className="catalog-volume" key={volume} aria-labelledby={`catalog-${volume}`}>
                <h3 id={`catalog-${volume}`}>{volume}</h3>
                <div>
                  {RHYME_CHAPTERS.filter((item) => item.volume === volume).map((item) => (
                    <button
                      className={`${item.annotated ? "is-ready" : "is-pending"} ${item.id === chapterId ? "is-current" : ""}`}
                      type="button"
                      key={item.id}
                      onClick={() => chooseChapter(item.id)}
                    >
                      <strong>{item.title}</strong>
                      <span>{item.annotated ? "原文与精注" : "原文可读 · 注解待补"}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
