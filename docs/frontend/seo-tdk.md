# 灯市全站 TDK 优化总结

本文记录灯市 TDK（Title、Description、Keywords）的取词原则、实现方式、验证结论和 SSR 对齐边界，供维护公开页面和排查搜索摘要问题时使用。实现基线是提交 `37a94264`；文案以源码为准，任务状态只维护在 [TODO.md](../../TODO.md)。

**已确认方向：公开页面以 consumer-next 的服务端渲染为主，可配合 SSG/ISR 缓存；交易页和商家、管理后台保留 SPA。** 中文商品规范 URL 按 [i18n-routing.md §4.1、§4.4](../design/platform/i18n-routing.md) 使用裸路径，但这项迁移尚未由本次 TDK 改动完成。

本次交付不是排名效果报告：没有搜索量、关键词难度、收录率或点击率数据；本地构建和 mock 网关验证不能证明线上已部署、被收录或排名提升。

## 一、范围与改动结果

### 1.1 页面边界

下表的「允许索引」只描述代码输出的策略，不表示搜索引擎已收录。

| 页面 | 实现基线 | 索引策略 |
|---|---|---|
| 中文首页 `/`、英文首页 `/en` | consumer-next 构建期预渲染；中文首页内部改写到 `/zh` | 允许索引，输出各自的 TDK、canonical 和语言对应关系 |
| 商品页 `/zh/product/{spuCode}`、`/en/product/{spuCode}` | consumer-next 按需 ISR，`revalidate=60` | 成功时允许索引；异常按第四节处理 |
| consumer SPA | 共用静态 HTML 壳，包含交易页、旧商品页和分类占位页 | 壳中写入 `noindex`，移除无意义的 `ecommerce` keywords |
| merchant、admin | 登录后的操作界面 | 壳中写入 `noindex, nofollow` |

`noindex` 是搜索引擎指令，不是鉴权或访问控制。后台仍须由真实认证、授权和网络边界保护。

### 1.2 优化前后

| 项目 | 优化前 | 优化后 |
|---|---|---|
| 首页标题 | 只有品牌名「灯市」 | 品牌名加综合商城与类目方向 |
| 首页描述 | 品牌比喻和「数码、服饰、食百」概述 | 描述类目结构与站内搜索，不宣称演示商品是真实在售库存 |
| 首页关键词 | SSR 首页未提供 | 中英文分别配置品牌词、行业词、类目词 |
| 商品页标题 | 商品编码与语言标记，如 `SPU-1 (zh)`，再套站点后缀 | 从商品名生成；有价格时补「价格与规格」，再套本地化品牌后缀 |
| 商品页描述 | 继承首页描述 | 使用同一次商品查询中的规格和价格；错误页有独立描述 |
| 英文商品页后缀 | 固定使用中文「灯市」 | 使用 `Lantern Market` |
| 查询次数 | 页面自身发起商品查询 | 增加 metadata 查询后仍与页面共用一次 RPC，不增加重复取数 |

## 二、行业关键词与文案

### 2.1 取词依据

- **品牌词**：中文「灯市」、英文 `Lantern Market`。
- **行业词**：综合网上购物商城、网上购物商城、综合商城、网购；英文采用 `online shopping`、`online mall`。
- **类目词**：数码、家电、服饰、美妆、食品、家居、运动、图书，来自首页现有类目结构。类目出现在导航里，不等于该类目已有完整真实货架。
- **商品长尾词**：商品名及「商品名 + 价格」。这是按页面内容和购买查询意图选择的方向，不是依据搜索量报告选出的高流量词。

取词不引入无法证明的品牌、销量、评分、正品保证、低价、包邮或履约时效。首页仍有演示商品，因此最终描述使用「设有……类目」，而不是「汇集……好物」。

### 2.2 首页最终文案

来源：[首页文案 `copy.ts`](../../frontend/apps/consumer-next/src/home/copy.ts)。

**中文**

- **T**：灯市 - 综合网上购物商城：数码家电、服饰美妆、食品家居
- **D**：灯市是综合网上购物商城，设有数码、家电、服饰、美妆、食品、家居、运动、图书等类目，支持站内商品搜索。
- **K**：灯市、网上购物商城、综合商城、网购、数码家电、服饰美妆、食品、家居、运动、图书

**英文**

- **T**：Lantern Market - Online Mall for Electronics, Fashion & Home
- **D**：Lantern Market is an online shopping mall with categories for electronics, home appliances, fashion, beauty, food, home goods, sports and books, plus built-in product search.
- **K**：Lantern Market、online shopping、online mall、electronics、home appliances、fashion、beauty、food、home goods、sports、books

首页标题使用 `title.absolute`，不再套子页面模板。`applicationName` 只写品牌名，不使用整条 SEO 标题。

### 2.3 标题与摘要规则

1. **分隔符采用 ` - `**。百度标题规范将统一间隔符列为给站长的建议，不是承诺搜索引擎会自动改写所有 `|`、`_`。
2. **首页品牌在前，子页面站点名在后**。百度内容页建议格式为「内容标题 - 列表/频道名（可省）- 站点名」，中间不是任意关键词堆放位置。当前商品契约没有类目名，因此省略频道段，把「价格与规格」作为内容标题的一部分。
3. **摘要应描述当前页面**。百度首页摘要建议约 50 字；这不是所有搜索引擎的硬上限。搜索引擎可按查询、设备和页面正文生成不同标题或摘要，不能保证逐字采用 TDK。
4. **长度限制属于实现策略**。商品名的宽度预算用于抑制过长标题，不是百度或 Google 统一规定的字符配额，也不能单靠截断识别关键词堆砌。
5. **Keywords 不作为排名承诺**。Google 明确不使用 meta keywords 参与网页排名；百度站长问答的相关说法来自第三方转载，不能据此断言所有引擎都忽略它。保留少量准确词，不为 K 堆砌或大量增加维护成本。

首页品牌与实际站点名称、备案信息需一致；本次没有核验线上 ICP 备案名称。切勿把「建议格式」或示例当成排名、合规审核通过的保证。

## 三、商品页生成与实现位置

### 3.1 生成规则

TDK 使用 `GetProductDetail` 的商品名、SKU 名称和价格，不从未展示的参数或猜测的品牌、类目生成文案。

| 输入情况 | 当前处理 |
|---|---|
| 有 SKU 价格 | 中文标题「商品名价格与规格 - 灯市」；英文标题「商品名 Price & Options - Lantern Market」 |
| 无 SKU 或全部缺少价格 | 标题只留商品名与站点后缀，关键词不添加「价格」 |
| 商品名为空白 | 回退到页面同样展示的商品编码 |
| 多 SKU | 描述写 SKU 数，最多列出 3 个非空、去重后的规格名；未覆盖全部 SKU 时使用「等」或 `including` |
| 规格名全部为空 | 省略规格名列表，不输出空冒号或空括号 |
| 同币种且存在价格 | 使用最低价；多价时增加「起」或 `from`，格式化走 `formatMoney` |
| 缺少价格或混币种 | 描述不写统一价格，不编造跨币种最低价 |
| 商品名过长 | 标题中的商品名按 60 个宽度单位截断，描述中的商品名上限为 100，单个规格名为 24；超长商品名不输出 keywords |
| 国旗、组合字符或 ZWJ emoji | 使用 `Intl.Segmenter` 按字素截断，避免留下半个国旗或悬空 ZWJ |

宽度只是近似估算：全角、中日韩字符及代码识别的 emoji 字素记 2，其余记 1。它不是浏览器像素测量；标题后缀和描述整体也没有因此获得严格的总长保证。

**验证用 mock 示例，不是真实在售商品：**

```text
T：云朵静音加湿器价格与规格 - 灯市
D：云朵静音加湿器，共 4 款规格可选：4L 白色、4L 灰色、6L 白色等，价格 CNY 199 起。
K：云朵静音加湿器,云朵静音加湿器价格
```

### 3.2 数据与 metadata 共用

`generateMetadata` 和页面组件调用同一个 `loadProductDetail(spuCode)`。加载器使用 React `cache`，在同一次服务端渲染中共用 QueryClient 和查询结果；页面再将数据传给 JSON-LD 与客户端水合。

显式去重的原因是 **connect-node 使用 Node HTTP 客户端，不经过 fetch**，不能依赖 Next 对 fetch 的请求记忆。React `cache` 的请求内去重也不等同于跨请求缓存；ISR 的页面缓存是另一层机制。

### 3.3 维护入口

| 职责 | 源码 |
|---|---|
| 首页中英文 TDK | [`copy.ts`](../../frontend/apps/consumer-next/src/home/copy.ts) |
| 首页输出、canonical 和语言对应关系 | [首页 `page.tsx`](../../frontend/apps/consumer-next/app/[lang]/page.tsx) |
| 本地化站点后缀 | [`layout.tsx`](../../frontend/apps/consumer-next/app/[lang]/layout.tsx) |
| 商品 TDK 与字符边界 | [`product-metadata.ts`](../../frontend/apps/consumer-next/src/lib/product-metadata.ts) |
| 请求内共享商品查询 | [`product-detail-loader.ts`](../../frontend/apps/consumer-next/src/lib/product-detail-loader.ts) |
| 网关错误识别 | [`gateway-error.ts`](../../frontend/apps/consumer-next/src/lib/gateway-error.ts) |
| 商品页错误分类、canonical、JSON-LD 与水合 | [商品页 `page.tsx`](../../frontend/apps/consumer-next/app/[lang]/product/[spuCode]/page.tsx) |
| 价格格式化与结构化数据 | [`money.ts`](../../frontend/apps/consumer-next/src/lib/money.ts)、[`product-jsonld.ts`](../../frontend/apps/consumer-next/src/lib/product-jsonld.ts) |
| SPA 索引指令 | [consumer](../../frontend/apps/consumer/index.html)、[merchant](../../frontend/apps/merchant/index.html)、[admin](../../frontend/apps/admin/index.html) 的 HTML 入口 |

## 四、错误、robots 与规范地址

### 4.1 当前商品页错误分类

| 情形 | 描述 | robots | canonical / hreflang |
|---|---|---|---|
| 查询成功且有商品 | 从商品数据生成 | 不额外输出 `noindex` | 保留 |
| product 服务返回 `not_found` 或 `invalid_argument` | 「未找到该商品。」及英文对应文案 | `noindex, follow` | 不输出 |
| 网关自身错误，包括路由缺失的 `not_found` | 「商品信息暂时无法加载，请稍后再试。」及英文对应文案 | 不额外输出 `noindex` | 保留 |
| 其他服务故障 | 同上 | 不额外输出 `noindex` | 保留 |

故障页标题为「商品暂不可用 - 灯市」或英文对应标题，不再继承首页 description。当前代码将来自 product 服务的 `invalid_argument` 归入无效商品 URL，例如编码超过契约长度；请求字段或错误约定变化时需要复核这个分类。

**不能只凭 Connect 错误码识别商品不存在。** control-tower 网关路由缺失也会返回 `not_found`。当前实现先检查 `X-Error-Reason` 响应头，或 ErrorInfo 的 `debug.domain` 是否为 `gateway.control-tower`；这些网关错误按故障处理，避免一次路由配置错误让正常商品批量输出 `noindex`。

这只是索引指令防护，**没有修复 HTTP 状态和 ISR 故障缓存**：商品错误分支目前仍渲染 HTTP 200 错误页，失败内容可能写入页面缓存。不能把「未打 noindex」说成「上一份正常页面已被保住」。目标是无效商品返回 404、冷缓存故障返回 5xx、重验证失败继续提供成功缓存，实施与验收归 TODO 对应任务。

### 4.2 SPA 的临时策略

consumer 静态壳共用于所有 SPA 路由，不能直接为每个商品 URL 写不同的服务端 canonical。壳中已有 `noindex` 时，也不能依赖爬虫执行 JS 后移除它来恢复索引。

Google 推荐用 canonical 或永久重定向处理站内重复页，而不是用 `noindex` 选择规范页。因此旧 SPA 商品路由的 `noindex` 是迁移期隔离措施，不是最终的规范 URL 方案。**本次没有外链数据，不能认定旧地址没有外链或链接信号可忽略。**

[consumer 的 `robots.txt`](../../frontend/apps/consumer/public/robots.txt) 仍允许抓取。不要为让爬虫看到 `noindex` 的页面再配置 `Disallow`，否则它可能无法读取索引指令；被禁止抓取的 URL 仍可能因外部链接被发现。

## 五、SSR 对齐方向与后续依赖

### 5.1 按设计统一公开入口

这是用户确认的目标，不是本次 TDK 提交已经完成的迁移：

- 中文商品规范地址采用 `/product/{spuCode}`，英文采用 `/en/product/{spuCode}`，均由 consumer-next 提供服务端正文和 metadata。
- 旧 `/zh/product/{spuCode}` 单跳永久重定向到中文裸路径；同步 canonical、hreflang（含 `x-default`）、JSON-LD URL 和站内链接。
- 公开首页、商品、分类和列表以 SSR 为主，可按内容特点使用 SSG/ISR；不要求每个请求都重新渲染，也不另建一套 SPA 公开货架。
- SPA 保留购物车、结算、订单、账户与 merchant/admin 职责。切换公开入口时须验证 SKU 选择和加购等交互不丢失，不能只改入口路由。
- 分流与服务归属查 [服务矩阵](../../.service-matrix.yaml)，入口 Helm 与裸清单保持等价；本次总结没有修改或部署这些配置。

### 5.2 尚不能由 TDK 解决的问题

1. **真实货架与分类内容**：源码首页仍展示 `DEMO-*` 商品和虚构商家，分类入口仍涉及占位页。后端种子没有对应演示编码不等于已查询线上所有数据；收录准备须通过实际商品数据和全链路链接验证，不能以标题改好代替。
2. **SKU 数据映射与库存语义**：源码存在 `json_agg(k.*)` 解入无 JSON tag 领域结构的映射缺口，SKU 名称来源也需按设计明确，可能导致编码、规格或图片缺失。JSON-LD 目前还用锁定库存推断可售状态，这是独立语义问题，补齐映射也不会自动修正；无可靠可售依据时不应发布 `availability`。以上是源码核对，不是本轮生产环境测量。
3. **HTTP 状态和缓存故障处理**：见第四节；只补 robots 不能替代真实 404/5xx 和 ISR 恢复策略。
4. **业务与搜索效果验证**：备案名称、真实货架、搜索资源平台收录与查询数据尚需实际核验。没有证据时不承诺行业大词排名、自然流量或转化提升。

剩余工作只在 [TODO.md](../../TODO.md) 登记。以下稳定 ID 用于定位，不在本文复制状态或复选框：

| 任务 | 稳定 ID | TODO 位置 |
|---|---|---|
| 商品详情 SKU 字段映射与结构化数据 | `70cff1a3c490c7d9` | [微服务与交易闭环](../../TODO.md#微服务与交易闭环) |
| 公开列表页 | `fa0aa46fc98978ac` | [前端技术栈与工程化](../../TODO.md#前端技术栈与工程化) |
| 商品列表/类目接线 | `96d00ab723bda83d` | [前端技术栈与工程化](../../TODO.md#前端技术栈与工程化) |
| 公开商品页 SSR 与规范 URL 对齐 | `bb96bdd45d003d3b` | [前端技术栈与工程化](../../TODO.md#前端技术栈与工程化) |
| SSR 商品错误状态与 ISR 故障保护 | `33f5f25f38f56114` | [前端技术栈与工程化](../../TODO.md#前端技术栈与工程化) |

## 六、验证结论与复测边界

### 6.1 实现阶段已做的本地验证

以下汇总 TDK 实现阶段的检查，**不是本轮整理文档重新执行的结果，也不是线上效果验收**。

- consumer-next 生产构建、独立 TypeScript 检查、`scripts/verify-quick.sh frontend` 和 `scripts/verify-context.sh` 通过；当时 lint 的 3 条既有 warning 未在这次范围内处理。
- standalone 生产构建配合临时 mock 网关，验证成功、商品缺失、参数非法、网关自身 `not_found` 和服务故障分支。网关 `not_found` 在修复前复现了错误的 `noindex`，修复后响应头与 ErrorInfo 域两条识别路径均按故障处理。
- 检查空白商品名、无 SKU、缺价格、空或重复规格名、超长名称、CJK 扩展字符、国旗和 ZWJ emoji；正常多规格和单规格示例同时做回归比对。
- 以浏览器、Baiduspider、Googlebot、360Spider、YisouSpider、Bytespider 等 UA 请求，所测页面的 title 和 description 均在服务端 HTML 的 `<head>` 内；没有只检查水合后的 DOM。
- 网关调用计数显示一次商品页生成只取数一次；中文和英文分别生成时各调用一次，缓存命中不重复取数。

**流式 metadata 的结论有范围。** 当时安装的 Next 版本是 `16.4.0-canary.18`，首页为 SSG、商品为 ISR；所测首访和缓存命中均有 head metadata，因此没有新增 `htmlLimitedBots` 配置。不能推论所有 Next 版本、纯动态路由或未来缓存配置也相同。改变渲染策略、开始读取请求 Cookie、调整缓存配置或升级 Next 后，必须重测原始 HTML。

这些分支验证使用了临时脚本，未作为完整的仓库回归套件提交。既有 [consumer-next 运行时检查脚本](../../frontend/apps/consumer-next/scripts/verify-runtime.mjs)不能代替全部 TDK 断言，其旧语言断言还需核对；不能把 `pnpm ready` 通过等同于已自动覆盖所有上述情形。

### 6.2 复测判据

复测时先确认使用生产构建、网关已就绪且对应测试 URL 未命中旧的失败缓存，再检查：

1. **原始响应**：记录状态码、缓存命中情况，检查 head 中的 title、description、keywords、robots、canonical 和语言对应关系，确认没有重复标签。
2. **数据一致性**：将摘要价格、页面价格和 JSON-LD 与同一组查询数据对照；确认未把库存锁定量解释为可售量。
3. **错误隔离**：真实商品不存在与网关路由缺失必须得到不同的索引策略；同时区分当前 HTTP 200 错误页与第五节要求的目标行为。
4. **查询次数**：比较生成前后 mock 计数，确认 metadata 和页面没有各打一次 RPC。
5. **SSR 迁移**：用匿名、禁用 JS、直接访问和刷新检查规范地址及旧路径重定向；交易入口和语言切换仍可用。

格式、类型与文档检查按仓库锚点运行；不能用静态门禁替代 HTTP 行为验证。部署、线上故障注入和搜索平台提交仍按各自授权范围执行。

## 七、参考依据

- [百度搜索网页标题规范](https://ziyuan.baidu.com/college/articleinfo?id=2728)：标题应准确、简洁，避免重复和关键词堆砌；分隔符处理属于建议。
- [百度搜索基础信息设置规范：首页](https://ziyuan.baidu.com/college/documentinfo?id=3390&page=2)：首页标题、站点名称一致性与摘要写法。
- [Google：Influencing title links](https://developers.google.com/search/docs/appearance/title-link)、[meta description 与摘要](https://developers.google.com/search/docs/appearance/snippet)：标题和摘要可能由引擎按页面与查询重新生成。
- [Google does not use the keywords meta tag](https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag)：Google 不使用 meta keywords 参与网页排名。
- [Google：规范网址与重复页](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)、[JavaScript SEO 基础](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)：canonical、重定向及 robots 与渲染的关系。
- [百度俱乐部站长问答整理](https://blog.tag.gg/showinfo-36-12168-0.html)：第三方转载，仅作 keywords 说法的来源说明，不等同于百度现行官方排名承诺。
- Next Metadata API：实现时按安装版本的本地文档核对，[官方 API 页面](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)供检索；升级后以对应版本行为和实测为准。
