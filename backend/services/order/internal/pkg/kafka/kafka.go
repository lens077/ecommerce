package kafka

import (
	"context"

	confv1 "github.com/lens077/ecommerce/backend/services/order/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/config"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

var Module = fx.Module("kafka",
	fx.Provide(
		func(lc fx.Lifecycle, cfg *confv1.Bootstrap, logger *zap.Logger) (*Producer, error) {
			kafkaCfg := config.NewKafkaConfig(cfg)
			if kafkaCfg == nil || len(kafkaCfg.Brokers) == 0 {
				logger.Info("Kafka not configured, skipping producer initialization")
				return nil, nil
			}

			producer := NewProducer(kafkaCfg, logger)

			lc.Append(fx.Hook{
				OnStop: func(ctx context.Context) error {
					logger.Info("closing kafka producer...")
					return producer.Close()
				},
			})

			logger.Info("Kafka producer initialized",
				zap.Strings("brokers", kafkaCfg.Brokers),
				zap.String("topic", kafkaCfg.Topic),
			)

			return producer, nil
		},
	),
)
