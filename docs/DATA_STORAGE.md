# 本机数据目录与迁移规范

状态：**已实现**

## 1. 默认位置

所有长期运行数据默认写入仓库同级的 `../data/`。例如仓库位于：

```text
/Users/example/github/MumuIsTheBest/
```

则数据目录为：

```text
/Users/example/github/data/
```

这个目录不在 Git 工作树内，因此在仓库中执行 `git reset`、`git clean` 或重新拉取代码都不会触及它。仍需注意：显式删除 `../data/`、磁盘损坏或整机丢失不在 Git 隔离的保护范围内，重要数据仍应定期备份。

可用绝对路径环境变量 `APP_DATA_DIR` 更换位置。相对路径会被拒绝，避免因启动目录变化而写到意外位置。`./init_and_start.sh` 会在启动服务前检查并创建数据根目录、`run/` 和 `logs/`，权限设为 `0700`；直接运行服务时，Fastify 启动过程也会检查并创建数据根目录。启动日志只显示最终目录，不显示文件内容。

## 2. 完整持久化清单

以下路径都相对于 `../data/` 或 `APP_DATA_DIR`：

| 功能 | 文件 | 内容 |
|---|---|---|
| ASR 本机配置 | `config/asr-settings.json` | 阿里云端点与 API Key；页面永不回显 Key |
| 加减练习 | `learning/math/add-subtract-history.json` | 完整场次、逐题首次正确与耗时 |
| 算数大战 | `learning/math/arithmetic-battle-history.json` | 难度、并行题目、解题顺序与耗时 |
| 乘法小能手 | `learning/math/multiplication-history.json` | 档位、乘除题目、正确率与耗时 |
| 数学知识塔 | `learning/math/knowledge-tower-progress.json` | 已点亮知识灯与目录版本 |
| 常用汉字 | `learning/chinese/common-characters-progress.json` | 学习、掌握、继续复习次数与时间 |
| 英语回声岛 | `learning/english/echo-island-progress.json` | 学习池、完成次数、标记与幂等事件 |
| 物质塔与知识币 | `learning/world-tower/progress.json` | 节点、知识币余额、奖励场次、幂等标记与交易 |
| 反应熔炉 | `learning/chemistry/reaction-furnace-state.json` | 当前批次、原子、稳定结构与批次编号 |
| 分子工厂 | `learning/chemistry/molecule-factory-state.json` | 原子、原子团、收藏、选项与中断状态 |
| 界面偏好 | `preferences/experience.json` | 界面语言与朗读模式 |
| 启动辅助 | `run/mumu-dev.pid`、`logs/mumu-dev.log` | 当前启动进程号与不含个人内容/密钥的日志 |

知识币不是浏览器独立余额；它与物质塔进度共用同一服务端文件。找数字、猫鼠游戏等玩法当前只通过这份文件记录奖励，不保存独立答题历史。神秘函数、拼音星桥、元素周期表、实验大师、声律启蒙等当前不保存个人进度。

反应熔炉、分子工厂及界面偏好旧版本曾写入浏览器 `localStorage`。新版本只把它作为一次性迁移来源：当服务端文件为空时读取旧记录、校验后写入上表对应文件；服务端已有记录时始终以服务端为准。会话内“本次已播放欢迎语”只使用 `sessionStorage`，关闭会话即失效，不属于长期数据。

## 3. 旧 `var/` 迁移

使用默认 `../data/` 时，服务端启动会递归检查仓库内旧 `var/`：

- 只复制目标目录中尚不存在的普通文件；
- 目标已有文件时保持目标不变；
- 先复制到目标目录临时文件，再以不覆盖方式落盘；
- 新目录权限为 `0700`，迁移文件权限为 `0600`；
- 拒绝跟随符号链接；
- 不删除或修改旧 `var/`，因此迁移可重复验证和回滚。

迁移成功后，后续所有写入只进入新数据目录。旧 `var/` 可保留到家长确认数据完整；即使之后被 `git clean -fdx` 清除，新目录中的数据也不会受影响。配置自定义 `APP_DATA_DIR` 时不会自动混入仓库旧数据，需要家长明确选择迁移来源。

## 4. 文件安全规则

- 所有输入和磁盘文件都经过 schema 校验；损坏或未来版本不会被当成有效进度。
- 新增或升级的持久化格式必须包含 `schemaVersion`、稳定 ID、`createdAt` 和 `updatedAt`；既有格式按各玩法规范兼容读取，并在其版本升级时补齐。
- 业务写入使用单写入队列、同目录临时文件、原子替换和 `0600` 权限。
- API Key、音频、ASR 识别原文和未匹配语音结果不进入学习记录或日志。
- 测试只使用操作系统临时目录，绝不触碰真实 `../data/`。
