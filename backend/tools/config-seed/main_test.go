package main

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

const fullBootstrap = `
server: {addr: ":30000"}
data:
  database: {postgres: {host: postgres}}
  cache: {redis: {host: redis}}
store: {minio: {endpoint: minio}}
pay: {alipay: {app_id: app}}
recommend: {gorse: {endpoint: gorse}}
observability: {enable: true}
discovery: {consul: {addr: consul}}
search: {elastic_search: {addresses: [es]}}
log: {application: {level: info}}
auth: {casdoor: {client_secret: secret}}
`

func TestCropBootstrapTopLevelSections(t *testing.T) {
	tests := map[string][]string{
		"address":   {"auth", "data", "discovery", "log", "observability", "search", "server"},
		"behavior":  {"auth", "data", "discovery", "log", "observability", "recommend", "server"},
		"cart":      {"data", "discovery", "log", "observability", "server", "store"},
		"inventory": {"data", "discovery", "log", "observability", "server"},
		"merchant":  {"auth", "data", "discovery", "log", "observability", "server"},
		"order":     {"data", "discovery", "log", "observability", "server"},
		"payment":   {"data", "discovery", "log", "observability", "pay", "server"},
		"product":   {"data", "discovery", "log", "observability", "recommend", "server"},
		"search":    {"auth", "data", "discovery", "log", "observability", "search", "server"},
		"user":      {"auth", "data", "discovery", "log", "observability", "server"},
	}

	for service, want := range tests {
		t.Run(service, func(t *testing.T) {
			contents, err := cropBootstrap(service, []byte(fullBootstrap))
			require.NoError(t, err)
			a, err := inspect(service, 0, contents)
			require.NoError(t, err)
			assert.Equal(t, want, a.sections)
		})
	}
}

func TestCropBootstrapPaymentDropsOnlyCacheFromData(t *testing.T) {
	contents, err := cropBootstrap("payment", []byte(fullBootstrap))
	require.NoError(t, err)

	var document map[string]any
	require.NoError(t, yaml.Unmarshal(contents, &document))
	data := document["data"].(map[string]any)
	assert.Contains(t, data, "database")
	assert.NotContains(t, data, "cache")
}

func TestCropBootstrapPreservesCredentialValues(t *testing.T) {
	contents, err := cropBootstrap("search", []byte(fullBootstrap))
	require.NoError(t, err)

	var document map[string]any
	require.NoError(t, yaml.Unmarshal(contents, &document))
	auth := document["auth"].(map[string]any)
	casdoor := auth["casdoor"].(map[string]any)
	assert.Equal(t, "secret", casdoor["client_secret"])
}

func TestCropBootstrapPreservesSectionOrder(t *testing.T) {
	contents, err := cropBootstrap("cart", []byte(fullBootstrap))
	require.NoError(t, err)

	text := string(contents)
	assert.Less(t, strings.Index(text, "server:"), strings.Index(text, "data:"))
	assert.Less(t, strings.Index(text, "data:"), strings.Index(text, "store:"))
	assert.Less(t, strings.Index(text, "store:"), strings.Index(text, "observability:"))
}

func TestCropBootstrapRejectsUnknownService(t *testing.T) {
	_, err := cropBootstrap("unknown", []byte(fullBootstrap))
	require.Error(t, err)
}
