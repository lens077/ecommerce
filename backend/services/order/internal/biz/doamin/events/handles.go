package events

import (
	"context"
	"log"

	"github.com/Protocol-Lattice/GoEventBus"
)

// OrderCompletedHandlers 返回订单完成事件相关的处理器映射
func OrderCompletedHandlers() GoEventBus.Dispatcher {
	return GoEventBus.Dispatcher{
		"OrderCompleted": func(ctx context.Context, ev GoEventBus.Event) (GoEventBus.Result, error) {
			payload := ev.Data.(OrderCompletedPayload)
			// 执行副作用：发送通知、增加积分等
			log.Printf("[Event] Order %s completed for user %s, amount=%.2f",
				payload.OrderId,
				payload.UserId,
				payload.SpuId,
				payload.Quantity,
				payload.TotalAmount,
			)
			return GoEventBus.Result{Message: "ok"}, nil
		},
		// 可添加更多事件处理器...
	}
}
