# 通用游戏手柄与控制设置

## 接入依据

调研日期：2026-09-07。浏览器提供 `gamepadconnected`、`gamepaddisconnected` 两种连接事件；没有逐键的原生 `keydown` / `keyup` 事件。通过 `navigator.getGamepads()` 配合 `requestAnimationFrame` 读取按钮与摇杆，再比较前后状态产生游戏动作。返回数组可能含 `null`，不能用过滤后的数组下标代表玩家。[MDN 接入说明](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API)

按钮包含 `pressed`、`value`（0—1）和部分设备的 `touched`；摇杆轴值为 −1—1。只有 `mapping === "standard"` 才能按统一物理位置解释：按钮 0/1/2/3 是右侧四键的下/右/左/上，12/13/14/15 是十字键上/下/左/右，轴 0/1 是左摇杆横/纵轴。未知布局必须手动学习键位。[W3C 标准映射](https://www.w3.org/TR/gamepad/#remapping)

设备可能要在当前页面按一下才会出现；API 受安全上下文和浏览器权限策略影响。设备 `index` 可在断开后被复用，`id` 标识型号而非唯一实体。模块不把 index 存成永久硬件标识。[MDN 使用说明](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API)、[W3C 设备接口](https://www.w3.org/TR/gamepad/#gamepad-interface)

## 操作流程

1. 在电脑系统中通过 USB 或蓝牙连接手柄，回到游戏页面按一下手柄。
2. 选择单人或双人，分别为每位玩家选择键盘/手柄；允许键盘加手柄、两只手柄、两组键盘。
3. 展开“手柄与键位”，为手柄玩家选择设备。实时测试区显示正在按的按钮/摇杆方向。同一设备不会同时分配给两个玩家。
4. 每个动作显示含义与绑定。点击“换键”，先松开全部按键，等待就绪，再按目标按钮或推动摇杆。换键会替换这个动作的全部旧绑定；重复键位被拒绝并指明冲突动作，可先清除再绑定。Escape 或取消按钮退出换键。
5. 状态显示“已保存在本机”后，下次打开自动恢复。读取失败可先用当前默认键盘，修改仅在本次会话有效；保存失败保留当前选择并提供重试。

默认键名同时标注物理位置和常见 Xbox/PlayStation 图标；Nintendo 等设备字母可能不同，以位置与实时测试为准。未知布局只显示编号；选择未知型号会清空默认绑定，逐一换键后使用，不猜测 A/B/X/Y 的位置。

## 模块边界与复用

- `apps/server/src/game-controller-preferences.ts`：无 Node 依赖的纯数据契约，前后端使用同一解析器。
- `apps/web/src/shared/controllers/registry.ts`：注册每个游戏的动作名称、说明、默认绑定、可选长按间隔和互斥动作；保存与恢复映射、生成键名。不依赖俄罗斯方块。
- `input.ts`：独立于 React、浏览器事件和游戏引擎，处理设备归属、采样差分、松键门槛、换键监听。
- `preferences.ts`：通用本机设置读取/写入状态，复用 `shared/persistent-data.ts` 的串行写入队列。
- `useGameControllers.ts`：一个挂载的游戏使用一个会话；安装/清理连接事件与轮询，提供设备列表、测试状态、换键和业务动作回调。
- `ControllerSetup.tsx`：人数、各玩家模式、设备分配、动作含义、换键、冲突、连接/保存状态的统一界面。游戏中打开该面板前必须先暂停，`editing` 为 true 时屏蔽游戏手柄输入。

新游戏只注册自己的动作，例如：

```ts
const CAR_CONTROLS = registerGameControls({
  id: "car", label: "汽车游戏", maxPlayers: 2,
  actions: [
    { id: "accelerate", label: "加速", description: "按住加速",
      defaults: [{ kind: "button", index: 7 }] },
    { id: "item", label: "使用道具", description: "按一次使用一个道具",
      defaults: [{ kind: "button", index: 0 }] },
  ],
});
```

将定义传入 `useGameControllers(definition, { enabled, editing, onActions, onDisconnect })`，把返回会话传入 `ControllerSetup`。动作事件为 `{ player, action, type, value }`，type 包括 `press`、`release`、`repeat`、`value`。汽车按 press 启用加速、release 归零，可用 value 更新模拟强度；道具只响应 press。游戏必须在暂停/失焦/断线时清除自己的持续动作状态；会话 `reset()` 同时发出已有动作的 release。

动作 ID 和游戏 ID 必须稳定。新增动作通过 `resolveGameControls` 补充默认值，但不覆盖已有自定义或有意清空的键；与已有自定义键冲突的新动作保持空绑定。移除动作不会继续触发旧规则。注册阶段校验动作唯一性、默认绑定冲突与连发参数。

## 输入规则

- 每个玩家分别派发事件。横移和下移可以与旋转同时发生；同一动作同时按十字键和摇杆只派发一次。互斥方向同时激活时停住，避免抖动。
- 按钮/轴方向达到 0.55 才按下，低于 0.35 才松开；模拟强度变化达到 0.03 时发 value。只对声明 repeat 的动作连发；每帧最多一次，不在卡顿后补发一串操作。
- 开局、恢复、换配置、重新连接、页面回到前台后，先等该玩家已绑定的输入全部松开，再接受新按下；避免插入手柄或关面板时意外直落。
- 换键等待 250ms 稳定松开，标准摇杆必须回中；未知布局保存当时的静止轴基线，支持静止在 −1 的非标准扳机轴。监听期间所有手柄输入只用于换键。
- 后台、失焦、原生模态对话框打开时屏蔽动作并清除按住状态；监听与轮询在离页时清理。读取手柄失败只降级输入，不阻断键盘。
- 连接事件与每帧采样共同检测断线。俄罗斯方块断线暂停并显示文字，重连不自动恢复。键盘可继续接替。
- 本会话保留断开设备的席位，同型号第二只不会因第一只断开而转给玩家 1。跨页面按 `id + mapping + 同型号序号` 恢复偏好；完全相同型号没有稳定实体 ID，重接顺序改变时必须核对下拉框与实时测试，不能承诺识别两个相同型号的物理个体。更换不同型号需重新选择，原配置不会被自动套用到未知布局。
- 不使用 touched 作为游戏按下，不依赖震动、触摸板或厂商扩展功能；这些能力不影响基础手柄与键盘模式。

## 保存格式与迁移

接口为 `GET/PUT /api/persistent-data/game-controller-preferences`，私有文件为 `APP_DATA_DIR/preferences/game-controllers.json`，默认 `../data/preferences/game-controllers.json`。外壳沿用通用持久化规范：`schemaVersion: 1`、稳定 UUID、stableId、createdAt、updatedAt；payload 为 `{ schemaVersion: 1, games: { [gameId]: { playerCount, players } } }`。

每位玩家包含 mode、device、bindings。device 只记录浏览器提供的型号名、标准映射类型和同型号序号，不记录设备序列号、蓝牙地址、输入轨迹或个人信息。最多 64 个游戏，每游戏 4 个玩家、32 个动作，每动作最多 2 个按钮/轴方向绑定。产品默认配置位于各游戏注册文件；个人覆盖只写仓库外的本机数据，不用 localStorage 另存副本。

PUT 只发送本次修改的游戏条目，服务端在文件队列内与其他游戏配置合并；同一游戏以最后一次保存为准，不同游戏的多个页面不会互相覆盖。返回的是合并后的完整记录。

服务端校验所有字段、版本、范围、重复设备和绑定，按已有队列原子替换并限制文件权限 0600。缺失文件初始化为空，新模块不存在旧存档迁移；注册动作增删进行非破坏性补齐。未知版本或损坏文件拒绝读写，保留原文件，不能用默认值覆盖；恢复需从可验证备份恢复旧文件。未来统一备份应包含此偏好文件，当前没有增加新的导出格式或自动备份。

## 验证与实机边界

自动测试覆盖零设备、null 空位、双人同帧输入、独立连发、按钮与轴防抖、松键门槛、热插拔索引复用、非标准轴学习、重复绑定、多个游戏注册、动作增量迁移、零速 Tetris 与键盘并用、双菜单键一次暂停，以及配置刷新恢复、非法/未来版本、写入失败重试、原文件保留和服务器重开。

实体 USB/蓝牙手柄与浏览器/驱动组合仍需实机核对：分别试两人的方向与旋转同时按、长按直落只执行一次、两只同型号手柄拔插、换键后刷新与页面失焦。浏览器可能拦截主页键等系统保留键，建议使用动作键、肩键或摇杆方向绑定。
