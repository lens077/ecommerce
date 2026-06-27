# 电商项目 MVP 功能清单

## 当前完成情况

### 后端微服务状态

| 服务 | 状态 | 已完成功能 | 缺失功能 |
|------|------|-----------|---------|
| **address** | ✅ 完成 | CreateAddress, UpdateAddress, DeleteAddress, GetAddress, ListAddresses, SetDefaultAddress | 无 |
| **inventory** | ✅ 完成 | 库存管理功能完整 | 无 |
| **merchant** | ✅ 完成 | 商家管理功能完整 | 无 |
| **search** | ✅ 完成 | 商品搜索功能 | 无 |
| **cart** | ⚠️ 部分完成 | AddProductToCart, GetCart, UpdateCartItem | **RemoveProductToCart** |
| **order** | ⚠️ 部分完成 | CreateOrder, CompleteOrder | **Order 消息为空**, **ListOrders**, **GetOrder**, **CancelOrder** |
| **payment** | ⚠️ 部分完成 | CreatePayment, GetPaymentStatus, HandlePaymentNotify | **支付流程完善**, **支付状态回调处理** |
| **user** | ⚠️ 部分完成 | SignIn, UserProfile | 地址管理（已独立为 address 服务） |
| **product** | ❌ 待实现 | - | **GetProduct**, **ListProducts**, **商品管理** |

### 前端应用状态

| 应用 | 状态 | 说明 |
|------|------|------|
| **admin** | ❌ 无 API 代码 | 需要生成 protobuf API 代码（category/merchant/order/product/report/user 管理） |
| **merchant** | ❌ 无 API 代码 | 需要生成 protobuf API 代码（orders/products/reports） |
| **consumer** | ❌ 缺失 API | 缺少 addresses/orders/payment 等 API 集成 |

---

## MVP 功能优先级

### P0：核心功能（必须完成）

#### 1. Product 服务 ⭐⭐⭐⭐⭐
**优先级：最高**

- **缺失功能**：
  - `GetProduct`：商品详情查询
  - `ListProducts`：商品列表查询

- **实施步骤**：
  1. 完善 `backend/api/product/v1/product.proto` 接口定义
  2. 实现 `internal/biz` 业务逻辑层
  3. 实现 `internal/data` 数据访问层
  4. 实现 `internal/service` Connect 服务层
  5. 编写 sqlc 查询和数据库迁移

- **依赖**：无

- **重要性**：商品是电商核心，用户无法浏览商品则无法下单

---

#### 2. Cart 服务 - RemoveProductToCart ⭐⭐⭐⭐⭐
**优先级：最高**

- **缺失功能**：
  - `RemoveProductToCart`：从购物车移除商品

- **实施步骤**：
  1. 在 `backend/api/cart/v1/cart.proto` 添加接口定义
  2. 在 `internal/biz` 添加业务逻辑
  3. 在 `internal/data` 实现数据库操作（软删除或硬删除）
  4. 在 `internal/service` 实现 Connect 服务

- **依赖**：无

- **重要性**：购物车是下单前置流程，移除商品是基本功能

---

#### 3. Order 服务完善 ⭐⭐⭐⭐
**优先级：高**

- **缺失功能**：
  - 补全 `Order` 消息定义（目前为空）
  - `ListOrders`：用户订单列表查询
  - `GetOrder`：订单详情查询
  - `CancelOrder`：订单取消

- **实施步骤**：
  1. 完善 `backend/api/order/v1/order.proto` 中的 `Order` 消息定义
  2. 添加 `ListOrders`、`GetOrder`、`CancelOrder` 接口
  3. 实现 `internal/biz` 业务逻辑（订单状态机、取消逻辑）
  4. 实现 `internal/data` 数据库操作
  5. 实现 `internal/service` Connect 服务层

- **依赖**：Cart 服务完成

- **重要性**：订单是交易核心，用户需查看订单状态

---

#### 4. Payment 服务完善 ⭐⭐⭐⭐
**优先级：高**

- **缺失功能**：
  - 支付流程完善（创建支付单后如何引导用户支付）
  - 支付状态回调处理（更新订单状态、触发库存扣减）

- **实施步骤**：
  1. 完善 `CreatePayment` 逻辑，生成支付 URL
  2. 实现 `HandlePaymentCallback` 处理支付成功回调
  3. 集成支付宝 SDK 或模拟支付流程
  4. 支付成功后触发 `OrderPaidEvent` 事件
  5. 实现幂等性处理（防止重复支付）

- **依赖**：Order 服务完成

- **重要性**：支付是交易闭环关键环节

---

### P1：重要功能（应完成）

#### 5. User 服务 - 地址管理集成
**优先级：中高**

- **说明**：地址管理已独立为 address 服务，需在 user 服务中集成调用

- **实施步骤**：
  1. 在 user 服务中注入 address 客户端
  2. 在用户相关接口中返回地址信息

- **依赖**：address 服务完成（✅ 已完成）

---

#### 6. Frontend - Consumer 端 API 集成 ⭐⭐⭐
**优先级：中**

- **缺失功能**：
  - 商品浏览 API 集成
  - 购物车 API 集成
  - 订单 API 集成
  - 支付 API 集成
  - 地址管理 API 集成

- **实施步骤**：
  1. 为所有后端服务生成 Connect-Web 客户端代码
  2. 在 frontend/consumer 中创建 API 服务层
  3. 实现 React Hook 封装
  4. 对接 UI 组件

- **依赖**：P0 所有功能完成

---

#### 7. Order 服务 - 订单取消流程
**优先级：中**

- **缺失功能**：
  - 取消订单时释放库存
  - 取消订单时处理退款
  - 发布 `OrderCancelledEvent` 事件

- **实施步骤**：
  1. 实现 CancelOrder 业务逻辑
  2. 调用 inventory 服务释放库存
  3. 调用 payment 服务处理退款
  4. 发布 Kafka 事件通知其他服务

- **依赖**：Order 服务基础功能完成

---

### P2：增强功能（可延后）

#### 8. Frontend - Merchant 端 API 集成
**优先级：低**

- **缺失功能**：
  - 商家商品管理 API
  - 商家订单管理 API
  - 商家销售报表 API

- **实施步骤**：
  1. 生成 Connect-Web 客户端代码
  2. 在 frontend/merchant 中实现 API 集成

- **依赖**：P0、P1 功能完成

---

#### 9. Infrastructure - 服务间通信
**优先级：低**

- **缺失功能**：
  - Order 服务调用 Inventory 服务（库存预占、释放）
  - Order 服务调用 Product 服务（获取商品信息）
  - Order 服务调用 Payment 服务（创建支付单）
  - Product 服务调用 Search 服务（同步商品数据到 ES）

- **实施步骤**：
  1. 为每个服务创建 Connect 客户端
  2. 在 Fx 中注入客户端依赖
  3. 实现服务间调用逻辑

- **依赖**：所有相关服务完成

---

## 推荐实施顺序

```
Phase 1：核心交易流程（P0）
┌─────────────────────────────────────┐
│ 1. Cart - RemoveProductToCart       │ ← 购物车完善
│ 2. Product - GetProduct/ListProducts │ ← 商品核心
│ 3. Order - Order 消息补全 + 查询接口  │ ← 订单基础
│ 4. Payment - 支付流程完善            │ ← 支付闭环
└─────────────────────────────────────┘

Phase 2：前端集成（P1）
┌─────────────────────────────────────┐
│ 5. Frontend Consumer API 集成       │ ← 用户端完整体验
│ 6. User - 地址管理集成               │ ← 用户信息完善
│ 7. Order - 订单取消流程              │ ← 订单状态管理
└─────────────────────────────────────┘

Phase 3：商家端 & 基础设施（P2）
┌─────────────────────────────────────┐
│ 8. Frontend Merchant API 集成       │ ← 商家端完整体验
│ 9. Infrastructure - 服务间通信       │ ← 微服务协作
└─────────────────────────────────────┘
```

---

## 技术债务与优化

### 需要修复的问题
1. ✅ **OpenTelemetry Schema URL 冲突** - 已修复
2. ✅ **HTTP/HTTP2 协议不匹配** - 已通过 H2C 支持修复
3. ✅ **网关日志格式不统一** - 已修复
4. ✅ **RBAC 目录路径错误** - 已修复为 `configs/policies/`

### 待优化项
1. **Redis OTel 插件集成** - 因版本兼容问题暂时移除
2. **数据库连接池优化** - 目前使用默认配置
3. **错误处理统一** - 部分服务未使用 `kratoserrors` 包

---

## 验收标准

### P0 功能验收标准
- [ ] 用户可以浏览商品列表和详情
- [ ] 用户可以添加/移除购物车商品
- [ ] 用户可以创建订单并查看订单列表/详情
- [ ] 用户可以完成支付流程

### P1 功能验收标准
- [ ] 前端 consumer 应用完整可用
- [ ] 用户可以管理收货地址
- [ ] 用户可以取消订单

### P2 功能验收标准
- [ ] 商家可以管理商品和订单
- [ ] 服务间通信正常

---

## 备注

- **技术栈**：Connect-Go, PostgreSQL, Redis, Elasticsearch, Kafka
- **架构**：微服务架构，Gateway 网关，服务发现（Consul）
- **已完成服务**：address, inventory, merchant, search
- **H2C 支持**：所有后端服务已支持 HTTP/2 Cleartext

**更新时间**：2026-06-27
**项目状态**：P0 功能开发中