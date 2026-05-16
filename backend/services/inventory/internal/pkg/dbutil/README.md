# 数据库错误处理使用指南

## 概述

这个包提供统一的 PostgreSQL 数据库错误处理方案，使用 `pqerror` 包中的常量替代硬编码的错误码，提供可读性强、易于维护的错误处理逻辑。

## 快速开始

### 1. 在 Data 层初始化错误处理器

```go
// internal/data/data.go
type Data struct {
    db           *pgxpool.Pool
    rdb          *redis.Client
    dbErrHandler *dbutil.Handler
    logger       *zap.Logger
}

func NewData(db *pgxpool.Pool, rdb *redis.Client, logger *zap.Logger) *Data {
    return &Data{
        db:           db,
        rdb:          rdb,
        logger:       logger,
        dbErrHandler: dbutil.NewHandler(
            dbutil.WithErrorMapping("23505", biz.ErrOrderAlreadyExists),
            dbutil.WithErrorMapping("23503", biz.ErrOrderNotFound),
            dbutil.WithLogging(true),
            dbutil.WithLogger(func(err error, pgErr *pgconn.PgError) {
                if pgErr != nil {
                    logger.Warn("database error",
                        zap.String("code", pgErr.Code),
                        zap.String("message", pgErr.Message),
                        zap.String("detail", pgErr.Detail),
                    )
                }
            }),
        ),
    }
}
```

### 2. 在 Repository 层使用错误处理器

#### 简化前（硬编码错误码）：

```go
func (u *inventoryRepo) Reserve(ctx context.Context, req biz.ReserveRequest) (*biz.ReserveResponse, error) {
    db := u.data.DB(ctx)

    stock, err := db.GetStockBySkuId(ctx, params)
    if err != nil {
        if pgErr, ok := errors.As[*pgconn.PgError](err); ok {
            switch pgErr.Code {
            case "02000":
                return nil, biz.ErrOrderNoNotFound
            default:
                return nil, fmt.Errorf("database error: %w", err)
            }
        }
        return nil, fmt.Errorf("database system error: %w", err)
    }

    _, err = u.data.db.Reserve(ctx, reserveParams)
    if err != nil {
        if pgErr, ok := errors.As[*pgconn.PgError](err); ok {
            switch pgErr.Code {
            case "23505":
                return nil, biz.ErrUniqueViolation
            default:
                return nil, fmt.Errorf("database error: %w", err)
            }
        }
        return nil, fmt.Errorf("database system error: %w", err)
    }

    return &biz.ReserveResponse{}, nil
}
```

#### 简化后（使用统一错误处理）：

```go
func (u *inventoryRepo) Reserve(ctx context.Context, req biz.ReserveRequest) (*biz.ReserveResponse, error) {
    db := u.data.DB(ctx)

    stock, err := db.GetStockBySkuId(ctx, params)
    if err != nil {
        return nil, u.data.dbErrHandler.MustHandleError(err)
    }

    _, err = u.data.db.Reserve(ctx, reserveParams)
    if err != nil {
        return nil, u.data.dbErrHandler.MustHandleError(err)
    }

    return &biz.ReserveResponse{}, nil
}
```

## 核心功能

### 1. Handler - 错误处理器

```go
handler := dbutil.NewHandler(
    // 添加自定义业务错误映射
    dbutil.WithErrorMapping("23505", biz.ErrUniqueViolation),
    dbutil.WithErrorMapping("23503", biz.ErrForeignKeyViolation),

    // 设置默认的 NotFound 错误（pgx.ErrNoRows）
    dbutil.WithNoRowsError(biz.ErrNotFound),

    // 自定义 NotFound 错误处理函数
    dbutil.WithNoRowsHandler(func(err error) error {
        return biz.ErrNotFound
    }),

    // 启用日志记录
    dbutil.WithLogging(true),

    // 自定义日志记录器
    dbutil.WithLogger(func(err error, pgErr *pgconn.PgError) {
        if pgErr != nil {
            logger.Info("database error occurred",
                zap.String("code", pgErr.Code),
                zap.String("message", pgErr.Message),
            )
        }
    }),
)
```

### 2. MustHandleError - 统一错误处理

自动将 PostgreSQL 错误码转换为可读性强的错误信息：

```go
err = db.QueryRow(ctx, "SELECT ...").Scan(&result)
if err != nil {
    return nil, handler.MustHandleError(err)
}
```

**自动处理的常见错误：**

| 错误码 | 错误类型 | 处理结果 |
|--------|---------|---------|
| `23505` | 唯一约束冲突 | "唯一约束冲突: {detail}" |
| `23503` | 外键约束冲突 | "外键约束冲突: {detail}" |
| `23502` | 非空约束冲突 | "非空约束冲突: 列 {column} 不能为空" |
| `40001` | 序列化失败 | "并发冲突，请重试" |
| `40P01` | 死锁检测 | "检测到死锁，请重试" |
| `57014` | 查询取消 | "查询超时" |
| `53000` | 连接数过多 | "连接数过多，请稍后重试" |

### 3. HandleError - 检查并处理错误

返回是否已处理该错误：

```go
err = db.Exec(ctx, "INSERT INTO ...")
if err != nil {
    bizErr, handled := handler.HandleError(err)
    if handled {
        return nil, bizErr  // 已映射到业务错误
    }
    return nil, fmt.Errorf("database error: %w", err)  // 未处理的错误
}
```

### 4. WrapError - 包装错误信息

为错误添加上下文信息：

```go
err = db.Exec(ctx, "INSERT INTO orders ...")
if err != nil {
    return nil, handler.WrapError(err, "创建订单失败")
}
```

## 处理 pgx.ErrNoRows（空结果集错误）

### 为什么需要特殊处理？

`pgx.ErrNoRows` 是 pgx 客户端库生成的错误，**不是** PostgreSQL 服务器返回的错误。当使用 `QueryRow` 查询不到数据时，pgx 会自动生成这个错误。

**错误类型区分：**
- ✅ `*pgconn.PgError` - PostgreSQL 服务器返回的错误（包含错误码）
- ❌ `pgx.ErrNoRows` - pgx 客户端生成的错误（没有错误码）

### 三种处理方式

#### 方式一：在 Handler 初始化时设置默认错误

```go
func NewData(pool *pgxpool.Pool, logger *zap.Logger) *Data {
    return &Data{
        queries: models.New(pool),
        dbErrHandler: dbutil.NewHandler(
            // 设置默认的 NotFound 错误
            dbutil.WithNoRowsError(biz.ErrNotFound),
            dbutil.WithLogging(true),
            dbutil.WithLogger(logger.Info),
        ),
    }
}
```

#### 方式二：使用自定义处理函数

```go
func NewData(pool *pgxpool.Pool, logger *zap.Logger) *Data {
    return &Data{
        queries: models.New(pool),
        dbErrHandler: dbutil.NewHandler(
            // 自定义处理函数，可以根据不同的表返回不同的错误
            dbutil.WithNoRowsHandler(func(err error) error {
                logger.Debug("not found", zap.Error(err))
                return biz.ErrNotFound
            }),
            dbutil.WithLogging(true),
        ),
    }
}
```

#### 方式三：在调用时传递特定错误（推荐）✅

**这是最灵活的方式**，可以在不同的方法中返回不同的 NotFound 错误：

```go
func (u *inventoryRepo) Reserve(ctx context.Context, req biz.ReserveRequest) (*biz.ReserveResponse, error) {
    db := u.data.DB(ctx)

    // 查询库存 - 找不到返回 ErrOrderNotFound
    stock, err := db.GetStockBySkuId(ctx, params)
    if err != nil {
        return nil, u.data.dbErrHandler.MustHandleError(err, biz.ErrOrderNotFound)
    }

    // 插入变更日志 - 重复插入返回 ErrSkuNotFound
    insertErr := u.data.db.InsertChangeLog(ctx, logParams)
    if insertErr != nil {
        return nil, u.data.dbErrHandler.MustHandleError(insertErr, biz.ErrSkuNotFound)
    }

    return &biz.ReserveResponse{}, nil
}
```

### 优先级说明

处理 `pgx.ErrNoRows` 的优先级顺序：

1. **调用时传入的参数** ✅ 最高优先级
   ```go
   handler.MustHandleError(err, biz.ErrOrderNotFound)
   ```

2. **`NoRowsHandler` 函数**
   ```go
   dbutil.WithNoRowsHandler(func(err error) error {
       return biz.ErrCustomNotFound
   })
   ```

3. **`NoRowsError` 字段**
   ```go
   dbutil.WithNoRowsError(biz.ErrDefaultNotFound)
   ```

4. **默认返回** - 返回 `"not found"` 字符串

### 实际应用场景

```go
type inventoryRepo struct {
    data *Data
}

func (u *inventoryRepo) GetStock(ctx context.Context, merchantID, skuID string) (*biz.Stock, error) {
    stock, err := u.data.queries.GetStockBySkuId(ctx, models.GetStockBySkuIdParams{
        MerchantID: merchantID,
        SkuID:      skuID,
    })
    if err != nil {
        // 库存不存在
        return nil, u.data.dbErrHandler.MustHandleError(err, biz.ErrStockNotFound)
    }
    return stock, nil
}

func (u *inventoryRepo) GetOrder(ctx context.Context, orderNo string) (*biz.Order, error) {
    order, err := u.data.queries.GetOrderByOrderNo(ctx, orderNo)
    if err != nil {
        // 订单不存在
        return nil, u.data.dbErrHandler.MustHandleError(err, biz.ErrOrderNotFound)
    }
    return order, nil
}

func (u *inventoryRepo) InsertLog(ctx context.Context, params models.InsertChangeLogParams) error {
    insertErr := u.data.queries.InsertChangeLog(ctx, params)
    if insertErr != nil {
        // 重复插入（幂等操作）
        return u.data.dbErrHandler.MustHandleError(insertErr, biz.ErrLogAlreadyExists)
    }
    return nil
}
```

## 常用 PostgreSQL 错误码

### 完整性约束错误（Class 23）

```go
pqerror.UniqueViolation         // 23505 - 唯一约束冲突
pqerror.ForeignKeyViolation    // 23503 - 外键约束冲突
pqerror.NotNullViolation      // 23502 - 非空约束冲突
pqerror.CheckViolation        // 23514 - 检查约束冲突
pqerror.RestrictViolation     // 23001 - 限制约束冲突
pqerror.ExclusionViolation    // 23P01 - 排他约束冲突
```

### 事务相关错误

```go
pqerror.SerializationFailure   // 40001 - 序列化失败（并发冲突）
pqerror.TRDeadlockDetected    // 40P01 - 检测到死锁
pqerror.LockNotAvailable      // 55P03 - 锁不可用
pqerror.ReadOnlySQLTransaction // 25006 - 只读事务中不能执行写操作
pqerror.TransactionRollback   // 40000 - 事务回滚
```

### 资源相关错误

```go
pqerror.TooManyConnections    // 53300 - 连接数过多
pqerror.DiskFull             // 53100 - 磁盘空间不足
pqerror.OutOfMemory          // 53200 - 内存不足
pqerror.StatementTooComplex   // 54001 - 语句太复杂
pqerror.QueryCanceled         // 57014 - 查询被取消
```

### 对象不存在错误

```go
pqerror.UndefinedTable        // 42P01 - 表不存在
pqerror.UndefinedColumn       // 42703 - 列不存在
pqerror.UndefinedFunction     // 42883 - 函数不存在
pqerror.UndefinedObject       // 42704 - 对象不存在
```

### 重复对象错误

```go
pqerror.DuplicateTable        // 42P07 - 表已存在
pqerror.DuplicateColumn       // 42701 - 列已存在
pqerror.DuplicateFunction     // 42723 - 函数已存在
pqerror.DuplicateObject      // 42710 - 对象已存在
```

## 最佳实践

### 1. 在 Data 层统一管理错误处理器

```go
// internal/data/data.go
type Data struct {
    queries      *models.Queries
    dbErrHandler *dbutil.Handler
}

func NewData(pool *pgxpool.Pool, logger *zap.Logger) *Data {
    return &Data{
        queries: models.New(pool),
        dbErrHandler: dbutil.NewHandler(
            dbutil.WithLogging(true),
            dbutil.WithLogger(func(err error, pgErr *pgconn.PgError) {
                logger.Error("database error",
                    zap.String("code", pgErr.Code),
                    zap.Error(err),
                )
            }),
        ),
    }
}
```

### 2. 在 Repository 层注入错误处理器

```go
type inventoryRepo struct {
    queries      *models.Queries
    dbErrHandler *dbutil.Handler
}

func NewInventoryRepo(data *Data) biz.InventoryRepo {
    return &inventoryRepo{
        queries:      data.queries,
        dbErrHandler: data.dbErrHandler,
    }
}
```

### 3. 业务层定义业务错误

```go
// internal/biz/errors.go
package biz

import "errors"

var (
    ErrInsufficientStock    = errors.New("库存不足")
    ErrOrderNotFound       = errors.New("订单不存在")
    ErrOrderAlreadyExists  = errors.New("订单已存在")
    ErrConcurrentConflict  = errors.New("并发冲突，请重试")
    ErrDeadlockDetected   = errors.New("检测到死锁，请重试")
)
```

### 4. 在 Data 层配置业务错误映射

```go
// internal/data/data.go
func NewData(pool *pgxpool.Pool, logger *zap.Logger) *Data {
    return &Data{
        queries: models.New(pool),
        dbErrHandler: dbutil.NewHandler(
            dbutil.WithErrorMapping("23505", biz.ErrOrderAlreadyExists),
            dbutil.WithErrorMapping("23503", biz.ErrOrderNotFound),
            dbutil.WithErrorMapping("40001", biz.ErrConcurrentConflict),
            dbutil.WithErrorMapping("40P01", biz.ErrDeadlockDetected),
            dbutil.WithLogging(true),
            dbutil.WithLogger(logger.Error),
        ),
    }
}
```

## 优势

1. **可读性强**：使用有意义的常量名，如 `pqerror.UniqueViolation` 而非 `"23505"`
2. **易于维护**：错误处理逻辑集中在 Handler 中
3. **易于扩展**：通过 `WithErrorMapping` 轻松添加新的错误映射
4. **日志支持**：可选的错误日志记录功能
5. **类型安全**：避免硬编码字符串导致的错误
