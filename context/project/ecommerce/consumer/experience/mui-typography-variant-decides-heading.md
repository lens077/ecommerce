---
name: mui-typography-variant-decides-heading
module: consumer
description: Typography 不写 component 时语义由 variant 决定（h1-h6 映射同名标签、subtitle1/2 映射 h6），按字号挑 variant 等于瞎定文档大纲，且 axe 查不出来
---

# 按字号挑 `variant`，把文档大纲写坏了

**症状**

读屏按标题导航时，购物车页跳不到页面标题——整页**一个 `<h1>` 都没有**，第一个标题是渲染成
`<h6>` 的「购物车」。商品详情页更怪：`<h1>` 商品名之后紧跟一个 `<h3>`，内容却是价格
`CN¥199.00`。页脚的品牌字样和三个链接栏标题在**每一页**都注入 4 个 `<h6>`。

而 `pages.a11y.test.tsx` 的 axe 断言**全绿**，Lighthouse a11y 也是 100 分。

**关键陷阱**

三层，每层都会让人停止排查：

1. **「没写 `component` = 没有语义」是错的**。直觉上 `Typography` 应该默认渲染 `<p>`，
   实际 `@mui/material` 的 `defaultVariantMapping` 是：`h1`–`h6` → **同名标题标签**，
   `subtitle1`/`subtitle2` → **`h6`**，只有 `body1`/`body2`/`inherit` → `<p>`。
   所以 `variant` 是**视觉与语义的双重开关**——挑字号的人在无意中定了文档大纲。
   本项目没有自定义 `variantMapping`（已全仓确认），走的就是这套默认。

2. **axe 挡不住**。`heading-order` 只查**相邻**标题不跳级；「整页没有 `h1`」归
   `page-has-heading-one`，属 **best-practice 标签**，不在 `pages.a11y.test.tsx` 的
   WCAG A/AA `runOnly` 范围内。于是「无 h1」「噪音 h6」两类缺陷在门禁下全绿。
   `subtitle1/2 → h6` 这条尤其隐蔽：grep `variant="h` 根本搜不到它们。

3. **红测可能假绿**。给标题层级补断言后回退修复，测试**没有变红**——因为商品价格区要
   选中规格后才渲染（`selectedAttrs` 初始为空），而服务桩的 SKU 没有 `attributes` 字段，
   价格分支永远走不到。断言测的是一条根本没渲染的分支。

**根因**

`variant` 同时承担视觉与语义，但选它的场景（调字号）只关心视觉。缺口因此**双向**：
该是标题的没进大纲（页面标题用 `h5`/`h6` → 无 `h1`），不该是标题的混进大纲
（价格 `h3`、品牌字样 `h6`）。

**正确做法**

`variant` 管视觉、`component` 管语义，**分开决定**，选 `component` 时只看文档大纲不看字号：

```tsx
<Typography variant="h6" component="h1">{t("cart.title")}</Typography>  // 视觉小、结构是页面标题
<Typography variant="h3" component="p">{formatCurrency(price)}</Typography>  // 视觉大、但它是数值不是标题
```

- 页面标题 → `component="h1"`（每页唯一）
- 区块标题 → `component="h2"`
- **非标题内容显式降级**：价格、金额、品牌字样、列表项名称一律 `component="p"`（或 `span`）

**验证**

axe 不够，要直接断言大纲。`pages.a11y.test.tsx` 已加「恰好一个 `h1` + 层级不跳级」，
覆盖关键四页 + 一条 canary。**断言写完必须把修复回退一次确认它真的变红**——
本轮正是靠这一步才发现价格分支没渲染（补桩 `attributes` + 点一次规格 Chip，
注意 MUI `Chip` 渲染成 `div` 不是 `button`，`getByRole("button")` 找不到）。

背景与全量前后对比见 [`docs/frontend/semantic-html.md`](../../../../../docs/frontend/semantic-html.md) §四.1。
