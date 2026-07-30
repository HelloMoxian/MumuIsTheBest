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

## 文本规则

- 业务层提供“适合听”的语义文本，不直接读取整个页面的 `innerText`。
- 数学符号必须转换为自然口语，例如 `7 - 3 = ?` 转换为“七减三等于多少”。
- 元素、单位、缩写、多音字或中英文混排由对应学科模块生成明确的朗读文本。
- 原始可见文字始终保留；朗读是辅助能力，不是题目和无障碍语义的替代品。
- 空文字直接返回 `empty`，不会调用浏览器声音引擎。

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
- ASR 的 Key、服务端转接和 120 秒限制继续遵循 [`ASR_REALTIME.md`](./ASR_REALTIME.md)。

## UI 与儿童体验

- 声音默认关闭，或只在孩子/家长明确选择“朗读”并开始任务后播放。
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
