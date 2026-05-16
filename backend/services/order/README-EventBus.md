# Order 服务 - 领域事件与进程内通信

## 目录
- [为什么需要 GoEventBus](#为什么需要-goeventbus)
- [在 DDD 中的位置](#在-ddd-中的位置)
- [快速开始](#快速开始)
- [代码示例](#代码示例)
- [订阅与消费](#订阅与消费)
- [异步处理](#异步处理)
- [最佳实践](#最佳实践)

---

## 为什么需要 GoEventBus

### 问题背景

在分布式系统中，领域事件（Domain Event）是 DDD（领域驱动设计）的核心概念之一。当聚合根状态发生变化时，我们需要：

1. **解耦核心业务逻辑与副作用**：订单完成后，发送通知、增加积分、触发库存变更等操作不应该在订单聚合根中直接处理
2. **实现最终一致性**：跨限界上下文（Bounded Context）的通信需要异步进行
3. **避免循环依赖**：如果直接在聚合根中调用通知服务，可能导致模块间的循环依赖

### 为什么选择 GoEventBus

| 特性 | 描述 |
|------|------|
| **轻量级** | 无外部依赖，零运行时开销 |
| **高性能** | 基于 channel 的内存队列，支持高并发 |
| **灵活的分发策略** | 支持 DropOldest、DropNewest 等策略 |
| **进程内通信** | 适合单进程内的发布-订阅模式 |
| **异步支持** | 支持同步和异步两种发布模式 |

---

## 在 DDD 中的位置

### DDD 分层架构中的事件流

```
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                          │
│                     (应用服务层)                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         OrderCommandUseCase.CompleteOrder()             │   │
│  │                                                         │   │
│  │  1. 加载聚合根: uc.repo.GetOrderByNo()                  │   │
│  │  2. 调用领域方法: order.Complete()                       │   │
│  │  3. 持久化聚合: uc.repo.SaveOrder()                     │   │
│  │  4. 发布领域事件: uc.eventBus.Publish()                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Domain Layer                              │
│                      (领域层 - 核心)                             │
│  ┌──────────────────┐     ┌──────────────────────────────┐     │
│  │   OrderRoot      │     │   领域事件 (Domain Events)    │     │
│  │  (聚合根)         │────▶│   OrderCompletedPayload     │     │
│  │                  │     │   OrderPaidPayload           │     │
│  │  Complete()      │     │   OrderShippedPayload        │     │
│  │  Cancel()        │     └──────────────────────────────┘     │
│  │  Ship()          │                                          │
│  └──────────────────┘                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                         │
│                    (基础设施层)                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              GoEventBus (进程内事件总线)                    │   │
│  │                                                           │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │   │
│  │  │  Projection │    │  Projection │    │  Projection │  │   │
│  │  │  "Notify"   │    │  "Points"   │    │  "Inventory"│  │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 事件流转步骤

1. **聚合根产生事件**：订单完成时，`order.Complete()` 方法将事件添加到 `events` 列表
2. **应用层收集事件**：应用服务从聚合根获取 `Events()`
3. **事件总线发布**：`eventBus.Publish()` 将事件放入缓冲区
4. **异步分发**：`eventBus.Store().Publish()` 将事件分发给订阅者
5. **订阅者消费**：注册的处理器异步执行副作用（发通知、增加积分等）

---

## 快速开始

### 1. 添加依赖

```bash
go get github.com/Protocol-Lattice/GoEventBus
```

### 2. 项目结构

```
internal/
├── eventbus/
│   └── eventbus.go           # 事件总线封装
├── biz/
│   ├── domain/
│   │   ├── entity.go         # 聚合根定义
│   │   └── events/
│   │       ├── struct.go     # 事件结构体定义
│   │       └── handles.go    # 事件处理器注册
│   └── application/
│       └── order.go          # 应用服务
└── cmd/
    └── server/
        └── main.go           # 入口文件
```

---

## 代码示例

### 步骤 1：定义领域事件结构体

在 `internal/biz/domain/events/struct.go` 中定义事件载荷：

```go
package events

import (
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type OrderCompletedPayload struct {
	OrderId     int64
	UserId      uuid.UUID
	TotalAmount decimal.Decimal
}

type OrderPaidPayload struct {
	OrderId  int64
	PaidAt   time.Time
	PayNo    string
}

type OrderShippedPayload struct {
	OrderId     int64
	CourierCode string
	CourierName string
	TrackingNo  string
}
```

### 步骤 2：在聚合根中产生事件

在 `internal/biz/domain/entity.go` 中，聚合根的业务方法产生事件：

```go
func (o *OrderRoot) Complete() error {
	// 1. 校验业务规则
	if o.OrderStatus != constants.OrderStatusPaid {
		return ErrNotOrderStatusPaid
	}

	// 2. 更新聚合根状态
	o.OrderStatus = constants.OrderStatusCompleted

	// 3. 产生领域事件
	o.events = append(o.events, events.OrderCompletedPayload{
		OrderId:     o.Id,
		UserId:      o.UserId,
		TotalAmount: o.PayAmount,
	})

	return nil
}

// Events 返回聚合产生的所有领域事件
func (o *OrderRoot) Events() []any {
	return o.events
}
```

### 步骤 3：定义事件处理器

在 `internal/biz/domain/events/handles.go` 中注册事件处理器：

```go
package events

import (
	"context"
	"log"

	"github.com/Protocol-Lattice/GoEventBus"
)

func OrderCompletedHandlers() GoEventBus.Dispatcher {
	return GoEventBus.Dispatcher{
		"OrderCompleted": func(ctx context.Context, ev GoEventBus.Event) (GoEventBus.Result, error) {
			payload := ev.Data.(OrderCompletedPayload)

			// TODO: 实际业务逻辑
			// 1. 发送订单完成通知
			// 2. 增加用户积分
			// 3. 触发库存变更
			// 4. 发送营销短信/邮件

			log.Printf("[Event] Order %d completed for user %s, amount=%v",
				payload.OrderId,
				payload.UserId,
				payload.TotalAmount,
			)

			return GoEventBus.Result{Message: "ok"}, nil
		},

		// 添加更多事件处理器...
		"OrderPaid": func(ctx context.Context, ev GoEventBus.Event) (GoEventBus.Result, error) {
			payload := ev.Data.(OrderPaidPayload)
			log.Printf("[Event] Order %d paid, payNo=%s", payload.OrderId, payload.PayNo)
			return GoEventBus.Result{Message: "ok"}, nil
		},
	}
}
```

### 步骤 4：封装事件总线

在 `internal/eventbus/eventbus.go` 中创建事件总线封装：

```go
package eventbus

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/Protocol-Lattice/GoEventBus"
)

type EventBus struct {
	store *GoEventBus.EventStore
}

var (
	bus  *EventBus
	once sync.Once
)

func NewEventBus(handlers GoEventBus.Dispatcher) *EventBus {
	once.Do(func() {
		bus = &EventBus{
			store: GoEventBus.NewEventStore(&handlers, 1<<16, GoEventBus.DropOldest),
		}
	})
	return bus
}

func GetBus() *EventBus {
	return bus
}

// Publish 异步发布事件到指定投影
func (eb *EventBus) Publish(projection string, data any) error {
	return eb.store.Subscribe(context.Background(), GoEventBus.Event{
		ID:         generateEventID(),
		Projection: projection,
		Data:       data,
	})
}

func (eb *EventBus) Store() *GoEventBus.EventStore {
	return eb.store
}

func generateEventID() string {
	return fmt.Sprintf("evt_%d", time.Now().UnixNano())
}
```

### 步骤 5：应用层发布事件

在 `internal/biz/application/order.go` 中使用事件总线：

```go
package application

import (
	"context"
	"errors"
	"fmt"

	"connectrpc.com/connect"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz/domain"
	"github.com/lens077/ecommerce/backend/services/order/internal/eventbus"
	"go.uber.org/zap"
)

type OrderCommandUseCase struct {
	repo     domain.OrderCommandRepo
	log      *zap.Logger
	eventBus *eventbus.EventBus
}

func NewOrderCommandUseCase(
	repo domain.OrderCommandRepo,
	logger *zap.Logger,
	eventBus *eventbus.EventBus,
) *OrderCommandUseCase {
	return &OrderCommandUseCase{
		repo:     repo,
		log:      logger.Named("OrderUseCase"),
		eventBus: eventBus,
	}
}

// CompleteOrder 完成订单
func (uc *OrderCommandUseCase) CompleteOrder(ctx context.Context, orderNo string) error {
	// 1. 加载聚合根
	order, err := uc.repo.GetOrderByNo(ctx, orderNo)
	if err != nil {
		if errors.Is(err, domain.ErrOrderNotFound) {
			return connect.NewError(connect.CodeNotFound, err)
		}
		return connect.NewError(connect.CodeUnknown, err)
	}

	// 2. 调用领域方法（可能产生事件）
	if err := order.Complete(); err != nil {
		return connect.NewError(connect.CodeFailedPrecondition, err)
	}

	// 3. 持久化聚合
	if err := uc.repo.SaveOrder(ctx, order); err != nil {
		return fmt.Errorf("save order: %w", err)
	}

	// 4. 发布聚合产生的所有领域事件
	for _, evt := range order.Events() {
		if err := uc.eventBus.Publish("OrderCompleted", evt); err != nil {
			return fmt.Errorf("publish event: %w", err)
		}
	}

	// 5. 触发事件分发
	uc.eventBus.Store().Publish()

	return nil
}
```

### 步骤 6：初始化事件总线

在 `cmd/server/main.go` 中注册事件总线：

```go
package main

import (
	"github.com/lens077/ecommerce/backend/services/order/internal/biz/domain/events"
	"github.com/lens077/ecommerce/backend/services/order/internal/eventbus"
	"go.uber.org/fx"
)

func NewApp() *fx.App {
	return fx.New(
		// ... 其他模块 ...

		// 提供事件处理器映射
		fx.Provide(events.OrderCompletedHandlers),

		// 基于处理器映射创建 EventBus
		fx.Provide(eventbus.NewEventBus),

		// 配置 EventBus 的异步模式
		fx.Invoke(func(eb *eventbus.EventBus) {
			eb.Store().Async = true // 开启异步处理，Publish 立即返回
		}),
	)
}
```

---

## 订阅与消费

### 发布订阅模型

```
┌─────────────────────────────────────────────────────────┐
│                    Event Bus                            │
│                                                         │
│  Publish("OrderCompleted", payload)                     │
│                    │                                   │
│                    ▼                                   │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Event Store                         │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐            │   │
│  │  │ Event1 │ │ Event2 │ │ Event3 │ ...        │   │
│  │  └─────────┘ └─────────┘ └─────────┘            │   │
│  └─────────────────────────────────────────────────┘   │
│                    │                                   │
│                    ▼                                   │
│  ┌─────────────────────────────────────────────────┐   │
│  │            Dispatcher                            │   │
│  │  "OrderCompleted" ──▶ Handler1                  │   │
│  │                   ├──▶ Handler2                  │   │
│  │                   └──▶ Handler3                  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 多事件处理器示例

```go
func AllEventHandlers() GoEventBus.Dispatcher {
	return GoEventBus.Dispatcher{
		// 通知服务处理器
		"OrderCompleted": func(ctx context.Context, ev GoEventBus.Event) (GoEventBus.Result, error) {
			payload := ev.Data.(events.OrderCompletedPayload)
			// 发送订单完成通知
			notifyService.Send(ctx, payload.OrderId, "ORDER_COMPLETED")
			return GoEventBus.Result{Message: "notification sent"}, nil
		},

		// 积分服务处理器
		"OrderCompleted": func(ctx context.Context, ev GoEventBus.Event) (GoEventBus.Result, error) {
			payload := ev.Data.(events.OrderCompletedPayload)
			// 增加用户积分（每消费1元得1积分）
			points := int(payload.TotalAmount.IntPart())
			userService.AddPoints(ctx, payload.UserId, points)
			return GoEventBus.Result{Message: "points added"}, nil
		},

		// 库存服务处理器
		"OrderCompleted": func(ctx context.Context, ev GoEventBus.Event) (GoEventBus.Result, error) {
			payload := ev.Data.(events.OrderCompletedPayload)
			// 查询订单明细，扣减库存
			items := orderRepo.GetOrderItems(ctx, payload.OrderId)
			for _, item := range items {
				inventoryService.Reserve(ctx, item.SkuId, item.Quantity)
			}
			return GoEventBus.Result{Message: "inventory reserved"}, nil
		},
	}
}
```

### 使用投影（Projection）

GoEventBus 使用投影（Projection）来路由事件到不同的处理器：

```go
// 发布到特定投影
eventBus.Publish("NotifyUser", OrderCompletedPayload{...})
eventBus.Publish("AddPoints", OrderCompletedPayload{...})
eventBus.Publish("UpdateInventory", OrderCompletedPayload{...})

// 处理器根据投影名称处理
return GoEventBus.Dispatcher{
	"NotifyUser": func(ctx context.Context, ev GoEventBus.Event) (GoEventBus.Result, error) {
		// 只处理 NotifyUser 投影的事件
		return nil
	},
}
```

---

## 异步处理

### 配置异步模式

在 `main.go` 中启用异步处理：

```go
fx.Invoke(func(eb *eventbus.EventBus) {
	eb.Store().Async = true // Publish 立即返回，不阻塞
})
```

### 异步 vs 同步

| 模式 | 行为 | 适用场景 |
|------|------|---------|
| **同步** | `Publish()` 等待所有处理器执行完成 | 需要确认处理结果、测试场景 |
| **异步** | `Publish()` 立即返回，处理器在后台执行 | 高并发场景、性能要求高 |

### 异步处理流程

```go
// 应用层代码
func (uc *OrderCommandUseCase) CompleteOrder(ctx context.Context, orderNo string) error {
	// ... 业务逻辑 ...

	// 发布事件（立即返回，不阻塞）
	for _, evt := range order.Events() {
		uc.eventBus.Publish("OrderCompleted", evt)
	}

	// 触发分发（实际执行在后台）
	uc.eventBus.Store().Publish()

	// 立即返回给调用方，不等待事件处理完成
	return nil
}
```

### 后台处理器执行

```go
// 处理器异步执行
return GoEventBus.Dispatcher{
	"OrderCompleted": func(ctx context.Context, ev GoEventBus.Event) (GoEventBus.Result, error) {
		payload := ev.Data.(OrderCompletedPayload)

		// 异步执行以下操作：
		// 1. 查询用户信息
		user := userService.GetUser(ctx, payload.UserId)

		// 2. 发送通知（可能耗时）
		if err := notificationService.SendSMS(ctx, user.Phone, "您的订单已完成"); err != nil {
			// 错误不会阻塞主流程
			return GoEventBus.Result{Message: "notification failed"}, err
		}

		// 3. 增加积分
		pointsService.AddPoints(ctx, payload.UserId, calculatePoints(payload.TotalAmount))

		return GoEventBus.Result{Message: "ok"}, nil
	},
}
```

---

## 最佳实践

### 1. 事件幂等性

确保事件处理器可以安全地重复执行：

```go
"OrderCompleted": func(ctx context.Context, ev GoEventBus.Event) (GoEventBus.Result, error) {
	payload := ev.Data.(OrderCompletedPayload)

	// 使用事件ID检查是否已处理
	processed, err := checkIfProcessed(ctx, ev.ID)
	if err != nil {
		return GoEventBus.Result{}, err
	}
	if processed {
		return GoEventBus.Result{Message: "already processed"}, nil
	}

	// 执行业务逻辑
	if err := executeBusinessLogic(ctx, payload); err != nil {
		return GoEventBus.Result{}, err
	}

	// 标记为已处理
	if err := markAsProcessed(ctx, ev.ID); err != nil {
		return GoEventBus.Result{}, err
	}

	return GoEventBus.Result{Message: "ok"}, nil
}
```

### 2. 错误处理与重试

```go
"OrderCompleted": func(ctx context.Context, ev GoEventBus.Event) (GoEventBus.Result, error) {
	payload := ev.Data.(OrderCompletedPayload)

	maxRetries := 3
	for i := 0; i < maxRetries; i++ {
		if err := sendNotification(ctx, payload); err != nil {
			if i < maxRetries-1 {
				time.Sleep(time.Second * time.Duration(i+1)) // 指数退避
				continue
			}
			return GoEventBus.Result{Message: "max retries exceeded"}, err
		}
		break
	}

	return GoEventBus.Result{Message: "ok"}, nil
}
```

### 3. 事件版本管理

```go
type OrderCompletedPayload struct {
	Version int64  `json:"version"` // 事件版本，用于向前兼容
	// ... 其他字段
}

func (p *OrderCompletedPayload) Upgrade() {
	if p.Version < 2 {
		// 处理 v1 -> v2 的升级逻辑
		p.Version = 2
	}
}
```

### 4. 监控与告警

```go
"OrderCompleted": func(ctx context.Context, ev GoEventBus.Event) (GoEventBus.Result, error) {
	start := time.Now()
	payload := ev.Data.(OrderCompletedPayload)

	result, err := executeHandler(ctx, payload)

	duration := time.Since(start)

	// 记录监控指标
	metrics.RecordHandlerDuration("OrderCompleted", duration)
	metrics.IncrementHandlerCounter("OrderCompleted", err != nil)

	if err != nil {
		// 发送告警
		alerting.Notify("handler_failed", map[string]any{
			"event_id":  ev.ID,
			"handler":   "OrderCompleted",
			"error":     err.Error(),
			"order_id":  payload.OrderId,
		})
	}

	return result, err
}
```

### 5. 事务边界

事件发布应在事务提交之后：

```go
func (uc *OrderCommandUseCase) CompleteOrder(ctx context.Context, orderNo string) error {
	// 1. 加载聚合根
	order, _ := uc.repo.GetOrderByNo(ctx, orderNo)

	// 2. 执行业务逻辑
	order.Complete()

	// 3. 开启事务
	tx := uc.db.BeginTx(ctx)

	// 4. 保存订单（在事务内）
	uc.repo.SaveOrderTx(ctx, tx, order)

	// 5. 提交事务
	if err := tx.Commit(ctx); err != nil {
		return err
	}

	// 6. 事务提交后，才发布事件
	// 这是关键！确保数据已持久化才触发副作用
	for _, evt := range order.Events() {
		uc.eventBus.Publish("OrderCompleted", evt)
	}
	uc.eventBus.Store().Publish()

	return nil
}
```

---

## 故障排除

### 事件未处理

1. 检查 `main.go` 中是否正确注册了处理器
2. 确认 `NewEventBus` 是否在 `fx.Provide` 中
3. 验证 `handlers` 映射中的投影名称与 `Publish` 时的一致

### 事件重复消费

1. 使用事件 ID 进行幂等性检查
2. 考虑使用数据库事务确保处理状态的原子性

### 内存泄漏

1. 合理设置 EventStore 缓冲区大小：`NewEventStore(handlers, 1<<16, DropOldest)`
2. 选择合适的溢出策略：`DropOldest` / `DropNewest`

---

## 参考资料

- [GoEventBus GitHub](https://github.com/Protocol-Lattice/GoEventBus)
- [DDD 领域事件](https://martinfowler.com/eaaDev/DomainEvent.html)
- [事件驱动架构](https://docs.microsoft.com/en-us/azure/architecture/guide/architecture-styles/event-driven)
