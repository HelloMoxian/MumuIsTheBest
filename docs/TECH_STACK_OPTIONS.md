# 正式技术栈候选方案

状态：**已选定方案 A（React + Vite + Fastify）**

调研日期：2026-07-27

## 共同基础（所有方案都采用）

- 运行时：Node.js 24 LTS
- 语言：TypeScript（strict）
- 包管理：pnpm，锁定 lockfile
- 数据：JSON/JSONL 等可读文件 + schema 校验 + 原子写入
- 数据目录：默认仓库同级 `../data/`，可由绝对路径 `APP_DATA_DIR` 指向其他仓库外位置
- 测试：Vitest；关键儿童操作流后续增加 Playwright
- 代码质量：ESLint + Prettier（或所选框架的等价官方配置）
- API：版本化契约、统一错误结构、服务端校验所有输入
- 部署目标：首先保证一条命令即可在家庭电脑上长期自托管

不选择 SQLite、PostgreSQL、MongoDB、Redis 或 ORM。文件存储通过独立 repository/service 层封装，页面与 API 不感知具体文件路径。

## 方案对比

| 方案 | 结构 | 优点 | 代价 | 适合情况 |
|---|---|---|---|---|
| **A. React + Vite + Fastify（推荐）** | pnpm workspace；`apps/web` 与 `apps/server` 分开，`packages/contracts` 共享类型 | 前后端边界最清楚；文件读写只存在于后端；开发、测试和未来替换 UI 都直观；长期本地运行可控 | 两个应用，初始配置比全栈框架略多；开发时由统一脚本同时启动 | 重视代码/数据隔离、可维护性和长期家庭自托管 |
| **B. Next.js App Router** | 单一 Next.js 应用；页面、Server Components、Route Handlers 共存 | 上手快；全栈能力集中；路由、渲染、构建和元数据有统一约定 | 前后端边界较软；缓存与 server/client 边界需要额外纪律；文件写入要求始终运行 Node.js server，不能当纯静态站点部署 | 希望目录最少、团队熟悉 React/Next.js |
| **C. Nuxt 4 + Nitro** | 单一 Nuxt 应用；Vue 前端 + `server/` API | Vue 模板对页面开发友好；前端与 server 目录天然分开；Nitro 可直接输出 Node.js server | 团队需要接受 Vue 生态；与 React 方案相比可复用资源可能更少 | 偏好 Vue，想要一体化框架又希望目录边界清楚 |

## 推荐：方案 A

推荐目录草案：

```text
.
├── apps/
│   ├── web/                 # React 儿童端与家长端
│   └── server/              # Fastify API 与文件存储
├── packages/
│   ├── contracts/           # API/文件 schema 与共享类型
│   ├── design-system/       # 选定视觉系统的组件与 tokens
│   └── learning-engine/     # 与 UI、存储无关的出题/判题逻辑
├── content/                 # 可提交的默认题库和课程模板
├── docs/
└── temp/                    # 本轮视觉样稿，不参与正式运行
../data/                     # 运行时个人数据、配置、日志和未来备份，不属于 Git 工作树
```

### 推荐原因

1. **最符合数据隔离要求**：浏览器永远只调用 API，文件系统只在 `apps/server` 中访问。
2. **文件存储容易测试**：repository 层可以对临时目录测试原子写入、迁移和恢复。
3. **视觉系统可独立演进**：选定的组件集中在 `packages/design-system`，业务页面不会各写一套样式。
4. **以后仍有选择权**：未来想把存储替换成其他实现，主要修改 server repository，不需要重写儿童端。
5. **本地运行简单**：开发用一个 workspace 命令同时启动前后端，生产时 Fastify 可同时托管 Vite 构建产物，只保留一个常驻 Node.js 进程。

### 方案 A 的建议细化

- Web：React + Vite + React Router（具体大版本在正式初始化时锁定）
- Server：Fastify + TypeScript
- 契约：Zod 或 TypeBox（二选一，在初始化时做最小验证后固定）
- 样式：CSS variables/tokens + CSS Modules；是否使用 Tailwind 在视觉系统落地时再决定
- 图表：优先 HTML/CSS/SVG-free 的轻量实现；只有复杂家长报表再引入图表库
- 文件结构：按孩子/领域拆分小文件，避免一个无限增长的大 JSON
- 写入策略：临时文件写完并 `fsync` 后原子 rename；串行写入；保留最近一次恢复点

## 方案 B 的落地提醒

- 必须使用 Node.js server 自托管模式，不能使用纯静态导出承载写入能力。
- 文件读写只能出现在 server-only 模块和 Route Handler/Server Action 的服务端路径。
- 明确关闭或规避会让学习进度读取陈旧的缓存行为。
- 产品复杂后，可把文件 repository 抽成 workspace package 或独立 server。

## 方案 C 的落地提醒

- 使用 Nuxt 4 的 `app/`、`server/`、`shared/` 目录边界。
- 只在 `server/` 内访问运行时数据目录。
- 生产运行使用 Nuxt/Nitro 生成的 Node.js server output。

## 暂不建议的方向

- **Electron/Tauri 桌面应用**：当前需求用浏览器 + 本地 Node 服务即可，桌面壳增加打包和升级成本。
- **微服务**：家庭单机项目没有收益，会让数据一致性、日志和启动方式更复杂。
- **Serverless/Edge 优先**：本项目依赖本地长期文件写入，与无状态运行模型不匹配。
- **把数据放进 Git**：会把日常学习记录变成代码变更，也容易误提交个人信息。

## 已落地的第一项能力

实时语音识别测试采用方案 A：React/Vite 负责儿童端交互与麦克风采集，Fastify 负责同源 WebSocket 和阿里云 Fun-ASR 安全转接。详见 `docs/ASR_REALTIME.md`。

## 官方资料

- [Node.js Releases](https://nodejs.org/en/about/previous-releases)
- [Vite Getting Started](https://vite.dev/guide/)
- [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js Self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Nuxt 4 Installation](https://nuxt.com/docs/4.x/getting-started/installation)
- [Nuxt 4 Deployment](https://nuxt.com/docs/4.x/getting-started/deployment)
