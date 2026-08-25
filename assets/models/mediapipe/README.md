# MediaPipe 体感模型

本目录随应用本地发布，避免切水果玩法运行时依赖外部 CDN。

| 文件 | 官方来源 | SHA-256 |
|---|---|---|
| `hand_landmarker.float16.v1.task` | `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` | `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` |
| `pose_landmarker_lite.float16.v1.task` | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |

运行库为 `@mediapipe/tasks-vision` 1.0.1，许可证为 Apache-2.0。WASM 从该 pnpm 依赖通过 Vite `?url` 打包，不复制进本目录。

摄像头图像在浏览器本机进入模型，不发送到 Google 或应用服务端。MediaPipe Tasks 的官方隐私说明仍提示运行库可能发送性能与使用指标；产品部署方需要按实际发布范围处理同意与隐私告知。
