package log

import (
	"testing"

	confv1 "github.com/lens077/ecommerce/backend/services/product/internal/conf/v1"
	"github.com/stretchr/testify/assert"
)

func TestOptionsFromBootstrap(t *testing.T) {
	bootstrap := &confv1.Bootstrap{Log: &confv1.Log{
		Application: &confv1.Log_Application{Level: "warn", Format: "json"},
		Framework:   &confv1.Log_Framework{LogLevel: "info", ErrorLevel: "error"},
	}}
	options := optionsFromBootstrap(bootstrap)
	assert.Equal(t, "warn", options.Level)
	assert.Equal(t, "json", options.Format)
	assert.Equal(t, "info", options.FrameworkLogLevel)
	assert.Equal(t, "error", options.FrameworkErrorLevel)
}
