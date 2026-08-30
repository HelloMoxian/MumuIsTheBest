# MediaPipe 体感模型

本目录随应用本地发布，避免摄像头体感玩法运行时依赖外部 CDN。

| 文件 | 官方来源 | SHA-256 |
|---|---|---|
| `hand_landmarker.float16.v1.task` | `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` | `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` |
| `pose_landmarker_lite.float16.v1.task` | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |
| `blaze_face_short_range.float16.v1.tflite` | `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite` | `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f` |

切水果只导入手部模型；星际极速赛只导入短距离人脸检测模型。姿态模型保留给其他可能需要身体骨架的本机玩法，不会由这两个页面请求。

运行库为 `@mediapipe/tasks-vision` 1.0.1，许可证为 Apache-2.0。WASM 从该 pnpm 依赖通过 Vite `?url` 打包为本站 `/assets/` 下带内容哈希的 JS/WASM 文件，不复制进本目录。浏览器运行玩法时，模型、WASM 和加载器均只请求当前站点，不访问上表中的官方来源 URL 或第三方 CDN。

切水果设置页会后台预热 WASM 与手部模型；星际极速赛从游戏岛一次点击进入后并行预热 WASM、人脸模型和第一关资产。摄像头理想输入为 640×360、24fps，模型推理限制在约 12—15fps。生产服务对 `/assets/` 哈希资源使用一年 `immutable` 缓存，因此同一版本在首次完整读取后可以直接复用浏览器缓存。

摄像头图像在浏览器本机进入模型，不发送到 Google 或应用服务端。MediaPipe Tasks 的官方隐私说明仍提示运行库可能发送性能与使用指标；产品部署方需要按实际发布范围处理同意与隐私告知。
