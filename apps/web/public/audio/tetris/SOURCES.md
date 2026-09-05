# 俄罗斯方块音频来源

六份音频均随应用本地发布，运行时不访问第三方网站。素材复用仓库内已经下载的 CC0 原件；已重新核对来源网页和原件 SHA-256。完整文件摘要、原名、作者和处理方式见 `manifest.json`。

| 文件 | 用途 | 作者与来源 | 许可 |
| --- | --- | --- | --- |
| `music.cc0.mp3` | 循环背景音乐，约 56 秒 | wipics，[City Loop](https://opengameart.org/content/city-loop-0) | CC0 / Public Domain |
| `move.cc0.wav` | 100ms 移动反馈 | Kenney，[Digital Audio](https://kenney.nl/assets/digital-audio)，phaseJump2 | CC0 |
| `rotate.cc0.wav` | 280ms 旋转反馈 | Kenney，同上 phaseJump2 | CC0 |
| `lock.cc0.wav` | 280ms 温和落地声 | qubodup，[Crash Collision](https://opengameart.org/content/crash-collision) | CC0 |
| `clear.cc0.wav` | 827ms 消行提示 | Kenney，同上 threeTone1 | CC0 |
| `level.cc0.wav` | 1149ms 升级提示 | Kenney，同上 powerUp3 | CC0 |

原件存放在 `assets/audio/galaxy-racer/`，原始来源记录见该目录的 README。这里按俄罗斯方块交互重新裁切音效，并降低原始增益、增加 6ms 淡入和 30ms 淡出，转成 22050Hz 单声道 PCM WAV；音乐保持原文件。

需要重建时运行 `node scripts/prepare-tetris-audio.mjs`。生成器首先校验全部原件摘要，再使用本机 ffmpeg 生成派生文件与摘要清单，不请求网络、不覆盖原件。许可全文：[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)。
