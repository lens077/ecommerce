---
name: 2026-11-13-headersearch-popover-api
layer: decisions
status: proposed
description: 顶栏搜索下拉暂缓换 Popover API——等 CSS Anchor Positioning 全绿后一步到位，期间保留现状路径
---
# 决策：HeaderSearch 换 Popover API——暂缓

## 问题

consumer-next 顶栏搜索下拉（`frontend/apps/consumer-next/src/home/HeaderSearch.tsx`）用约 8 行 `pointerdown` 监听做外点关闭 + `position: absolute` 相对 `.header-search` 定位。modern-web-guidance 的 declarative-dialog-popover-control 指南把 Popover API（+ Invoker Commands）列为推荐路径：浏览器自带 light-dismiss、Esc 关闭、top-layer 层级。2026-11-13 评估是否改造。

## 提案

- 结果容器改 `<ul popover="auto">`，`showPopover()` 进入 top layer；light-dismiss 免费（点外/Esc 关闭）。
- 定位改 **CSS Anchor Positioning**（`position-anchor` + `anchor(bottom/left/right)`）——popover 进 top layer 后包含块变成 viewport，现状的 absolute 定位失效，不用 anchor 就是坏的。
- `@supports (anchor-name: --a)` 守卫：不支持的浏览器保留现状路径（pointerdown 监听 + absolute），两套并存。
- input `onFocus` 重新 `showPopover()`，对冲 light-dismiss 在点击输入框时的意外关闭。

## 考虑过的替代方案

- **现状保留（本轮已采纳的基线）**——8 行监听简单可靠；anchor 不全绿前改造意味着回退路径删不掉，代码不减反增，负收益。
- **`popover="manual"` 折中**——自己管理关闭，pointerdown 监听删不掉，只剩 top-layer 与 Esc 两个收益，比 `auto` 版收益更缩水，不值得一并比较的复杂度。

## 验收标准

- anchor positioning Baseline（Firefox ship）达成后改造，届时旧路径（监听 + absolute）整体删除，而不是继续并存。
- 点击输入框修改关键词时下拉不消失；Esc 关闭；键盘可达性不回退。
- `verify:browser`（Playwright Chromium）通过。

## 风险

- light-dismiss 关闭与 input click 重拉起之间有时序窗口，补丁不当会在输入中途闪掉下拉——比现状倒退。
- top-layer 元素永远盖在 sticky header（z-20）之上，遮挡关系变化方向通常是改善，但需回归确认。

## 附属的轻路径（已可独立先行）

不动架构，先补两个 a11y 缺口：`onKeyDown` Escape 关闭（一行）；下拉用 `@starting-style` + `transition-behavior: allow-discrete` 做入场动画。

> 2026-11-14 轻路径已落地（`feat/modern-web-consumer-r2`），两处与上面描述有偏差，原因如下：
> ① Esc 关闭不是一行——关闭必须连带 abort 在途请求，否则迟到的响应 `setState` 会把刚关掉的下拉
> 重新拉起（点外关闭原有此问题，一并修了），且 Esc 带了 IME 组合态守卫（与 AppBar 的 isComposing
> 守卫同理）；② 入场动画没用 `allow-discrete`——下拉是条件渲染的卸载/挂载，不是 display 切换，
> 过渡离散属性无意义，实际写法是 `@starting-style` 淡入 + 4px 下落，reduced-motion 下只禁位移保留淡入。
> 主提案（Popover + Anchor Positioning）继续暂缓，重估条件不变。
