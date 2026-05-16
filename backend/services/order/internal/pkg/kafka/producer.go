package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/config"
	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type Producer struct {
	writer *kafka.Writer
	logger *zap.Logger
	topic  string
}

func NewProducer(cfg *config.KafkaConfig, logger *zap.Logger) *Producer {
	writer := &kafka.Writer{
		Addr:         kafka.TCP(cfg.Brokers...),
		Topic:        cfg.Topic,
		Balancer:     &kafka.LeastBytes{},
		BatchSize:    cfg.BatchSize,
		BatchTimeout: time.Duration(cfg.BatchTimeoutMs) * time.Millisecond,
		RequiredAcks: kafka.RequireAll,
		Async:        cfg.Async,
	}

	return &Producer{
		writer: writer,
		logger: logger,
		topic:  cfg.Topic,
	}
}

func (p *Producer) Publish(ctx context.Context, key string, value interface{}) error {
	data, err := json.Marshal(value)
	if err != nil {
		p.logger.Error("failed to marshal message", zap.Error(err))
		return fmt.Errorf("marshal message: %w", err)
	}

	msg := kafka.Message{
		Key:   []byte(key),
		Value: data,
		Time:  time.Now(),
	}

	err = p.writer.WriteMessages(ctx, msg)
	if err != nil {
		p.logger.Error("failed to write message to kafka",
			zap.String("topic", p.topic),
			zap.String("key", key),
			zap.Error(err),
		)
		return fmt.Errorf("write message: %w", err)
	}

	p.logger.Info("message published to kafka",
		zap.String("topic", p.topic),
		zap.String("key", key),
	)

	return nil
}

func (p *Producer) Close() error {
	if p.writer != nil {
		return p.writer.Close()
	}
	return nil
}
