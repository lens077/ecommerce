package config

import (
	confv1 "github.com/lens077/ecommerce/backend/services/order/internal/conf/v1"
)

type KafkaConfig struct {
	Brokers       []string
	Topic         string
	BatchSize     int
	BatchTimeoutMs int64
	Async         bool
}

func NewKafkaConfig(conf *confv1.Bootstrap) *KafkaConfig {
	if conf.Kafka == nil {
		return nil
	}

	return &KafkaConfig{
		Brokers:       conf.Kafka.Brokers,
		Topic:         conf.Kafka.Topic,
		BatchSize:     int(conf.Kafka.BatchSize),
		BatchTimeoutMs: conf.Kafka.BatchTimeoutMs,
		Async:         conf.Kafka.Async,
	}
}
