# 宝石连连看

入口：首页「游戏」→「宝石连连看」，路径 `/games/gem-connect`。当前规则版本 5，面向家庭儿童，无倒计时、失败或有限提示。界面默认直接入场，不需要开始确认。

## 十五关（新版）

| 关 | 名称 | 行 × 列 | 宝石数 | 种类 | 最高得分 | 知识币 | 能量币 |
|---|---|---|---|---|---|---|---|
| 1 | 初见星光 | 5 × 12 | 60 | 4 | 300 | 10 | 10 |
| 2 | 水晶花园 | 6 × 12 | 72 | 5 | 360 | 20 | 20 |
| 3 | 彩虹溪流 | 6 × 14 | 84 | 7 | 420 | 30 | 30 |
| 4 | 月光小径 | 7 × 14 | 98 | 8 | 490 | 40 | 40 |
| 5 | 极光山谷 | 7 × 16 | 112 | 10 | 560 | 50 | 50 |
| 6 | 星砂海岸 | 8 × 16 | 128 | 11 | 640 | 60 | 60 |
| 7 | 云端宝库 | 8 × 18 | 144 | 13 | 720 | 70 | 70 |
| 8 | 银河漫游 | 9 × 18 | 162 | 14 | 810 | 80 | 80 |
| 9 | 彗星奇遇 | 9 × 20 | 180 | 16 | 900 | 90 | 90 |
| 10 | 璀璨星河 | 10 × 20 | 200 | 17 | 1000 | 100 | 100 |
| 11 | 星云秘境 | 10 × 22 | 220 | 19 | 1100 | 110 | 110 |
| 12 | 量子晶宫 | 11 × 22 | 242 | 21 | 1210 | 120 | 120 |
| 13 | 时光星港 | 11 × 24 | 264 | 23 | 1320 | 130 | 130 |
| 14 | 超新星域 | 12 × 24 | 288 | 25 | 1440 | 140 | 140 |
| 15 | 宇宙之心 | 12 × 26 | 312 | 27 | 1560 | 150 | 150 |

第一关从 60 颗开始，第十关为 200 颗，第十五关增加到 312 颗。原有八种基础宝石加上第二至十关引入的九种宝石保持不变；第 11—15 关每关再加入两种，依次为叶片/蝴蝶结、雪花/齿轮、皇冠/圆环、钥匙/火焰、沙漏/棱镜，第十五关共 27 种。每种宝石始终成对；每连接一对固定得 10 分，因此最高得分随棋盘配对数自然增长。第二关起比较最多六个合法随机布局，选择相邻同种宝石较少的一盘，减少扎堆；不通过无限重试生成难题。关卡规模增加不意味着每一盘随机布局的实测耗时都严格增加。公开玩法参考保留：[两次转弯规则](https://playboardgames.org/how-to-play/mahjong-connect)、[无解自动洗牌](https://www.mahjongfun.com/mahjong-connect/)、[外缘连接](https://www.freebrowsergaming.com/mahjong/)。

## 宽屏布局调整

规则版本 5 使用约 2:1 横向棋盘，宝石数量近似原关卡。旧版 2—4 按原配对数量读取与结算，旧成绩不混入新版榜单；历史文件结构仍为 schemaVersion=3。顶部关卡固定两行：编号、完整名称；名称不换行，空间不足时缩小文字。压缩顶栏、工具栏和说明区；全屏隐藏共用顶栏与音乐入口，只保留进度、正计时和退出按钮。

## 游戏与动画流程

- 进入页面、选择关卡、重玩直接生成棋盘，宝石按对角波次错峰滑入、弹落；380ms 错峰 + 470ms 单颗动画，总入场约 850ms。
- 两颗相同宝石可经水平/垂直空路连通，最多两次转弯，允许绕外缘一圈。不匹配不扣分。
- 成功后先沿真实路径绘制约 220ms 连线，再让两颗宝石弹起、缩小散成六颗短暂星屑，620ms 后移除。每组动画独立播放：配对成功立即清空逻辑格位，保留视觉副本至动画结束，其余宝石立即可选，可经已清空格位继续连线。重复点击正在消失的宝石无效；手动提示只选剩余宝石，手动重排结束旧动画并播放新入场。仅在无可连配对或最后一组清空时等待全部动画收尾，再自动重排或庆祝；不会重复发放奖励。
- 第 1—14 关显示约 2.2 秒通关庆祝后自动进入下一关；不出现“下一步 → 开始”两次确认。第 15 关保留最终完成与单击重玩入口。奖励保存与自动过关独立。
- 桌面端顶部十五关在一行完整展示并可直接切换，不弹确认；窄屏保留紧凑选择器。每关独立在浏览器 localStorage 保存棋盘、实例 ID、正计时、提示与重排次数；切关恢复原局，停留在其他关卡不计时。休息旁“开始新一局”仅重置当前关并生成新 ID。刷新恢复上次关卡及进度；动画消除已完成的逻辑结果保留，不重复播放旧动画。
- 无路可连时自动重排，保留空位与剩余种类/数量；随机重排后仍无解则交换宝石构造一对可连项，避免无限重试。重排也播放入场动画。
- 20,000ms 活动时间没有成功配对，自动圈出一个合法配对，标星、放大至约 1.14 倍并以 1.45 秒周期柔和呼吸。固定阈值不显示、不提供设置；错误尝试不重置阈值，成功配对重置。暂停、入场及无合法配对时的动画收尾不累计；可继续配对时正常累计。自动提示不计入手动提示次数，提示持续到成功配对或重新排列。
- 支持鼠标、触摸、Tab、Enter、空格、方向键移动焦点。棋盘按可用宽高等比缩放，完整展示所有宝石与外缘连线，不使用滚动阵列。纵向空间利用更高时，转置展示行列与路径，逻辑位置、计时和消除状态保持不变。工具按钮至少 48px；按用户明确要求，宝石格可为完整显示而缩小。
- 全屏模式仅保留棋盘、正计时、已连接配对进度、退出按钮及必要暂停/完成状态。钱包、关卡导航、排行榜、反馈和奖励装饰隐藏；浏览器不支持原生全屏时自动占满窗口。Escape 或退出按钮恢复原布局，Tab 焦点限制在游戏内。屏幕旋转与窗口大小改变实时适配，支持减弱动效。
- 正常模式用单独按钮打开本关成绩对话框，关闭后回到棋盘；窄屏关卡导航改为选择器，减少顶部占用。全屏得分只是当前关卡进度显示，排名仍只比较用时。
- 减弱动效下取消入场位移、放大呼吸、星屑与金币飞行；保留静态线、轮廓和文本，匹配短暂停留 100ms，逻辑不依赖 CSS 动画回调。

## 计时与榜单

采用单调时间正计时，只累计可操作的 playing 阶段；可继续配对的重叠动画期间正常计时，暂停、后台、入场、无合法配对时的动画收尾和过关庆祝不计时。隐藏计时仅隐藏数字。后台自动暂停并遮住棋盘，返回后点一次继续；恢复会延续未完成动画和提示时间，不重复结算。

同一规则版本、同一关卡按毫秒用时升序，平局按创建时间及 UUID 稳定排序，显示前十记录。**旧规则 12—60 颗（rulesVersion=1）、60—180 颗且最多八种（rulesVersion=2）、本次十五关扩展前的 17 种十关规则（rulesVersion=3）成绩完整保留，不混入新版 rulesVersion=5 榜单。第一版历史不补发奖励，第二、三版已有奖励与未完成的待发收据保留。**

## 双钱包奖励与持久化

GET/POST `/api/games/gem-connect/history`；新版使用 `rulesVersion: 5`；服务端兼容第二、三版待提交记录，并校验 UUID、新版 1—15 关（旧版仍限 1—10 关）、正安全整数活动毫秒、非负提示/重排次数和与关卡相符的配对数量。金额由服务端固定为 `level × 10`，第 11—15 关每种币依次奖励 110—150；没有浏览器传金额、三倍轮换、时间扣减或随机倍率。正常反复通关分别有新 UUID，可分别获奖；同一 UUID 重试只发一次。

1. 服务端先把完整通关写入历史，状态 `rewardStatus: pending`，形成持久的待发奖励记录。
2. 通过现有知识币和能量币各自的单写入队列发放，两钱包的 `gemConnectRewards` 保存 UUID→关卡永久去重收据。重试相同 UUID/关卡只返回现有余额；同 ID 不同关卡拒绝。
3. 两钱包成功后再把历史标为 `granted`。同一次历史重试不新增成绩。
4. 如果任一步失败，浏览器保留队列，每 15 秒重试，也可手动重试，不阻断下一关。服务端启动以及读取历史时会恢复 pending 奖励，即使浏览器已经离开，也不会因为一方已到账而重复发放。
5. 确认入账后顶部两种余额更新，知识币复用通用金币飞行动效，能量币以短暂飞行组和准确 `+N` 提示展示。未确认时不显示到账成功。

跨两个文件的结算不是单一磁盘原子事务：极端故障时可能暂时只有一个钱包到账，但持久待发记录及钱包收据确保可恢复、无重复发币。现有钱包其它收入、消费与并发写入继续经过原队列，不被覆盖。

文件仍在仓库外 `APP_DATA_DIR`（默认 `../data/`）：
- `learning/games/gem-connect-history.json`：schemaVersion=3，稳定 ID、根 createdAt/updatedAt，逐次通关 UUID、规则版本、数量、提示/重排、活动时间与 rewardStatus。
- `learning/world-tower/progress.json`：既有知识币余额和交易，新增可缺省 `gemConnectRewards` 收据，旧文件读取时默认为空。
- `learning/games/fruit-slice-history.json`：既有能量币余额，新增同样的收据，不改变原有切水果、赛车或其他玩法的账目。

三个文件的写入仍经原子临时文件替换、0600 权限和各自单写入队列。历史版本 1 或 2 首次升级写入前，在同目录原子创建字节不变的 `gem-connect-history.json.v1.bak` 或 `.v2.bak`（0600、不覆盖），可用于只恢复旧版成绩；恢复点不用于回滚钱包收据。读取版本 1 仅在内存补 rulesVersion=1、rewardStatus=legacy；读取版本 2 保留逐条成绩、状态与规则版本，统一返回第三版合同，不因只读而改原文件。未来版本、损坏记录或不合法迁移拒绝且不覆盖。

未完成棋盘使用规则版本隔离的浏览器 localStorage 缓存，每关一个键，配对及状态改变即时保存，计时每秒保存，切关和离页补存；无旧缓存时从新局开始，损坏或规则不匹配仅忽略对应关卡，存储受限时降级为页面内记忆。缓存不写仓库或服务端。未送达服务端的浏览器队列不跨刷新恢复（已完成的关卡快照重新打开时可用原 ID 幂等补交）；仅有尚未确认的通关时才显示离页保护。已送达服务端的 pending 通关可在重启后恢复发奖。无独立导入导出接口；统一备份后续必须把历史版本 3、两钱包和收据一并纳入，不能只恢复余额或单删去重收据。无数据库、无真实数据测试、无浏览器长期成绩副本。

## 美术与界面

内置 imagegen 生成（非 API CLI）：
- 源图集：`assets/game/gem-connect/gems-atlas.v1.png`，透明 RGBA，4 列 × 2 行。
- 运行时 27 颗透明 WebP 与切分清单：`apps/web/public/images/gem-connect/`。
- 背景：同目录 `crystal-garden.webp`。
- 使用工程 `.agents/skills/chroma-atlas-extractor/`，`--keep-background` 保留生成透明通道；不对透明素材执行色键移除，不覆盖源图集。切分报告 0 warnings。
- 红心、蓝菱、绿方、金星、紫滴、橙六角、粉椭圆、白月牙依次进入玩法种类池。无文字烘焙进图片、无远程美术依赖。
- 新增九张独立宝石由内置 image_gen 分别生成。1254×1254 原图及完整逐张提示词保留于 `assets/game/gem-connect/expansion.v1/`；`manifest.json` 记录引入关卡与运行时路径。运行时统一转换为 384×384 RGBA，保留透明画布与原图，不做色键处理。
- 第 11—15 关的十张宝石由内置 image_gen 一次生成 5×2 透明图集，源图集、切分图和完整提示词保留于 `assets/game/gem-connect/expansion.v2/`。使用工程图集切分工具按固定 ID 拆分，0 warnings；运行时统一为 384×384 RGBA。十种颜色与轮廓均避开已有 17 种的组合，并保持相同的明亮多面切割画风。
- 深蓝玻璃棋盘、紫青粉操作状态遵守 DESIGN_SYSTEM；工具按钮至少 48px，宝石按可用屏幕整体缩放且完整可见；低动效关闭位移，仍保留连线与成功文字。无新增自动声音。

### 生成提示词

宝石图集：

Use case: stylized-concept. Production game sprite atlas for a beautiful children’s cosmic gemstone matching game. Exactly 4 columns by 2 rows, eight equally sized square cells, one large centered isolated jewel in each cell, generous 15% padding. Reading order: ruby red heart, cyan blue diamond rhombus, emerald green square emerald cut, golden yellow five pointed star, purple teardrop amethyst, orange hexagonal amber, rose pink oval gem, icy white crescent moon crystal. Each has a clearly DIFFERENT silhouette recognizable at 48px, exquisite chunky 3D faceted crystal, luminous inner refractions, polished highlights, soft bevels, premium animated film render, front view, consistent scale. Actual transparent background, no labels, no grid lines, no text, no shadows extending outside cells, no floating decorations. Wide 2:1 canvas.

背景：

Use case: stylized-concept. Asset type: full-screen background image for a gemstone matching game for children aged 5. Create one beautiful premium 3D animated film cosmic crystal garden background. Landscape 3:2 composition. Deep indigo outer space with a gentle purple nebula and a few small floating distant planets close to the upper outer edges. Beautiful softly glowing cyan and lavender translucent crystal clusters ONLY along the far left and far right edges and the bottom corners/edge, framing the scene. Huge calm very dark navy low-detail central 70% safe area, reserved for a game board; keep central area almost empty, uncluttered and dark. Crystals feel beautifully rounded and polished but faceted, soft cinematic lighting, delicate reflections, inviting magical wonder, refined composition, excellent visual depth. No text, no UI, no game board, no characters, no logos, no watermark. Render the art only.


## 验证

测试覆盖 120 盘新版 60—312 颗棋盘完整清空、合法路径、无解救援、自动入场与连续过关、20 秒阈值、错误尝试不重置、暂停冻结、三组快速配对与独立动画收尾、保留后续选择、跨已消除格位的连线、重叠动画暂停及重排、288 颗在一轮动画内清空且只结算一次、重复点击、减弱动效、旧版隔离。服务端覆盖空/非法数据、并发幂等、十五关累计各 1200 币、旧规则越级拒绝、单钱包失败后的重启补发、旧版本迁移和恢复点、写入失败以及损坏/未来版本不覆盖。只用临时目录。另覆盖十五关在横竖屏、小窗口和大屏可用区域内的完整布局、显示坐标往返、外缘路径转置、十种新宝石每关两种进入、相邻同种减少、版本 2 恢复点及新版排名隔离。

## 选中宝石的轻引导

选中宝石后连续 3 秒无点击或键盘操作，穷举从它出发、最多两次转弯且不穿过其他宝石的所有可达目标（含棋盘外缘路径）。忽略宝石图案是否相同，每个可达目标显示一条极淡青色路径，不标记能否消除、不区分正确答案。路径淡入后保持静止，不拦截操作；再次点击或按键、选中变化、棋盘变化、切关、暂停和重开时收起并重新等待。该视觉辅助不增加提示次数，不影响计时、分数、浏览器进度和原 20 秒自动提示；减弱动效直接显示静态线条。
