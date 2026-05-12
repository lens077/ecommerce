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

// NewEventBus 创建单例事件总线，并注册所有处理器。
// handlers 是一个 map，key 可以是字符串或结构体（作为投影键）。
func NewEventBus(handlers GoEventBus.Dispatcher) *EventBus {
	once.Do(func() {
		bus = &EventBus{
			store: GoEventBus.NewEventStore(&handlers, 1<<16, GoEventBus.DropOldest),
		}
	})
	return bus
}

// GetBus 返回已初始化的 EventBus（需先调用 NewEventBus）。
func GetBus() *EventBus {
	return bus
}

// Publish 异步发布事件，将事件放入缓冲区并立即返回。
func (eb *EventBus) Publish(projection interface{}, data any) error {
	return eb.store.Subscribe(context.Background(), GoEventBus.Event{
		ID:         generateEventID(),
		Projection: projection,
		Data:       data,
	})
}

func (eb *EventBus) Store() *GoEventBus.EventStore {
	return eb.store
}

// generateEventID 生成唯一事件 ID。
func generateEventID() string {
	return fmt.Sprintf("evt_%d", time.Now().UnixNano())
}
