# 匿名（访客）购物链路设计

> 状态：**设计草案，未落地**。触发它的是一个真实缺陷：匿名访问首页时顶栏发出 `GetCart`
> → 网关 401 → 前端全局重登逻辑把人整页拉去登录页（2026-08-31 实测复现并已在前端侧修掉跳转，
> 见 `AuthProvider.test.tsx`）。但那只是止血——**匿名用户至今没有一条能加购物车的路径**，
> 这是架构层面的缺口，本文回答「该怎么补」。
>
> 命名说明：本文不叫「用户体验文档」。它要定的是**匿名身份的 RPC 契约与鉴权边界**
> （哪些 RPC 匿名可达、访客身份从哪来、登录后怎么合并），是架构设计而非交互设计；
> 交互层面的取舍（要不要提示「登录后购物车会保留」之类）归 `PRODUCT.md`。

## 一、现状事实（2026-08-31 实测，非推断）

| 事实 | 证据 | 对设计的约束 |
|---|---|---|
| 网关**无条件剥离**入站 `x-md-*` 全部头，仅在验签后注入 | `control-tower/services/gateway/internal/identity/identity.go` 的 `Strip`/`Inject` | 访客身份**必须由网关签发**，不能让前端自带——否则等于把身份伪造入口敞开 |
| cart 服务从 `x-md-global-user-id` 取值并 `uuid.Parse`，失败即 error | `backend/services/cart/internal/service/cart.go:135-140` | 匿名调用即便放行到服务，也会因空串解析失败而 500；服务侧必须显式支持访客身份 |
| `cart.cart_item.user_id` 是 `UUID NOT NULL`，**无外键**指向用户表 | `backend/services/cart/internal/data/migrations/00001_cart.sql:22` | **访客 UUID 可以直接落库，不需要改表结构**——这是本设计成本低的关键 |
| 唯一约束是 `(user_id, merchant_id, sku_id)` | 同上 :42 | 合并购物车时同 SKU 必须走「数量累加」而不是插入，否则违反约束 |
| cart 的 proto 请求体里**没有** user_id 字段 | `backend/api/cart/v1/cart.proto` | 身份完全走头传递，改造不必动 proto（除非引入显式访客字段，本文不建议） |
| 现有匿名清单已放行搜索/商品详情/推荐/地区等 10 条 | `.service-matrix.yaml` 的 `anonymous_paths` | 「逛」已经匿名可达，缺的只有「加购物车 → 结算」这一段 |

## 二、匿名购物的 RPC 分级

按「匿名能不能做」把消费者侧 RPC 分三级。这张表就是要落进网关匿名清单与 IAM 过滤规则的依据。

| 级别 | 含义 | RPC | 现状 |
|---|---|---|---|
| **A · 完全匿名** | 无需任何身份 | `search.v1.SearchService/Search`、`product.v1.ProductService/GetProductDetail`、`behavior.v1.BehaviorService/{Track,Recommend,SimilarItems}`、`address.v1.RegionService/ListRegions`、`telemetry.v1.TelemetryService/CollectWebVitals` | ✅ 已在匿名清单 |
| **B · 访客身份**（本文新增） | 需要一个稳定的「谁」，但不要求是注册用户 | `cart.v1.CartService/{GetCart,AddProductToCart,RemoveCartItem,UpdateCartItemQuantity,GetCartSummary}` | ❌ 当前要求登录 |
| **C · 必须登录** | 涉及真实身份、资金、履约 | `order.v1.OrderService/*`、`payment.v1.PaymentService/*`（回调除外）、`address.v1.AddressService/*`（地址簿）、`user.v1.UserService/*`（除 SignIn） | ✅ 保持现状 |

**边界铁律**：B 级只让访客拥有「购物车」这一种资源。下单一定要升级为 C 级——结算需要收货地址、支付需要可追责的主体、履约需要能通知到人。行业通行的「游客下单」本质是「下单前先建一个轻量账号」，不是真的没有账号。

## 三、访客身份从哪来

### 方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **① 纯前端本地购物车** | 购物车只存 localStorage，登录时整体上传 | 零后端改造 | 换设备/换浏览器即丢；与「已登录购物车」两套代码路径；行为数据拿不到 | 不选 |
| **② 网关签发访客令牌**（推荐） | 网关给无会话请求下发一枚签名 cookie，内含访客 UUID；注入 `x-md-global-user-id` 的同时注入 `x-md-global-anonymous=true` | 复用现有身份头契约，服务侧改动最小；购物车天然跨页面持久；可与登录态合并 | 需要网关新增签发逻辑；要防「访客身份被当成登录身份」 | **采纳** |
| **③ 服务端访客会话**（Redis） | 与登录会话同构，访客也建一条服务端 session | 与 BFF 会话轨完全同构 | 访客量远大于登录量，会话存储成本与清理压力显著；Dragonfly 是「可丢缓存」定位，不该承载它 | 不选 |

### 方案 ② 的关键约束

1. **签名不可省**：cookie 里的访客 UUID 必须由网关签名（复用 BFF 会话轨的密钥体系）。不签名等于让任何人随便填一个 UUID 就能读别人的访客购物车。
2. **访客标记必须独立成头**：注入 `x-md-global-user-id` 的同时必须注入 `x-md-global-anonymous=true`。下游服务**不能**靠「UUID 长得像不像」判断——C 级 RPC 一律拒绝带该标记的请求。这条是防止「访客混进下单链路」的唯一防线。
3. **该头同样在 Strip 名单内**：`x-md-` 前缀已被无条件剥离，新头天然受保护，不需要额外处理。
4. **生命周期**：cookie 有效期建议 30 天（与购物车留存预期一致），`HttpOnly` + `SameSite=Lax` + 生产环境 `Secure`。
5. **不进 Casdoor**：访客不是 IAM 主体，不在 Casdoor 建用户、不进 OpenFGA 关系图。IAM 侧的动作是**过滤**——见下节。

## 四、IAM（Casdoor / OpenFGA）侧的过滤

访客身份**不进 IAM**，所以过滤发生在网关：

| 检查点 | 规则 |
|---|---|
| JWT 校验 | 匿名清单（A 级）跳过；B 级不校验 JWT，改为校验访客 cookie 签名；C 级必须有有效 JWT/会话 |
| RBAC（Casbin/OpenFGA） | A/B 级不进 RBAC 评估（访客没有角色）；C 级维持现状 |
| 访客→用户升级 | 登录成功后网关必须**清除访客 cookie**，避免同一浏览器同时持有两种身份 |

`.service-matrix.yaml` 的 `anonymous_paths` 需要相应扩展为**分级**结构（A 级完全放行、B 级校验访客令牌），这是本设计对现有配置面的唯一破坏性改动，落地时需同步 `backend/structcheck` 的路由核对。

## 五、登录时的购物车合并

这是全链路最容易出错的一步，必须显式定义。

```
访客加购 3 件  ──┐
                 ├─→ 登录 ──→ MergeCart(guest_id → user_id) ──→ 清除访客 cookie
已登录购物车 2 件 ┘
```

**合并语义**（受 `UNIQUE (user_id, merchant_id, sku_id)` 约束）：
- 同 `(merchant_id, sku_id)` 已存在 → **数量累加**（不是覆盖，也不是插入——插入会撞唯一约束）
- 不存在 → 改写 `user_id` 迁移过去
- 价格快照：以**用户已有条目**的快照为准（访客加购时的价格可能已过期；不因合并给出更低价）
- 合并失败不能阻断登录：登录是主流程，合并失败只记日志 + 保留访客购物车待下次重试

需要新增 RPC：`cart.v1.CartService/MergeGuestCart`，仅允许网关内部调用（不进公开路由）。

## 六、落地步骤（建议顺序，每步可独立验收）

| # | 动作 | 验收 |
|---|---|---|
| 1 | 网关签发/校验访客 cookie，注入两个身份头 | 匿名请求带上 `x-md-global-user-id` + `x-md-global-anonymous=true`，重复请求 UUID 稳定 |
| 2 | `.service-matrix.yaml` 匿名清单改分级，同步 structcheck | 门禁绿；C 级 RPC 带访客标记时返回 401 |
| 3 | cart 服务接受访客身份（`uuid.Parse` 失败路径改造） | 匿名 `AddProductToCart` 成功落库，`GetCart` 读回 |
| 4 | `MergeGuestCart` 实现 + 登录链路调用 | 访客 3 件 + 用户 2 件 → 登录后 5 件；同 SKU 数量累加 |
| 5 | 前端移除 `useCart` 的匿名兜底，恢复正常查询 | 匿名首页不再出现 401（当前是「不跳转但仍报错」的状态） |
| 6 | 访客数据清理策略（30 天未活跃的访客购物车） | 定时任务；与 `cart_type='expired'` 状态复用 |

## 七、与现有缺陷的关系

- 本设计**不依赖** BFF 登录链路修复。但第 4 步（合并）需要登录能跑通，而 BFF 会话轨当前在集群里未配置（见 `TODO.md` 前端段「网关 BFF 端点」行），所以第 4 步排在其后。
- 前端 `useCart` 的 `getCart` 无 `enabled` 门是本缺口的**症状**而非原因：正确修法不是给它加条件，而是让匿名也有合法的购物车路径（第 3 步）。在此之前，前端保持「匿名不发这个请求」的临时兜底也可接受，但那是权宜。
