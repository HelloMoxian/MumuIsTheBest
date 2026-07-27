# MumuIsTheBest

给 5 岁孩子使用的技术启蒙与算术练习网站。

## 当前状态

项目目前已完成工程规则和正式视觉系统，还没有创建正式应用代码。

- 技术方案候选：[`docs/TECH_STACK_OPTIONS.md`](docs/TECH_STACK_OPTIONS.md)
- 正式设计系统（已选定星际探索舱）：[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)
- Codex/工程协作规则：[`AGENTS.md`](AGENTS.md)
- 视觉选型原型存档：[`temp/style-02-galaxy.html`](temp/style-02-galaxy.html)

正式美术基线已确定为“星际探索舱”。后续所有 UI 均遵循设计系统，不再以 `temp/` 原型作为运行时依赖。原型中的控件仅用于演示，不会保存数据。

## 已确定的基础原则

- 不使用数据库，业务数据以文件形式保存。
- 默认题库/课程内容与孩子的运行时个人数据分开。
- 运行时数据默认存放在 Git 忽略的 `var/`，并可通过 `APP_DATA_DIR` 放到仓库外。
- 备份默认存放在 Git 忽略的 `backups/`，以后提供显式导入/导出和恢复机制。
- 美术风格固定为“星际探索舱”：深空玻璃面板、紫/青/粉光效、大字号圆润组件和克制动效。
- 正式技术栈仍需要由项目所有者选择，再开始业务开发。

## 下一步

1. 在 `docs/TECH_STACK_OPTIONS.md` 中选择 A、B 或 C 技术方案。
2. 初始化正式 Node.js 应用，并将 `docs/DESIGN_SYSTEM.md` 落地为可复用组件系统。
