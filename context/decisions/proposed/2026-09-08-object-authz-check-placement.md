---
name: 2026-09-08-object-authz-check-placement
layer: decisions
status: proposed
description: 对象级授权（订单→店铺→商家→成员身份）的 OpenFGA Check 放在服务侧 use case 层而非网关；OpenFGA 只存组织图，对象归属用服务自己的归属列。待拍板
---
# 决策：对象级授权 Check 放在哪一层、OpenFGA 存什么

> **状态：待拍板**（2026-09-08 用户选择「先沉淀分析，不定」）。本文记录分析结论、两份真相源的冲突和三个未决分叉；任何一项拍板后按 INDEX 规则迁目录并改写。

## 问题

「商家 A 的员工能不能看订单 1001」取决于三段：订单属于哪个店、店属于哪个商家、这个人在那个商家是什么身份。这类判定要落在哪一层、用什么引擎表达，目前有三个互相纠缠的疑问：

1. **RBAC 能不能表达？** 一半能。「成员 × 角色」（alice 在 merchant:a 是 admin）带域 RBAC 能表达；「对象归属链」（order→store→merchant）RBAC 没地方存，必须由应用先 join 出归属再去问引擎。ReBAC（OpenFGA）的差别是把归属图也搬进引擎，代价是每建一个对象要多写一份 tuple（跨系统双写）。
2. **Casdoor 能不能顶上？** Casdoor 内嵌 Casbin，支持 ABAC / 带域 RBAC，但它是策略引擎不存关系图，归属解析仍是调用方的活；且项目已定 Casdoor 只管认证与粗角色 `admin/merchant/customer`（`docs/TECH.md` §5.2、`docs/GLOSSARY.md`）。Casdoor 与 OpenFGA 是并列关系，靠 `user_id` 缝合，粘合点是「谁写 tuple」。
3. **Check 放网关还是服务？** 这一条两份真相源**互相矛盾**：

| 来源 | 说法 |
|---|---|
| `docs/TECH.md` §8.1 图、§8.3 矩阵；`docs/TECH-RADAR.md` 4.1（2026-08-28） | 网关调 OpenFGA Check；「禁止网关热路径远程 check」不再代表目标态 |
| `../control-tower/docs/design/decisions.md:40` | 「OpenFGA 进网关：**禁止**。只做服务内资源关系授权」 |

网关现状（2026-09-08 复核 control-tower `services/gateway/internal/identity/identity.go:18-27`、本仓 `context/project/ecommerce/gateway/INDEX.md:12`）：只注入 `user-id / name / role / owner / anonymous` 五个头，**没有 `x-md-global-merchant-id`**；ConnectRPC over H2C 流式直通、无请求体缓存。即网关拿不到 `order_id`，`Check(user, can_view, order:1001)` 在网关物理上做不了；要做就得缓冲并解析 protobuf body 且让网关懂每个 RPC 的对象字段——与 `docs/TECH.md` 否决 WAF 的论据同一条。

## 提案

**P1 · Check 放服务侧 use case 层**（`internal/biz/application`），网关只做 Session 校验 + procedure 粗闸，网关代码零改动；`docs/TECH.md` §8.1 图改为「网关透传身份头 → 服务 Check」，与 control-tower 裁决对齐。

**P2 · OpenFGA 只存组织图**（`merchant#admin/staff`、`store#parent/manager/member`），由 identity/merchant 域独占写入；`order` 不进 OpenFGA。服务从自己的行里读归属列（`store_id`），然后 `Check(user, can_view, store:<store_id>)`；消费者侧直接比 `order.customer_id == user_id`。订单写路径零改动。`docs/TECH.md` §8.2 模型相应去掉 `order` type。

**P3 · 列表接口约定**：不逐条 Check。`ListObjects(user, can_view, store)` → SQL `WHERE store_id = ANY($n)`；或直接 join 成员表。

**影响面**（P1+P2 形态）：

| 层 | 改动 |
|---|---|
| 网关（control-tower） | 不动代码，只改文档 |
| `internal/service` + `internal/server` | 统一拦截器：身份头 → `Principal` 入 ctx（现状 cart/address/behavior 各写一遍，order 那行是注释 `order.go:33`） |
| `internal/biz/application` | **决策点**：加载对象 → 取归属 → `Authorizer.Check`；在 biz 定义 `Authorizer` port |
| `internal/data` / 新 `internal/authz` | OpenFGA client adapter（超时、fail-closed、缓存、指标）；列表 SQL 加 tenant 条件 |
| merchant / user（目标 identity-service） | 成员增删、店铺创建 → 写/删 tuple；outbox 或对账 |
| 配置面 | Config Center bootstrap 加 openfga 端点/store/model id；`.service-matrix.yaml` 加 `depends_on` 并跑 structcheck（现状无条目） |
| 文档 | TECH.md §8.1/§8.2/§8.3、GLOSSARY、control-tower decisions 三处对齐 |

「只改接口适配层 + 基础设施层」不成立：若在 Connect handler 做 Check，handler 得先读仓储拿归属，领域逻辑漏进适配层，且事件消费者等内部路径会绕过。

## 验收标准

- `docs/TECH.md` §8.1 与 control-tower `decisions.md:40` 不再矛盾，二者之一带「本条覆盖对方」标记。
- 首个接线服务（TODO ⑪ 定的 merchant 域影子双跑）每个受保护用例有 allow / deny 各一条测试。
- `.service-matrix.yaml` 出现 openfga 依赖且 `go test ./structcheck/...` 绿。
- 列表接口有 tenant 条件，无「逐条 Check」实现。

## 风险

- **最没把握**：`docs/TECH.md` §8（2026-08-28）是否有意推翻更早的 control-tower 裁决。两边都没找到明确的覆盖标记；若用户本意是给网关加 body 解析，P1 方向错。
- P2 隐含假设**所有受保护对象的表都有 `store_id`/`merchant_id` 归属列**——只看了 order 目录结构，未逐表核 schema。
- tuple 双写一致性（成员变更 vs OpenFGA）没有 outbox 就会漂。

## 考虑过的替代方案

- **网关做对象级 Check（TECH.md §8.1 现图）** — 网关无 body 缓存、不注入 merchant-id，拿不到对象 id；补 body 解析破坏 H2C 流式假设并与业务 schema 耦合。除非用户明确要走这条，否则输。
- **对象全进 OpenFGA（TECH.md §8.2 现模型，含 `order` type）** — 每次 `CreateOrder` 都要同步写 `order#parent`、`#customer` tuple，在最热写路径加跨系统双写；归属列本来就在订单表里，零成本。只在出现「单个对象授权给外部人」需求时再升级。
- **用 Casdoor 内嵌 Casbin 的 ABAC/带域 RBAC** — 远程调用不比 OpenFGA 近；不存关系图，归属仍要应用解析；逆着「Casdoor 只管粗角色」的既定边界。
- **只在 Connect handler（接口适配层）做 Check** — 领域逻辑漏进适配层，内部调用路径绕过。

## 参考

- `docs/TECH.md` §5.2（identity-service 边界）、§8（零信任鉴权）
- `docs/TECH-RADAR.md` 4.1
- `../control-tower/docs/design/decisions.md:40`
- `TODO.md` ⑪ OpenFGA 落地（含「首接 merchant 域影子双跑→强制」「降级只准缩小授权集」）
- [OpenFGA authorization concepts](https://openfga.dev/docs/authorization-concepts)、[Casbin RBAC with Domains](https://casbin.org/docs/rbac-with-domains-api)
