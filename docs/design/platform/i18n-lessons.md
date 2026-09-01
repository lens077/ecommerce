# i18n 经验借鉴：Fluent/ICU4X 的设计原则如何落到本项目

> **调研文档（2026-08-31 新增），不是现状描述，也不是已批准的方案。**
> 来源：Zibi Braniecki（Fluent 作者、ICU4X 维护者、ECMA-402 前推动者）在
> [zed-industries/zed#7409](https://github.com/zed-industries/zed/issues/7409) 的评论。
> 本文把他面向 GUI 工具链的建议，对照本项目**已核实的现状**，筛出哪些适用、哪些不适用。
>
> 现状真相源：`frontend/packages/i18n`（代码）与
> [`i18n-routing.md`](i18n-routing.md)（URL 决策）。本文不覆盖 URL 路由，只谈文案与格式化。

## 一、先说结论：大部分建议我们已经做对了

核查 `frontend/packages/i18n` 后的事实：

| Zibi 的核心主张 | 本项目现状 | 判断 |
|---|---|---|
| 用**语义 ID** 做 key，不要用英文原文 | `action.confirm`、`orderStatus.paid` | ✅ 已满足 |
| 格式化交给 `Intl`/ICU，不要手写 | `format.ts` 全走 `Intl`，且缓存实例 | ✅ 已满足 |
| 不要用 `chrono` 这类不可本地化的日期方案 | 前端用 `Intl.DateTimeFormat`，未引第三方日期库 | ✅ 已满足 |
| 译文与源语言解耦，上游改文案不应使翻译失效 | key 稳定，改中文不影响 en 的 key | ✅ 已满足 |

**这一点值得明确记录**：Zibi 批评 gettext 的头号问题是「拿英文原文当 key」——
英文改一个标点，所有语言翻译全部失效。我们从一开始用的就是语义 ID，
天然规避了这个坑。`zed-loc`（Zed 汉化）恰好是反面教材：它靠「英文原文 → 中文」
映射改源码，一次上游更新就丢了 523 条翻译。**我们不在那条路上。**

所以本文的价值不在「推倒重来」，而在下面三个**已核实存在的缺口**。

## 二、缺口一：没有复数机制（唯一真正的技术债）

### 事实

`grep plural|_other|count:` 在 `packages/i18n` 无任何命中。当前所有文案都是定长字符串。

### 为什么这在电商项目里是真问题

电商界面天然充满计数文案：购物车件数、订单数、评价数、库存数、搜索结果数。
中文没有复数变化，所以**用中文开发时完全感觉不到问题**——`共 {{count}} 件商品`
在中文里永远成立。

但英文不成立：

```
1 items in cart     ← 错，应为 "1 item"
2 item in cart      ← 错，应为 "2 items"
```

Zibi 的原话是：复数规则**不应由开发者提前决定**，因为英语开发者无法预判其他语言的需求
（阿拉伯语有 6 种复数形式，中文 0 种）。这正是他主张「隔离关注点」的场景。

### 落地方式（不需要换框架）

`react-i18next` 原生支持 ICU 复数规则，**无需引入 Fluent**。
本项目 `i18next@^26`（`pnpm-workspace.yaml` catalog），使用 v21+ 的 `_one/_other` 后缀语法
（v20 及更早的 `_plural` 写法已废弃，不要用）：

```json
// en/common.json
{
  "cart": {
    "itemCount_one": "{{count}} item in cart",
    "itemCount_other": "{{count}} items in cart"
  }
}
```

```json
// zh-CN/common.json —— 中文只需 _other
{
  "cart": {
    "itemCount_other": "购物车共 {{count}} 件商品"
  }
}
```

调用侧不变：`t("cart.itemCount", { count: n })`。

关键点：**中文侧不需要写 `_one`**，i18next 会按各语言的 CLDR 复数规则自动选择。
这正是 Zibi 说的「让译者按自己语言的需要决定，不把英语的约束泄漏给其他语言」。

实测各语言的 CLDR 复数类别（`Intl.PluralRules`，node 实跑）：

| locale | 复数类别 | 需要写几个 key |
|---|---|---|
| `zh-CN` | `other` | 1 |
| `en` | `one`, `other` | 2 |
| `ru` | `one`, `few`, `many` | 3 |
| `ar` | `zero`, `one`, `two`, `few`, `many`, `other` | 6 |

这张表就是「为什么复数不能由开发者提前决定」的证据：
按中文开发只会写 1 个 key，按英文开发只会写 2 个——都不足以支撑俄语/阿拉伯语。
用 `_one/_other` 后缀 + `count` 参数把选择权交给运行时，才是可扩展的写法。

### 建议动作

新增计数类文案时一律用 `_one/_other` 形态，不要写 `共 {{count}} 件`。
存量文案按需迁移，不必一次性改完。

## 三、缺口二：后端错误消息是中文硬编码

### 事实

- `backend/` 中 **无任何** `Accept-Language` 处理（grep 零命中）
- 后端错误形如 `errors.New("entry is empty")`、`fmt.Errorf("超时（%s）", limit)`——中英混杂
- `proto` 层无 locale 协商约定

### 但现有设计其实已经绕开了大半

我们的架构是：**后端返回机器可读的 `reason` 码，前端映射为本地化文案**。
`errors.json` 里 31 条 `reason`/`code` 就是这套：

```json
"JWT_AUTHN_REQUIRED": "未登录或登录已失效，请重新登录"
```

这个设计**符合 Zibi 的原则**——`JWT_AUTHN_REQUIRED` 就是语义 ID，
后端不产出面向用户的自然语言，翻译权完全在前端。
`frontend-api/INDEX.md` 里那条「错误一律过 `toAppError`，不要写 `err.message` 兜底
—— 会漏出浏览器原生英文并绕开 i18n」正是在守这条线。

### 真正的风险点

风险不在架构，在**执行一致性**：只要有一处后端把中文 message 直接透给用户，
英文界面就会漏中文。当前 `docs/design/platform/i18n-routing.md` §4.6 已记录
「中文优先用服务端更具体的 message」——这条策略在英文界面下是漏洞。

### 建议动作

1. **短期**：把「后端 message 不得直接渲染」提升为可测约束——
   加一条 lint 或测试，禁止在渲染路径出现 `error.message` 直出。
2. **中期**：为需要具体信息的错误定义**带参数的 reason**
   （如 `STOCK_INSUFFICIENT` + `{available: 3}`），前端用 `t()` 拼装，
   而不是让后端拼好中文句子。
3. **明确不做**：后端接 `Accept-Language` 做全量文案本地化。
   代价高、收益低，且会把翻译资产分散到两个仓库。

## 四、缺口三：业务数据（商品名/描述）是单语的

### 事实

`backend/api/product/v1/product.proto` 中商品 `name`/`description` 是单个 `string`，
无多语言字段。全库唯一的例外是 `address/v1/region.proto` 的 `name_en`（行政区名）。

### 这是产品决策，不是技术债

`PRODUCT.md` 已明确写：

> 中文市场，界面语言 zh-CN
> 未定（显式延后）：多语言/国际化范围

所以**当前不做是对的**。但需要记录一个区分，避免将来误判：

| 类型 | 例子 | 谁负责翻译 | 当前状态 |
|---|---|---|---|
| **界面文案** | 「加入购物车」 | 开发/译者，编译期确定 | ✅ 已有 i18n |
| **业务数据** | 商品标题、店铺简介 | **商家**，运行时录入 | ❌ 单语 |

Zibi 的建议**只覆盖第一类**。第二类是数据库 schema 问题，
Fluent/ICU4X 帮不上忙——它需要的是 `product_translations` 表或 JSONB 多语言列，
以及商家后台的翻译录入界面。

值得注意：`docs/design/merchant/store-settings.md` 里已经调研过竞品的
「多语言&多货币插件」「UGC 多语言可视化翻译」——说明这个需求已进入视野，
只是尚未排期。**真要做时，它的工作量远大于界面 i18n**，不要把两者混为一谈。

## 五、明确不建议引入的东西

Zibi 推荐的技术栈里，有几项**不适用于本项目**，记录理由避免将来重复讨论：

| 他的推荐 | 适用于 | 我们为什么不用 |
|---|---|---|
| `fluent-rs` | Rust 原生 GUI | 我们前端是 React；`react-i18next` 已覆盖需求，换框架收益为负 |
| ICU4X | Rust 项目 | 浏览器内置 `Intl` 就是 ICU，已在 `format.ts` 用上，无需再引库 |
| `temporal_rs` / `jiff` | Rust 日期处理 | 前端用 `Intl.DateTimeFormat`；后端 Go 侧日期不面向用户展示 |
| DOM L10n | 浏览器引擎级集成 | 属于 Firefox/W3C 层面的提案，应用层用不上 |

**唯一值得关注的未来项**：MessageFormat 2.0。它会进入 `Intl.MessageFormat` 标准，
届时浏览器原生支持复数、性别、嵌套选择。但它尚未定稿，
**现在不应押注**——按第二节用 i18next 的复数即可，将来迁移成本可控。

## 六、优先级建议

按「风险 × 成本」排序：

1. **补复数机制**（低成本、真缺口）——新增计数文案时立即采用，存量按需迁移
2. **把「后端 message 不直出」变成可测约束**（低成本、防回归）
3. **清理 7 处硬编码中文**（极低成本）——多数在 `console.log`，非渲染路径，但顺手清掉
4. **业务数据多语言**（高成本）——等产品明确国际化范围后再启动，不要提前设计

## 七、与既有文档的关系

- 本文谈**文案与格式化**；URL 与语言路由见 [`i18n-routing.md`](i18n-routing.md)，两者不重叠
- 现状实现以 `frontend/packages/i18n` 代码为准
- 落地进度以 `TODO.md` 为准；本文任何一节都不代表「已实现」
