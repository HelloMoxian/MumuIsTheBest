# 星际极速赛图像资产

这套资产用于 `/games/galaxy-racer` 的三主题正式玩法。整体遵循“星际探索舱”设计系统，采用圆润、高饱和、明亮的 3D 卡通造型。

## 目录

- `concepts/opening.v1.png`、`collision.v1.png`、`finish.v1.png`、`results.v1.png`：用户认可的开场、碰撞、终点和结算风格参考。
- `concepts/gameplay-high-angle.v1.png`：修订后的较高机位、斜后方俯视进行中概念图。旧版低机位进行中图不进入正式资产。
- `concepts/` 下图片只用于构图与美术参考，不直接作为运行时背景或 HUD。
- `backgrounds/space-city-horizon.v1.png`：无道路、无车辆、无 HUD 的远景城市层。正式使用前应通过平移拼接检查；道路循环不依赖这张图完成。
- `source/*.png`：三张规则绿幕源图集。它们是唯一可回溯的切分源，不得覆盖。
- `sprites/vehicles/`：4 × 2 车辆图集切出的 8 个透明精灵。
- `sprites/vfx/`：4 × 3 特效图集切出的 12 个透明精灵。
- `sprites/props/`：4 × 3 赛道道具图集切出的 12 个透明精灵。
- 每个 `sprites/*/manifest.json` 记录稳定 ID、原始格位、尺寸、透明覆盖率和角透明度；产品代码应读取或复用稳定 ID，不按目录枚举猜顺序。
- `themes/crystal/`：第 2/5 关的晶体彗星峡谷，含独立源图、远景、8 辆车、12 个动效和 12 个场景件。
- `themes/solar/`：第 3/6 关的太阳环花园，含独立源图、远景、8 辆车、12 个动效和 12 个场景件。
- 第 1/4 关继续使用根目录霓虹星际城资产；三套主题固定按 1/2/3/1/2/3 循环，不在关内混用。

## 生成说明

资产通过 Codex 内置图像生成工具生成，上一轮认可的赛车概念图仅作为风格参考。统一生成约束如下：

- 高饱和、明亮、炫酷但不刺眼，适合约 6 岁儿童；
- 青色与黄色玩家火箭车、紫色与珊瑚色障碍车、蓝紫太空城市；
- 所有车辆采用同一较高机位的斜后方三分之四视角；
- 玩家车不包含人物，驾驶舱保留独立头像合成位置；
- 图集中每个图元独占规则格位，无文字、无标志、无跨格阴影；
- 碰撞特效不含火焰、损坏或惊吓元素。

内置生成器没有直接产出真实透明通道，而是绘制了假棋盘格。因此保留图元不变，将背景修正为绿色源图，再使用工程内 `chroma-atlas-extractor` 按规则网格切分。当前切分参数为自动边角取色、透明阈值 28、完全不透明阈值 145、格位内缩 2px，并保留完整格位画布。六组新增图集的 manifest 均无警告，所有输出角点均为透明。

## 稳定 ID

车辆：

```text
player-neutral
player-left
player-right
player-collision
obstacle-coral
obstacle-purple-pod
obstacle-yellow-buggy
obstacle-teal-bus
```

晶体与太阳主题保持相同的四个玩家 ID；障碍使用主题无关 ID：

```text
obstacle-compact
obstacle-pod
obstacle-buggy
obstacle-bus
```

特效：

```text
speed-streak
turbo-glow
collision-burst
wobble-stars
lane-trail-left
lane-trail-right
hover-dust
slowdown-ripple
finish-sparkle
confetti
checkpoint-halo
vehicle-shadow
```

道具：

```text
guardrail
arrow-sign
checkpoint-arch
finish-arch
robot-spectator
roadside-lamp
checkpoint-beacon
boost-pad
safety-bollard
ringed-planet
city-cluster
finish-flag
```

## 使用边界

- 车道、速度、赛程、按钮、摄像头状态与结算文字由 HTML/CSS 或 Canvas 实时绘制，不能烧进图片。
- 摄像头头像在运行时从隐藏视频帧裁切；示例孩子不属于正式资产。
- 玩家四帧保留同一格位画布和基线，不能逐帧裁边；驾驶舱头像锚点需要在正式实现时写入资产目录，不得从透明边界临时推算。
- 远景只做低速视差；路面、车道线和终点距离由程序化透视道路负责。完整方案见 `docs/GALAXY_RACER.md`。
