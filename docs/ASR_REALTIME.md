# 阿里云 Fun-ASR 实时语音识别

状态：已实现本地测试入口，等待使用有效 Key 在浏览器中手动验证。

## 目的

儿童在算术、游戏和知识问答中可以通过语音输入答案；本轮先提供一个独立的“语音识别测试”界面，用于验证麦克风、网络、API Key 和实时文字回传。

## 安全架构

```text
浏览器麦克风（16 kHz、单声道 PCM）
        │ 同源 WebSocket；仅当前会话内存
        ▼
Fastify 本地服务 /api/asr/stream
        │ 从本机忽略文件读取 Key；在握手请求头中附带 Authorization
        ▼
阿里云百炼 Fun-ASR WebSocket
        │ task-started / result-generated / task-finished / task-failed
        ▼
浏览器右侧实时文字区
```

浏览器原生 WebSocket API 不能安全地附加阿里云要求的 `Authorization` 握手头，因此 API Key 必须由本地 Fastify 服务转接；不能让浏览器直接连接阿里云端点。

## 密钥规则（强制）

- 不把 API Key 写入源代码、`README`、测试、截图、日志、浏览器存储或 Git 提交。
- “语音识别测试”是本机可视化配置页。首次粘贴并点击“保存本机配置”后，服务端以原子写入方式保存至仓库同级 `../data/config/asr-settings.json`（或 `APP_DATA_DIR/config/asr-settings.json`）；它不属于 Git 工作树，文件权限为仅当前用户可读写。
- 页面重新打开时只读取“是否已配置”和端点，绝不回传或显示 API Key 明文；后续识别由服务端从该本机文件读取 Key。粘贴框可用于替换 Key，保存后立即清空。
- 服务端仅在内存中短暂使用 Key 建立上游连接，绝不打印该值。
- `.env`、`.env.local` 和所有 `.env.*` 已被 `.gitignore` 忽略；`.env.example` 只保留空键名。
- 私有自托管时也可以在机器环境中配置 `DASHSCOPE_API_KEY`，作为未创建本机配置文件时的后备。公开或多人可访问的部署不得开放任意用户可用的共享 Key。
- 页面只允许连接 `wss://*.maas.aliyuncs.com/api-ws/v1/inference`，防止把 Key 转发到任意地址。

## 使用方式

1. 在项目根目录执行 `./init_and_start.sh`。
2. 从主页顶部“功能测试” → “语音识别测试”打开独立页面（`/tools/asr-lab`）；主页底部不再展示实验室。
3. 在实验室配置区粘贴阿里云 API Key；默认 WebSocket 地址已是当前北京业务空间地址，可按需要修改为同一规则下的其他阿里云业务空间地址。
4. 点击“保存本机配置”。随后重新打开页面也会自动使用这台电脑上的配置，页面不会显示 Key 明文。
5. 点击“开始录入”，允许浏览器麦克风权限，对着麦克风说话；最终句子与中间结果会显示在右侧。
6. 点击“停止录入”后，服务端发送 `finish-task` 并等待最终文字和 `task-finished`。

实验室提供“返回学习大厅”入口。各玩法的“配置语音”链接指向同一独立页面；旧地址 `/#asr-lab` 兼容跳转。主页不再加载实验室配置或识别会话逻辑。

## 协议约定

- 上游模型：`fun-asr-realtime`
- 音频格式：`pcm`，16,000 Hz，单声道，16-bit little-endian
- 服务端先发送 `run-task`，仅在收到 `task-started` 后转发二进制音频。
- `result-generated` 中的 `sentence_end=false` 显示为实时中间文字；`true` 后写入最终文字列表。
- `task-failed`、连接超时、无效 Key、无效端点和麦克风拒绝均映射为页面可见错误，不包含密钥。

## 时长上限（强制）

- 每一次 Fun-ASR 实时会话默认、且必须限制为最多 **10 分钟（600 秒）**。除非未来需求明确批准并同步修改本规范，否则所有接入 ASR 的算术、游戏和知识模块都继承这一上限。
- Fastify 服务端从收到阿里云 `task-started` 起计时；达到 600 秒后主动停止转发音频并发送 `finish-task`。这是权威限制，不能仅依赖浏览器计时器。
- 浏览器同时显示倒计时并在到时停止麦克风，以提供明确反馈；即使页面异常，服务端上限仍生效。
- 到达上限后应保留阿里云返回的最后一句结果，并向孩子显示温和、可理解的提示；下一次开始录入是新的独立会话。

## 参考资料

- [Fun-ASR 实时语音识别 WebSocket API](https://help.aliyun.com/zh/model-studio/fun-asr-realtime-websocket-api)
- [Fun-ASR 客户端事件](https://help.aliyun.com/zh/model-studio/fun-asr-client-events)
- [Fun-ASR 服务端事件](https://help.aliyun.com/zh/model-studio/fun-asr-server-events)
