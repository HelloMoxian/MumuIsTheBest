# 岩石与矿物图片生成说明

## 资产结构

- 原始图集：`apps/web/public/images/nature/rock-minerals/atlases/rock-mineral-atlas-01.png` 至 `15.png`
- 图集清单：与每张图集同名的 `.manifest.json`
- 运行时单图：`apps/web/public/images/nature/rock-minerals/samples/<stable-id>.png`
- 图片和资料的绑定关系：`rock-mineral-catalog.v1.json` 中的 `image` 字段

原始图集采用严格的 3 × 3 行优先格位。前 14 张各含 9 个图鉴样本；第 15 张前两格是铝土矿和褐铁矿，余下七格依次为四种土层、晶洞、地质锤和碎石支持图。

## 生成规格

本批资产使用内置高质量图片生成能力，按 `scientific-educational` 用例生成。统一生产提示要求：

> 生成严格 3 × 3 的等大方格接触表，按从左到右、从上到下排列。每格只出现一个完整居中的天然粗矿物、矿石或岩石手标本，使用相同的炭灰色无缝影棚背景和窄暗色格缝。采用高度写实的博物馆微距标本摄影，准确表现自然颜色、光泽、晶形、基质、颗粒和断口；柔和棚拍光、清晰焦点、落地阴影和高精度材质细节。禁止文字、编号、水印、人物、手、展台、卡通、幻想发光、首饰和切割宝石。

宝石类额外限定为天然粗晶或原石；岩石类额外限定为有代表性的未抛光手标本。各格具体对象和稳定顺序以图集清单及目录配置为准。

## 重新切图

切图使用工程内 `chroma-atlas-extractor`，保留影棚背景和完整格位，不做透明抠图或逐图裁边：

```bash
python3 .agents/skills/chroma-atlas-extractor/scripts/extract_chroma_atlas.py \
  --input apps/web/public/images/nature/rock-minerals/atlases/rock-mineral-atlas-01.png \
  --output-dir apps/web/public/images/nature/rock-minerals/samples \
  --columns 3 --rows 3 \
  --ids native-gold,native-silver,native-copper,native-platinum,native-sulfur,graphite,diamond,pyrite,chalcopyrite \
  --keep-background --inset 4 \
  --manifest apps/web/public/images/nature/rock-minerals/atlases/rock-mineral-atlas-01.manifest.json \
  --fail-on-warning
```

替换图集后必须重新切出对应九格，并运行 `pnpm content:nature:validate`。不要覆盖唯一图集后再检查；先保留新旧源文件，确认格位和视觉后再更新正式资产。
