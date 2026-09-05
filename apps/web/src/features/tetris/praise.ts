export type Praise = { zh: string; en: string };

// Short, natural pairs: repeat the meaning in English, without language labels.
export const PRAISES: readonly Praise[] = [
  { zh: "做得真好！", en: "Well done!" },
  { zh: "干得漂亮！", en: "Great job!" },
  { zh: "你做到了！", en: "You did it!" },
  { zh: "真棒！", en: "Awesome!" },
  { zh: "太精彩了！", en: "Fantastic!" },
  { zh: "真了不起！", en: "Amazing!" },
  { zh: "漂亮的一步！", en: "Nice move!" },
  { zh: "继续加油！", en: "Keep it up!" },
  { zh: "你越来越棒了！", en: "You're getting better!" },
  { zh: "好主意！", en: "Good idea!" },
  { zh: "找到好位置了！", en: "You found a good spot!" },
  { zh: "拼得真整齐！", en: "Such a tidy fit!" },
  { zh: "刚刚好！", en: "Just right!" },
  { zh: "观察得真仔细！", en: "Great observation!" },
  { zh: "想得真周到！", en: "Good thinking!" },
  { zh: "一步一步，真不错！", en: "One step at a time. Nice work!" },
  { zh: "又有进步啦！", en: "You're making progress!" },
  { zh: "值得庆祝！", en: "Let's celebrate!" },
  { zh: "给你击个掌！", en: "High five!" },
  { zh: "为你鼓掌！", en: "A big clap for you!" },
  { zh: "真是个好办法！", en: "What a great idea!" },
  { zh: "你找到方法了！", en: "You figured it out!" },
  { zh: "你很专心！", en: "You're really focused!" },
  { zh: "谢谢你的努力！", en: "Thank you for trying hard!" },
  { zh: "很棒的尝试！", en: "Great effort!" },
  { zh: "耐心有收获！", en: "Your patience paid off!" },
  { zh: "好好的一次思考！", en: "That was thoughtful!" },
  { zh: "又完成一行啦！", en: "Another line is complete!" },
  { zh: "看看你的成果！", en: "Look what you made!" },
  { zh: "拼出了新空间！", en: "You made more room!" },
  { zh: "这一块拼得真漂亮！", en: "What a lovely fit!" },
  { zh: "你找到了窍门！", en: "You've got the hang of it!" },
  { zh: "真让人开心！", en: "What a happy moment!" },
  { zh: "你又学会了一点！", en: "You learned a little more!" },
  { zh: "每一步都有收获！", en: "Every step helps you learn!" },
  { zh: "继续探索吧！", en: "Keep exploring!" },
  { zh: "享受这个过程！", en: "Enjoy the journey!" },
  { zh: "动脑筋真有趣！", en: "Thinking is fun!" },
  { zh: "你的小办法很有效！", en: "Your idea worked!" },
  { zh: "稳稳地做好了！", en: "Nice and steady!" },
  { zh: "慢慢来，也很棒！", en: "Taking your time is great!" },
  { zh: "试一试就有发现！", en: "Trying leads to discoveries!" },
  { zh: "你坚持下来了！", en: "You kept trying!" },
  { zh: "又解决一个小难题！", en: "Another little puzzle solved!" },
  { zh: "好漂亮的组合！", en: "What a lovely combination!" },
  { zh: "你安排得真好！", en: "You planned that well!" },
  { zh: "找得真准！", en: "You found just the spot!" },
  { zh: "有趣的发现！", en: "What a fun discovery!" },
  { zh: "好样的！", en: "Way to go!" },
  { zh: "真出色！", en: "Excellent!" },
  { zh: "美妙极了！", en: "Wonderful!" },
  { zh: "真让人惊喜！", en: "What a lovely surprise!" },
  { zh: "你值得为自己开心！", en: "You can feel proud!" },
  { zh: "你的努力闪闪发光！", en: "Your effort shines!" },
  { zh: "拼得越来越顺手啦！", en: "You're getting the feel for it!" },
  { zh: "你又向前迈了一步！", en: "You took another step forward!" },
  { zh: "认真尝试真好！", en: "It's great to give it a try!" },
  { zh: "看，你办到了！", en: "Look, you made it happen!" },
  { zh: "为这一步喝彩！", en: "Cheers for that move!" },
  { zh: "你的练习有收获啦！", en: "Your practice is paying off!" },
] as const;

/** One shuffled cycle before repeating; also avoid a repeat at cycle boundaries. */
export function createPraisePicker(random: () => number = Math.random) {
  let pool: Praise[] = [];
  let previous: Praise | undefined;
  return (): Praise => {
    if (!pool.length) {
      pool = [...PRAISES];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      if (pool[pool.length - 1] === previous) [pool[0], pool[pool.length - 1]] = [pool[pool.length - 1], pool[0]];
    }
    previous = pool.pop()!;
    return previous;
  };
}

export type PraiseEvent = { player: number; praise: Praise };
type PlaybackResult = { status: string };

/** Pending gameplay events, each played through the shared bilingual speech API. */
export class PraisePlayback {
  private pending: PraiseEvent[] = [];
  private generation = 0;
  private running = false;
  private paused = false;
  private enabled = false;
  constructor(private readonly output: {
    speak: (praise: Praise) => Promise<PlaybackResult>;
    stop: () => void;
    show: (event: PraiseEvent) => void;
    status: (count: number, unavailable: boolean) => void;
  }) {}
  enqueue(event: PraiseEvent) {
    if (!this.enabled) return;
    this.pending.push(event);
    this.output.status(this.pending.length, false);
    void this.pump();
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.clear();
    else void this.pump();
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.interrupt();
    else void this.pump();
  }
  private interrupt() {
    this.generation++;
    this.running = false;
    this.output.stop();
  }
  clear() {
    this.interrupt();
    this.pending = [];
    this.output.status(0, false);
  }
  private async pump() {
    if (this.running || this.paused || !this.enabled) return;
    this.running = true;
    const generation = this.generation;
    while (this.pending.length && generation === this.generation && !this.paused && this.enabled) {
      const event = this.pending[0];
      this.output.show(event);
      let result: PlaybackResult;
      try { result = await this.output.speak(event.praise); }
      catch { result = { status: "error" }; }
      if (generation !== this.generation) return;
      if (result.status === "cancelled") {
        // Another application speech action took over: wait for an explicit resume.
        this.paused = true;
        this.output.status(this.pending.length, true);
        break;
      }
      this.pending.shift();
      if (result.status !== "completed") {
        this.pending = [];
        this.output.status(0, true);
        break;
      }
      this.output.status(this.pending.length, false);
    }
    this.running = false;
  }
}
