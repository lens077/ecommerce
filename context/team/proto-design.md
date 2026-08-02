---
name: proto-design
layer: team
description: 设计/编写 proto 时必须先参考设计文档，并为每个字段推断出合理的校验值范围写成 buf.validate 约束
---

# Proto 契约设计规范

## 铁律一：写 proto 前必须先读设计文档

设计或修改 `backend/api/**/*.proto` 之前，**先读对应的设计文档**，不得凭字段名臆测语义。

阅读优先级：

1. `Design.md` —— 主架构与各域设计（如 `ListProducts` 的游标分页设计已在此定稿）
2. `CONFIG_CENTER_DESIGN.md` —— 配置中心域的数据模型 / RPC / 鉴权
3. `TODO.md` —— 该 RPC 当前是 ✅ / 🟡 / ⬜，缺口写的是什么
4. 同域已有的 proto 与 sqlc schema —— 字段命名、类型、列宽要对齐

**Why**：proto 是服务边界和上下游契约，不是普通文本。字段一旦发布，前端 `frontend/packages/api` 和各服务的生成代码都依赖它。凭感觉起字段名/定类型，等发现语义错了，改动代价已经从「改几行设计文档」升到「回滚 proto + 重新生成前后端 + 处理已落库数据」。

设计文档里没写清楚的字段，**问，不要猜**。

## 铁律二：每个字段都要推断出合理的校验值范围

不允许字段"裸奔"。定义字段时同步推断它的合法取值范围，写成 `buf.validate` 约束。

```protobuf
CartStatus status = 11 [(buf.validate.field).enum.defined_only = true];
```

**Why**：`buf.validate` 是**最便宜的一道闸**——脏数据在进入 biz 层之前就被拦住，错误死在代价最低的地方。没有约束的字段意味着 biz 层要么重复写防御代码，要么直接把脏数据带进 DB。

### 校验值范围从哪里推断（来源优先级）

| 优先级 | 来源 | 例 |
|---|---|---|
| 1 | 设计文档明写 | Design.md 写了「分页每页最多 100 条」→ `uint32.lte = 100` |
| 2 | DB schema（sqlc / 建表语句）列宽与类型 | `varchar(64)` → `string.max_len = 64`；`numeric` 非负 → `gte = 0` |
| 3 | 同域已有 proto 的同类字段 | `anon_id` 已是 `max_len = 64`，`session_id` 保持一致 |
| 4 | 业务常识 + 下游承受能力 | 批量事件数组 → `repeated.max_items = 50`，防打爆 gorse |

推断不出来就问用户，**不要拍脑袋填一个数**。填错的上限比没有上限更难排查。

## 按类型的默认约束清单

以下取自本仓已落地的真实写法（`cart.proto` / `behavior.proto` / `address.proto` / `config.proto`）。

### 枚举 —— 必须 `defined_only`

```protobuf
CartStatus status = 11 [(buf.validate.field).enum.defined_only = true];
repeated CartStatus status = 4 [(buf.validate.field).repeated.items.enum.defined_only = true];
```

不加的话未知枚举值（如上游用了新版本的枚举）会以 int 形式穿透进来，`switch` 落到 default 分支产生难查的静默错误。

需要额外排除零值（`UNSPECIFIED`）时用完整写法：

```protobuf
EventType type = 1 [(buf.validate.field).enum = {
  defined_only: true
  not_in: [0]
}];
```

### 标识符 —— UUID 用 `string.uuid`

```protobuf
string merchant_id = 3 [(buf.validate.field).string.uuid = true];
```

非 UUID 的业务 ID（如 `item_id` / `spu_code`）用 `min_len` + `max_len` 组合，不要只写 `max_len`——那样空串会通过。

### 自由文本 —— 必须有 `max_len`

```protobuf
string source = 5 [(buf.validate.field).string.max_len = 128];
string anon_id = 1 [(buf.validate.field).string.max_len = 64];
```

**没有上限的 string 是内存放大攻击面**。上限对齐 DB 列宽。

### 数量 / 分页 —— 必须有上限

```protobuf
uint32 n = 3 [(buf.validate.field).uint32.lte = 100];
```

**分页参数必须有上限**，这是最典型的「一个字段打爆下游」场景。`page_size` 之类的字段永远要 `lte`。

### 数组 —— 必须有 `max_items`

```protobuf
repeated Event session_events = 5 [(buf.validate.field).repeated.max_items = 50];
```

同理，`repeated` 不设上限等于把批量大小的决定权交给调用方。

### 数值 / 时间戳 —— 至少约束符号

```protobuf
double value = 3 [(buf.validate.field).double.gte = 0];
int64  ts_ms = 4 [(buf.validate.field).int64.gte = 0];
```

**金额不要用 `double` / `float`**（浮点精度问题）。新增金额字段用整数分（`int64`）或 decimal 字符串，并同样加 `gte = 0`。

### 必填

用 `required = true`，或对 string 用 `min_len = 1`。注意 proto3 的标量字段无法区分"未设置"和"零值"，需要区分时用 `optional` 包装。

## 兼容性红线

proto 改动的四条红线，任何一条都会同时炸后端服务和前端 `packages/api` 生成代码：

1. **不删字段** —— 用 `reserved` 占住字段号和名字
2. **不复用字段号** —— 已删除的号永久作废
3. **不改字段类型** —— 包括 `int32` → `int64` 这种"看起来兼容"的
4. **不改字段语义** —— 类型不变但含义变了，比类型改动更危险，因为编译不报错

删除字段的正确写法：

```protobuf
message CartItem {
  reserved 7, 9;
  reserved "old_field_name";
  // ...
}
```

**建议**：把 `buf breaking` 接进 CI。本仓已有 `backend/buf.yaml` 和 `@bufbuild/buf`，这是低成本高收益的一道门禁。

## buf.validate 的边界

`buf.validate` 只管**结构性约束**（格式、长度、范围、枚举合法性）。以下**不属于**它的职责，必须留在 biz 层：

- 业务不变量：库存是否充足、订单状态机是否允许该转移
- 跨字段一致性：`start_time < end_time` 这类可以用 CEL 表达式，但复杂的仍放 biz
- 权限：谁能改这个字段 —— 那是网关 RBAC 的事

不要因为「加了 validate」就省掉 biz 层的校验。

## 反例

```protobuf
// ❌ 全裸：状态可以是任意 int、备注可以是 10MB、页大小可以是 int32 最大值
message ListOrdersRequest {
  OrderStatus status   = 1;
  string      keyword  = 2;
  int32       page_size = 3;
}
```

```protobuf
// ✅ 每个字段都有推断依据
message ListOrdersRequest {
  // 设计文档：仅按已定义状态过滤
  OrderStatus status = 1 [(buf.validate.field).enum.defined_only = true];
  // DB: keyword 走 ES，对齐 search 服务的查询串上限
  string keyword = 2 [(buf.validate.field).string.max_len = 128];
  // 设计文档：分页每页最多 100
  uint32 page_size = 3 [(buf.validate.field).uint32 = { gte: 1, lte: 100 }];
}
```

## 相关

- 契约破坏的连带影响见 [`context/project/ecommerce/`](../project/ecommerce/INDEX.md)
- 配置类字段的服务端校验见 `CONFIG_CENTER_DESIGN.md`
