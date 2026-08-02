---
name: mui-spacing-tokens-8x
module: consumer
description: tokens.spacing[n] 是像素数值，但 MUI sx 的 spacing 属性会 ×8，必须改用 sp[] 字符串映射
---

# 间距全部放大 8 倍

**症状**

购物车每一项高约 500px，页面间距大得离谱。写的是 `p: tokens.spacing[4]`（本意 16px），
实际渲染成 **128px**。裸数字如 `pb: 96` 渲染成 **768px**。

**关键陷阱**

`tokens.spacing[4] === 16` 这个值本身**是对的**，所以查 `tokens.ts` 看不出问题。
问题出在 MUI 那一侧的隐式换算，而且只影响 **spacing 类属性**——同样的数字给 `width` / `height` 就是对的。
这种「一半属性正常一半异常」的表现最容易让人往 CSS 优先级、flex 布局方向查。

**根因**

- `frontend/apps/consumer/src/styles/tokens.ts` 的 `tokens.spacing[n]` 返回**裸像素数值**
- 但 consumer **没有 MUI `ThemeProvider`** → 用默认主题，其 spacing factor = **8**
- MUI `sx` 中的 spacing 属性（`p` / `m` / `gap` / `py` / `px` / `mb` / …）
  **对数字值会乘以 8**

→ `p: 16` 实际是 `16 × 8 = 128px`。

**修复**

`tokens.ts` 中已新增 **px 字符串映射 `sp`**。MUI `sx` 的 spacing 属性一律用它：

```tsx
sx={{ p: sp[4], gap: sp[2] }}   // → 字面量 "16px" / "8px"
```

MUI 对**字符串**按原始 CSS 处理，不会 ×8。

**边界**

`tokens.spacing[n]`（裸数字）仍然保留，只用于：

- 非 spacing 的 CSS 属性：`width` / `height` / `top` 等（数字→px 本来就对）
- 拼接模板字符串：`` `${n}px` ``

**待办**

同样的 8× bug **仍存在于**：

- `src/routes/profile/index.tsx`
- `src/routes/product/$spuCode.tsx`

（尚未修复）
