# 浏览器文字朗读（TTS）

状态：**通用前端能力已实现**

## 目标

为题目、阅读材料、知识卡片和操作提示提供统一的网页朗读能力。当前方案使用浏览器原生 Web Speech API：

- 不需要 API Key、账号或按量付费服务；
- 不增加第三方运行时依赖；
- 支持动态文本、中文和英文；
- 优先使用设备本地声音，没有匹配的本地声音时允许浏览器选择兼容声音；
- 朗读失败不能阻止题目展示、作答或其他核心功能。

本能力只负责文字转语音输出。阿里云 Fun-ASR 继续负责语音输入，两者不能混为一个服务。

## 代码入口

统一入口位于：

```text
apps/web/src/shared/speech/
├── index.ts
├── tts.ts
└── use-tts.ts
```

全局语言偏好、顶部驾驶舱和各玩法的短语义朗读位于：

```text
apps/web/src/shared/experience/
├── experience-store.ts
├── GlobalExperienceLayer.tsx
├── learning-speech.ts
├── SpokenActionButton.tsx
└── translations.ts
```

业务功能不得自行创建另一套 `SpeechSynthesisUtterance` 封装，也不要调用非官方免费 TTS 地址。发现新的跨功能需求时，先扩展通用服务和本文档，再在业务页面使用。

## 基本用法

不需要订阅状态的流程可以直接调用单例：

```ts
import { browserTts } from "../../shared/speech";

const result = await browserTts.speak({
  text: "七加三等于多少？",
  lang: "zh-CN",
  rate: 0.9,
  localOnly: false,
});

if (result.status === "cancelled") return;
```

需要显示朗读、暂停或错误状态的 React 页面使用 Hook：

```tsx
import { useTts } from "../../shared/speech";

function ReadingPage() {
  const tts = useTts({ stopOnUnmount: true });

  return (
    <button type="button" onClick={() => void tts.speak({ text: "要朗读的内容。" })}>
      {tts.status === "speaking" ? "停止朗读" : "朗读内容"}
    </button>
  );
}
```

Hook 提供：

- 状态：`idle / loading / speaking / paused / unavailable / error`；
- 当前分段、分段序号和总分段数；
- `speak / stop / pause / resume`；
- 当前浏览器可用的声音列表；
- 不包含密钥、远程服务配置或持久化操作。

## 通用双语点击按钮

菜单、工具和保存等短操作统一使用 `SpokenActionButton`，不要在业务页面重复拼接中文和英文朗读队列：

```tsx
import { SpokenActionButton } from "../../shared/experience";

<SpokenActionButton
  speech={{
    zh: "画笔",
    en: "Brush",
    bilingualAudioSrc: "/audio/ui-actions/drawing-studio/tool-brush.m4a",
  }}
  onClick={() => setTool("brush")}
>
  画笔 <kbd>B</kbd>
</SpokenActionButton>
```

组件先执行原按钮动作，再按全局“无/中/英/中英”偏好朗读；按钮被禁用或业务回调取消事件时不朗读。中英模式提供 `bilingualAudioSrc` 时优先播放随应用分发的短音频，播放失败自动回退到 `browserTts` 的中文、英文顺序队列。没有录音、浏览器 TTS 或扬声器时只降级声音，点击、键盘和页面状态仍须正常工作。

非点击入口（例如工具快捷键）调用同一协议：

```ts
import { announceSpokenAction } from "../../shared/experience";

void announceSpokenAction({ zh: "画笔", en: "Brush", bilingualAudioSrc: "/audio/ui-actions/drawing-studio/tool-brush.m4a" });
```

静态 UI 录音放在 `apps/web/public/audio/ui-actions/<功能>/`，文件名使用稳定语义 ID，不用可见文案直接命名。录音仅用于固定公开短语；题目、孩子姓名、作品名和其他动态或个人内容仍必须经过统一 TTS，并按隐私规则决定 `localOnly`。

固定双语录音必须把中文和英文分别交给对应声音生成，再在音频层按“中文 → 短停顿 → 英文”拼接。禁止把 `[[voice=...]]`、声音名称、语言标签或其他引擎控制文本嵌入朗读字符串；部分语音引擎会把它们直接念成 `voice ...`，破坏词义对应关系。画图按钮的唯一短语清单位于 `content/drawing-studio/ui-action-speech.v1.json`，通过以下命令重建：

```bash
node scripts/generate-drawing-ui-action-audio.mjs
```

清单与生成器会拒绝控制标记和重复 ID。每个成品只允许包含清单中的中文短语、160ms 停顿和英文直接翻译，不添加“中文”“英文”“voice”、声音名称、解释句或提示语。

## 文本规则

- 业务层提供“适合听”的语义文本，不直接读取整个页面的 `innerText`。
- 数学符号必须转换为自然口语，例如 `7 - 3 = ?` 转换为“七减三等于多少”。
- 元素、单位、缩写、多音字或中英文混排由对应学科模块生成明确的朗读文本。
- 原始可见文字始终保留；朗读是辅助能力，不是题目和无障碍语义的替代品。
- 空文字直接返回 `empty`，不会调用浏览器声音引擎。
- 全局短语义朗读通过 `learning-speech.ts` 生成成对的 `zh / en` 文本；业务页面不得把可见 UI 文案拼成第二套临时朗读协议。

## 全局模式与学习语义

首页“木木学习岛”品牌横条中的第二个紧凑按钮提供 `无 → 中 → 英 → 中英` 循环朗读模式，按钮只显示当前值，默认“中英”；各玩法沿用偏好而不重复显示全局横条。选择会立即生效并保存到本机，切换前先停止当前语音；“中英”严格等待中文朗读结束后再读英文，新的学习语义会取消旧队列。“无”不调用声音引擎。

默认“中英”不代表页面可以自动播放：首次声音仍必须发生在孩子的有效点击、键盘操作或正确作答之后。打开应用后的第一次有效功能操作播放一次短问候，固定中文在前、英文在后；同一标签页不重复，选择“无”时跳过。问候、算式和各玩法结果的完整协议见 [`LANGUAGE_AND_READ_ALOUD.md`](./LANGUAGE_AND_READ_ALOUD.md)。

算式朗读必须先解析运算符和数字，再生成自然口语。例如 `4 + 3 = 7` 输出“`四 加 三 等于 七`”和“`four plus three equals seven`”；可见题目中的阿拉伯数字不因界面或朗读模式而改写。

## 长文本与分段

通用服务会先按句号、问号、感叹号、分号和换行分句；超长句子再优先在逗号、顿号或冒号处分段，最后才按长度安全截断。

- 默认每段最多 120 个字符；
- 业务可通过 `maxSegmentLength` 在 20—500 之间调整；
- 各段严格按顺序朗读；
- `onSegmentStart` 可用于句子级高亮或滚动定位；
- 不依赖兼容性不一致的逐词 `boundary` 事件；
- 每段使用与长度相关的安全超时，超时后停止声音并返回可读错误，不会提前打开 ASR。

## 声音选择

默认语言为 `zh-CN`。声音按以下顺序匹配：

1. 业务或家长显式指定且当前仍存在的 `voiceURI`；
2. 与目标语言和地区完全匹配的声音；
3. 相同基础语言的声音；
4. 在同等语言匹配下优先 `localService` 本地声音；
5. 使用浏览器默认声音作为最终降级。

声音名称和数量依赖操作系统、浏览器及已安装语言包，不能在业务代码中硬编码某台设备上的声音名称。`voiceschanged` 到达后，通用服务会刷新可用列表。

浏览器可能提供远程声音。普通公开课程内容可以使用兼容的远程声音；涉及孩子姓名、家庭信息或其他个人数据的内容必须设置 `localOnly: true`。本地模式没有匹配声音时返回 `unavailable`，绝不回退到可能联网的浏览器默认声音。

## 与 ASR 协作

同一功能同时使用朗读和语音识别时必须采用半双工顺序：

```text
停止上一段 ASR
    → 开始朗读
    → 等待 completed / error / unavailable
    → 创建新的 ASR 会话
```

- 不得在 TTS 正在发声时打开麦克风识别，避免把题目本身识别成孩子答案。
- 切题、重新开始或离开页面时先 `browserTts.stop()`，再清理 ASR。
- `stop()` 会让等待中的朗读返回 `cancelled`；业务收到该结果后不得继续启动旧题目的 ASR。
- TTS 错误或设备不支持朗读时，可以继续进入可见题目和 ASR 作答流程。
- ASR 的 Key、服务端转接和 600 秒限制继续遵循 [`ASR_REALTIME.md`](./ASR_REALTIME.md)。

## UI 与儿童体验

- 全局偏好默认“中英”，但声音只在孩子/家长发生有效功能操作或完成一次学习动作后播放；选择“无”后不再自动朗读。
- 朗读按钮必须包含文字，触控尺寸不小于 48 × 48px，并支持键盘焦点。
- 短题目可以在开始后自动逐题朗读；长阅读必须提供朗读、暂停/继续和停止操作。
- 状态使用温和文字：`准备朗读 / 正在朗读 / 已暂停 / 暂时不能朗读`，不使用闪烁或高压倒计时。
- 朗读失败只影响声音，不隐藏内容、不清空进度、不判定失败。
- 视觉和交互细则继续遵循 [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)。

## 错误与降级

通用服务将浏览器错误转换为稳定结果和儿童可读消息，主要包括：

- 没有声音引擎或对应语言包；
- 网络声音连接失败；
- 扬声器不可用或被占用；
- 未经过用户操作，浏览器拒绝播放；
- 指定声音失效；
- 单段朗读超时。

`cancelled`、`empty` 和 `unavailable` 都是正常可处理结果，不应作为未捕获异常抛到页面。业务需要错误提示时读取 Hook 的 `error` 状态，不直接显示浏览器的原始异常对象。

## 测试要求

通用服务测试必须至少覆盖：

- 空文本和中英文分段；
- 超长句的自然标点拆分；
- 本地声音、语言和显式声音选择；
- 多段顺序完成；
- 新内容替换旧内容；
- 暂停与继续；
- 浏览器不支持和网络错误。

新增朗读页面还应在实际目标设备上人工验证：

- Chrome / Edge / Safari 中至少一个主要桌面浏览器；
- 实际安装的中文声音；
- 首次点击、连续切题、暂停、离页和重新进入；
- 与麦克风 ASR 不同时运行；
- 浏览器无声音或断网时核心内容仍然可用。

参考：

- [MDN：SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)
- [Web Speech API 规范](https://webaudio.github.io/web-speech-api/)
