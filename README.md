# MumuIsTheBest

给 5 岁孩子使用的技术启蒙与算术练习网站。

## 当前状态

项目已采用 React + Vite + Fastify，并已创建阿里云 Fun-ASR 实时语音识别、五个正式数学玩法、“元素周期表”“反应熔炉”“分子工厂”“实验大师”四个化学模块，以及“拼音星桥”“常用汉字”两个语文模块。

- 技术方案（已选定 A）：[`docs/TECH_STACK_OPTIONS.md`](docs/TECH_STACK_OPTIONS.md)
- 正式设计系统（已选定星际探索舱）：[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)
- 实时语音识别与密钥安全：[`docs/ASR_REALTIME.md`](docs/ASR_REALTIME.md)
- 数学加减练习规则与数据语义：[`docs/ADD_SUBTRACT_PRACTICE.md`](docs/ADD_SUBTRACT_PRACTICE.md)
- 数学算数大战规则与数据语义：[`docs/ARITHMETIC_BATTLE.md`](docs/ARITHMETIC_BATTLE.md)
- 数学乘法小能手规则与数据语义：[`docs/MULTIPLICATION_PRACTICE.md`](docs/MULTIPLICATION_PRACTICE.md)
- 数学神秘函数模板、参数与实时绘图规则：[`docs/MYSTERY_FUNCTION.md`](docs/MYSTERY_FUNCTION.md)
- 数学找数字语音、区间与持续数轴规则：[`docs/FIND_NUMBER_GAME.md`](docs/FIND_NUMBER_GAME.md)
- 语文拼音总表、汉字关联与语音导航：[`docs/PINYIN_STAR_BRIDGE.md`](docs/PINYIN_STAR_BRIDGE.md)
- 化学元素周期表数据、布局与语音交互：[`docs/PERIODIC_TABLE.md`](docs/PERIODIC_TABLE.md)
- 化学反应熔炉资料库、组成规则与实时渲染：[`docs/REACTION_FURNACE.md`](docs/REACTION_FURNACE.md)
- 分子工厂自由投放、自动/手动合成、原子团与统一资产规则：[`docs/MOLECULE_FACTORY.md`](docs/MOLECULE_FACTORY.md)
- 化学虚拟观察玩法：[`docs/EXPERIMENT_MASTER.md`](docs/EXPERIMENT_MASTER.md)
- 当前规则、能力进展与后续顺序总览：[`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)
- Codex/工程协作规则：[`AGENTS.md`](AGENTS.md)
- 视觉选型原型存档：[`temp/style-02-galaxy.html`](temp/style-02-galaxy.html)

正式美术基线已确定为“星际探索舱”。后续所有 UI 均遵循设计系统，不再以 `temp/` 原型作为运行时依赖。原型中的控件仅用于演示，不会保存数据。

## 已确定的基础原则

- 不使用数据库，业务数据以文件形式保存。
- 默认题库/课程内容与孩子的运行时个人数据分开。
- 运行时数据默认存放在 Git 忽略的 `var/`，并可通过 `APP_DATA_DIR` 放到仓库外。
- 备份默认存放在 Git 忽略的 `backups/`，以后提供显式导入/导出和恢复机制。
- 美术风格固定为“星际探索舱”：深空玻璃面板、紫/青/粉光效、大字号圆润组件和克制动效。
- API Key 永不写入仓库；语音测试页会将其仅保存到本机 Git 忽略的 `var/config/asr-settings.json`，重新打开页面可直接使用但不会显示明文。
- 每一次实时 ASR 识别强制最多 2 分钟；该规则会自动继承到后续算术、游戏与知识模块。

## 下一步

1. 在工程根目录执行 `./init_and_start.sh`。它会检查环境、安装锁定的 npm 依赖、释放本项目的端口、启动服务并自动打开网页；如只想在终端环境启动而不打开浏览器，可执行 `MUMU_NO_OPEN=1 ./init_and_start.sh`。
2. 首页进入“数学 → 加减练习 / 算数大战 / 乘法小能手”，可使用按钮或语音“开始 / start”开启一局；回答请说“等于 + 答案”。
3. 首页进入“数学 → 神秘函数”，可同时点亮最多四条常见函数曲线，调整参数并用坐标探针比较同一个 `x` 对应的 `y`。
4. 首页进入“数学 → 找数字”，选择零至百、千、万或十万的范围，通过语音询问“是 / 小于 / 大于某个数吗”，观察持续数轴一步步缩小范围。
5. 首页进入“化学 → 元素周期表”，可浏览 1—118 号元素，通过点击、方向键或语音探索元素档案；每个元素详情会列出统一知识库中全部相关物质，并可查看丰富资料与本地二维结构图。
6. 首页进入“化学 → 反应熔炉”，从右侧原子仓投放原子，观察它们运动、聚合并组成每批随机出现的 10 种物质；518 种物质池覆盖教材常见酸碱盐和四种碳材料，每批固定 2 种有机物，并先随机确定 10 种优先元素。
7. 首页进入“化学 → 分子工厂”，从前 90 号元素中自由投放原子；可排除有机物、切换自动或手动提示合成，并观察带电荷的常见原子团。
9. 首页进入“语文 → 拼音星桥”，在 63 个声母、韵母和整体认读音节中探索相关汉字、完整带调拼音与组词。
