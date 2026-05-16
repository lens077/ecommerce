# Kafka 进程间通信实现文档

## 概述

本文档描述了订单服务如何通过 Kafka 实现进程间通信，将订单创建事件（`OrderCreatedEvent`）发送到库存服务。

## 📋 实现步骤拆解

### 步骤 1: 添加 Kafka 依赖

```bash
cd backend && go get github.com/segmentio/kafka-go@latest
```

添加到 `go.mod`:
```go
require github.com/segmentio/kafka-go v0.4.51
```

### 步骤 2: 创建 Kafka 生产者封装

创建文件: `internal/pkg/kafka/producer.go`

```go
// Kafka 生产者实现
type Producer struct {
    writer *kafka.Writer
    logger *zap.Logger
    topic  string
}

func NewProducer(cfg *config.KafkaConfig, logger *zap.Logger) *Producer
func (p *Producer) Publish(ctx context.Context, key string, value interface{}) error
func (p *Producer) Close() error
```

### 步骤 3: 定义事件结构

创建文件: `internal/pkg/kafka/events.go`

```go
type OrderCreatedEvent struct {
    EventID     string          // 事件唯一ID
    OrderID     int64           // 订单ID
    OrderNo     string          // 订单号
    UserID      uuid.UUID       // 用户ID
    SKUItems    []SKUCartItem  // SKU列表
    TotalAmount float64         // 订单总金额
    CreatedAt   time.Time       // 创建时间
}
```

### 步骤 4: 配置 Kafka 参数

修改 `internal/conf/v1/conf.proto` 添加 Kafka 配置:

```protobuf
message Kafka {
  repeated string brokers = 1;      // Kafka 地址列表
  string topic = 2;                  // Topic 名称
  int32 batch_size = 3;              // 批量发送大小
  int64 batch_timeout_ms = 4;        // 批量超时(毫秒)
  bool async = 5;                    // 是否异步发送
}
```

### 步骤 5: 集成到 FX 框架

创建文件: `internal/pkg/kafka/kafka.go`

```go
var Module = fx.Module("kafka",
    fx.Provide(
        func(lc fx.Lifecycle, cfg *confv1.Bootstrap, logger *zap.Logger) (*Producer, error) {
            // 初始化 Kafka 生产者
        },
    ),
)
```

在 `cmd/server/main.go` 中注册模块:

```go
registry.Module, // 服务注册/发现
kafka.Module,   // Kafka 消息队列
```

### 步骤 6: 在订单创建时发布事件

修改 `internal/biz/application/order.go`:

```go
func (uc *OrderCommandUseCase) CreateOrder(ctx context.Context, req *domain.CreateOrderRequest) (*domain.CreateOrderResponse, error) {
    // 创建事件
    event := kafka.OrderCreatedEvent{
        EventID:     fmt.Sprintf("evt_%d", time.Now().UnixNano()),
        OrderID:     orderID,
        OrderNo:     orderNo,
        UserID:      userID,
        SKUItems:    skuItems,
        TotalAmount: totalAmount,
        CreatedAt:   time.Now(),
    }
    
    // 发布事件
    if uc.producer != nil {
        uc.producer.Publish(ctx, orderNo, event)
    }
}
```

## ⚙️ 操作步骤

### 1. 配置 Kafka

在 Consul 配置中心或本地配置文件中添加:

```yaml
kafka:
  brokers:
    - "192.168.3.120:9092"  # Kafka 地址
  topic: "order-events"       # Topic 名称
  batch_size: 1              # 批量大小
  batch_timeout_ms: 10       # 批量超时(毫秒)
  async: true                # 异步发送
```

### 2. 创建 Kafka Topic

```bash
# 在 Kafka 服务器上执行
kafka-topics.sh --create \
  --topic order-events \
  --bootstrap-server 192.168.3.120:9092 \
  --partitions 3 \
  --replication-factor 1
```

### 3. 启动订单服务

```bash
cd backend/services/order
make dev
```

### 4. 验证消息发送

使用 Kafka 控制台消费者验证:

```bash
kafka-console-consumer.sh \
  --topic order-events \
  --bootstrap-server 192.168.3.120:9092 \
  --from-beginning
```

## 📤 生产事件

### OrderCreatedEvent 事件结构

| 字段 | 类型 | 说明 |
|------|------|------|
| EventID | string | 事件唯一标识符 |
| OrderID | int64 | 订单主键ID |
| OrderNo | string | 订单业务编号 |
| UserID | uuid.UUID | 用户ID |
| SKUItems | []SKUCartItem | SKU列表 |
| TotalAmount | float64 | 订单总金额 |
| CreatedAt | time.Time | 事件创建时间 |

### SKUCartItem 结构

| 字段 | 类型 | 说明 |
|------|------|------|
| SkuID | int64 | SKU ID |
| SpuID | int64 | SPU ID |
| Quantity | int | 购买数量 |
| Price | float64 | 单价 |

### 消息格式

```json
{
  "event_id": "evt_1715836800000000000",
  "order_id": 12345,
  "order_no": "OM20260516123456",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "sku_items": [
    {"sku_id": 1001, "spu_id": 101, "quantity": 2, "price": 99.99},
    {"sku_id": 1002, "spu_id": 102, "quantity": 1, "price": 49.99}
  ],
  "total_amount": 249.97,
  "created_at": "2026-05-16T10:00:00Z"
}
```

### 发布逻辑

在 `OrderCommandUseCase.CreateOrder` 方法中:

1. **创建订单** - 执行订单创建业务逻辑
2. **构建事件** - 根据订单信息构建 `OrderCreatedEvent`
3. **发布事件** - 调用 Kafka 生产者发布消息
4. **错误处理** - 发布失败记录日志但不影响订单创建

```go
// 使用订单号作为消息 key，保证同订单消息顺序
if err := uc.producer.Publish(ctx, orderNo, event); err != nil {
    uc.log.Error("failed to publish OrderCreatedEvent", zap.Error(err))
    // 不返回错误，事件发布失败不应影响订单创建
}
```

## 📥 消费事件

### 在库存服务中实现消费者

以下是库存服务消费订单创建事件的示例代码:

```go
package kafka

import (
    "context"
    "encoding/json"
    "fmt"
    "time"

    "github.com/segmentio/kafka-go"
    "go.uber.org/zap"
)

type Consumer struct {
    reader *kafka.Reader
    logger *zap.Logger
}

func NewConsumer(brokers []string, topic string, groupID string, logger *zap.Logger) *Consumer {
    reader := kafka.NewReader(kafka.ReaderConfig{
        Brokers:     brokers,
        Topic:       topic,
        GroupID:     groupID,
        MinBytes:    10e3, // 10KB
        MaxBytes:    10e6, // 10MB
        StartOffset: kafka.FirstOffset,
        MaxWait:     10 * time.Second,
    })

    return &Consumer{
        reader: reader,
        logger: logger,
    }
}

type OrderCreatedEvent struct {
    EventID     string          `json:"event_id"`
    OrderID     int64           `json:"order_id"`
    OrderNo     string          `json:"order_no"`
    UserID      string          `json:"user_id"`
    SKUItems    []SKUCartItem  `json:"sku_items"`
    TotalAmount float64         `json:"total_amount"`
    CreatedAt   time.Time       `json:"created_at"`
}

type SKUCartItem struct {
    SkuID    int64   `json:"sku_id"`
    SpuID    int64   `json:"spu_id"`
    Quantity int     `json:"quantity"`
    Price    float64 `json:"price"`
}

func (c *Consumer) Consume(ctx context.Context, handler func(*OrderCreatedEvent) error) error {
    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        default:
            msg, err := c.reader.FetchMessage(ctx)
            if err != nil {
                c.logger.Error("failed to fetch message", zap.Error(err))
                continue
            }

            var event OrderCreatedEvent
            if err := json.Unmarshal(msg.Value, &event); err != nil {
                c.logger.Error("failed to unmarshal event", zap.Error(err))
                if err := c.reader.CommitMessages(ctx, msg); err != nil {
                    c.logger.Error("failed to commit message", zap.Error(err))
                }
                continue
            }

            c.logger.Info("received OrderCreatedEvent",
                zap.String("order_no", event.OrderNo),
                zap.Int64("order_id", event.OrderID),
            )

            if err := handler(&event); err != nil {
                c.logger.Error("failed to process event",
                    zap.String("order_no", event.OrderNo),
                    zap.Error(err),
                )
            }

            if err := c.reader.CommitMessages(ctx, msg); err != nil {
                c.logger.Error("failed to commit message", zap.Error(err))
            }
        }
    }
}

func (c *Consumer) Close() error {
    return c.reader.Close()
}
```

### 消费处理逻辑

```go
func handleOrderCreatedEvent(event *OrderCreatedEvent) error {
    // 1. 遍历 SKU 列表，扣减库存
    for _, item := range event.SKUItems {
        err := inventoryService.DeductStock(item.SkuID, item.Quantity)
        if err != nil {
            // 处理库存不足等业务异常
            return fmt.Errorf("deduct stock failed for sku %d: %w", item.SkuID, err)
        }
    }
    
    // 2. 记录库存变动日志
    err := inventoryService.LogStockChange(event.OrderID, event.SKUItems)
    if err != nil {
        return fmt.Errorf("log stock change failed: %w", err)
    }
    
    return nil
}
```

## 🔧 配置说明

### Kafka 配置参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| brokers | []string | - | Kafka 地址列表 |
| topic | string | - | Topic 名称 |
| batch_size | int | 1 | 批量发送大小 |
| batch_timeout_ms | int64 | 10 | 批量超时(毫秒) |
| async | bool | true | 是否异步发送 |

### 配置示例

```yaml
kafka:
  brokers:
    - "192.168.3.120:9092"
  topic: "order-events"
  batch_size: 1
  batch_timeout_ms: 10
  async: true
```

## 📁 文件结构

```
internal/pkg/kafka/
├── producer.go     # Kafka 生产者实现
├── events.go       # 事件定义
└── kafka.go        # FX 模块注册

internal/pkg/config/
└── kafka_config.go # Kafka 配置加载

internal/conf/v1/
├── conf.proto      # 配置定义(新增 Kafka 消息)
└── conf.pb.go      # 自动生成的配置结构体

internal/biz/application/
└── order.go        # 订单用例(集成事件发布)

cmd/server/
└── main.go         # 应用入口(注册 Kafka 模块)
```

## ⚡ 特性亮点

### 1. 零配置启动
- Kafka 配置可选
- 未配置时服务正常启动，跳过事件发布

### 2. 优雅降级
- Kafka 发布失败不影响订单创建
- 只记录错误日志，保证业务连续性

### 3. 异步处理
- 支持异步发送模式
- 不阻塞主业务逻辑

### 4. 完整日志
- 所有关键操作都有日志记录
- 便于排查问题

### 5. FX 集成
- 深度集成 Uber FX 框架
- 支持依赖注入和生命周期管理

## 📝 下一步建议

### 1. 实现库存服务消费者
- 在库存服务中创建 Kafka 消费者
- 订阅 `order-events` Topic
- 实现库存扣减逻辑

### 2. 添加重试机制
- 实现消息发送失败的重试机制
- 考虑使用死信队列处理无法消费的消息

### 3. 添加监控
- 集成 Kafka 监控指标
- 跟踪消息发送成功率、延迟等

### 4. 消息序列化优化
- 考虑使用 Protobuf 或 Avro 代替 JSON
- 提高消息传输效率和压缩率

### 5. 事务支持
- 如果需要强一致性，考虑使用 Kafka 事务
- 确保订单创建和消息发布的原子性

### 6. 多环境配置
- 为不同环境(dev/pre/prod)配置不同的 Kafka 地址
- 考虑使用环境变量覆盖配置

## 🔌 依赖说明

| 依赖 | 版本 | 用途 |
|------|------|------|
| github.com/segmentio/kafka-go | v0.4.51 | Kafka 客户端 |
| go.uber.org/fx | v1.24.0 | 依赖注入框架 |
| go.uber.org/zap | v1.28.0 | 日志库 |
| google.golang.org/protobuf | v1.36.11 | Protobuf 支持 |

## 📜 许可证

MIT License

---

*文档版本: v1.0*  
*最后更新: 2026-05-16*