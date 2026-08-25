# 自然内容

## 岩石与矿物

`rock-mineral-catalog.v1.json` 是“岩石与矿物”玩法的唯一内容事实来源。当前包含 128 个可发现样本：

- 88 个矿物或儿童图鉴采用的常用矿物组；
- 16 个宝石/矿物变种与天然集合体；
- 22 种岩石；
- 2 种矿石集合体。

每条记录必须保留稳定 `id`。运行时个人数据只保存这些 ID，不复制名称、硬度或其他内容事实。改名时保留 ID；确需替换 ID 时必须同步编写进度迁移。

图片位于：

`apps/web/public/images/nature/rock-minerals/samples/<id>.png`

原始 3 × 3 图集位于：

`apps/web/public/images/nature/rock-minerals/atlases/`

图集与切图清单都要保留，便于后续重新切分、检查顺序和替换单张图片。图片是写实识别辅助，不替代文字事实；生成图片不应包含名称、标签、水印、卡通五官或不属于标本的装饰物。

生成规格、批次结构和重新切图命令见 `ROCK_MINERAL_IMAGE_GENERATION.md`。

修改配置后运行：

`pnpm content:nature:validate`

校验会检查版本、数量、稳定 ID、完整属性、稀有度/价值/硬度边界、玩法概率和图片绑定。
