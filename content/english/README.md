# 英语回声岛内容资产

`echo-island.v1.json` 是玩法使用的唯一句库清单，共包含 1000 条英文完整表达、简体中文翻译及 2000 个双语 MP3 路径。原始 MP3 不转码地保存在 `echo-island-audio.v1.tar` 中，服务端按目录项直接返回一句对应的音频。

## 来源与使用边界

- 来源： [50LANGUAGES / book2](https://www.50languages.com/)
- 许可说明： [50LANGUAGES Licence](https://www.50languages.com/licence)
- 本仓库中的这批文字和录音只按用户要求用于个人、非商业学习。
- 音频许可包含署名、非商业及禁止演绎等限制；把仓库、安装包或音频再次发布给他人之前，必须重新核对来源的最新许可并取得所需授权。
- 不要把这些录音上传到公共 CDN、应用商店或开放数据集。

句子从来源的 100 课、1800 条初级素材中筛选：排除了没有句子形态的孤立单词、英美拼写并列造成文字与美式录音不一致的条目，以及酒精、夜生活、银行、职场和羞辱性表达。英文使用来源的美式真人录音（`EM`），中文使用简体中文真人录音（`ZH`）。

## 生成与校验

补齐或重新下载音频：

```bash
node scripts/download-english-echo-audio.mjs
```

可以使用 `--concurrency` 调整并发下载数；默认值为 20，允许范围为 1—24：

```bash
node scripts/download-english-echo-audio.mjs --concurrency 12
```

校验目录、学习参数、ID、双语音频数量、文件大小和 MP3 文件头：

```bash
pnpm content:english:validate
```

音频资产路径固定为：

```text
content/english/echo-island-audio.v1.tar
```

TAR 内使用 `en/NNNN.mp3` 与 `zh/NNNN.mp3` 两种目录项；这是未压缩的 USTAR 集合，便于服务端按字节范围读取而不修改来源录音。

个人学习次数、标记池和轮换状态属于运行时数据，只能写入 `var/learning/english/echo-island-progress.json`（或 `APP_DATA_DIR` 对应目录），不能写回本目录。
