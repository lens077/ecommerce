package main

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

const driftMatrixFixture = `
services:
  product: {external: [postgres, redis, gorse, config_center]}
  search:  {external: [elasticsearch, config_center]}
externals:
  postgres: {host: "pg-main-rw.postgresql.svc:5432", remote_dev: "pg-dev.example.com:30001"}
  redis: {host: "dragonfly.dragonfly.svc:6379", remote_dev: "redis-dev.example.com:30005"}
  gorse: {host: "gorse.example.com"}
  elasticsearch: {host: "http://elasticsearch.elasticsearch.svc.cluster.local:9200（集群内说明文字）", remote_dev: "https://es-dev.example.com"}
retired_externals:
  meilisearch: {former_host: "meilisearch.search.svc:7700"}
`

func loadDriftMatrix(t *testing.T) driftMatrix {
	t.Helper()
	var m driftMatrix
	require.NoError(t, yaml.Unmarshal([]byte(driftMatrixFixture), &m))
	return m
}

func auditYAML(t *testing.T, service, bootstrap string) []driftFinding {
	t.Helper()
	var doc map[string]any
	require.NoError(t, yaml.Unmarshal([]byte(bootstrap), &doc))
	findings, _ := auditDrift(service, doc, loadDriftMatrix(t))
	return findings
}

// 复现 2026-09-23:product/dev 的 gorse 还是退役前的 IP 直连端口,key 为空。
func TestAuditDrift_ReportsStaleGorseEndpointAndEmptyKey(t *testing.T) {
	findings := auditYAML(t, "product", `
data:
  database: {postgres: {host: pg-dev.example.com, port: 30001, password: fixture-password}}
  cache: {redis: {host: redis-dev.example.com, port: 30005}}
recommend:
  gorse: {enable: true, endpoint: "http://203.0.113.10:8088", api_key: ""}
`)

	kinds := map[string]string{}
	var out strings.Builder
	for _, f := range findings {
		kinds[f.path] = f.kind
		out.WriteString(f.String() + "\n")
	}
	assert.Equal(t, map[string]string{
		"recommend.gorse.endpoint": "IP_LITERAL",
		"recommend.gorse.api_key":  "EMPTY_SECRET",
	}, kinds)
	assert.NotContains(t, out.String(), "203.0.113.10", "IP 字面量必须打码")
}

// 正确配置(集群内地址或 remote_dev 入口)全部放行;任何配置值都不得出现在输出里。
func TestAuditDrift_AcceptsMatrixHostsAndNeverPrintsValues(t *testing.T) {
	product := auditYAML(t, "product", `
data:
  database: {postgres: {host: pg-main-rw.postgresql.svc, port: 5432, password: fixture-password}}
  cache: {redis: {host: redis-dev.example.com, port: 30005, password: fixture-redis}}
recommend:
  gorse: {enable: true, endpoint: "https://gorse.example.com", api_key: fixture-key}
`)
	search := auditYAML(t, "search", `
search:
  catalog: {endpoint: "https://es-dev.example.com", api_key: fixture-es-key}
`)
	assert.Empty(t, product)
	assert.Empty(t, search)

	// 同一份 Bootstrap 换成错误主机,确认输出只有主机与判定,没有凭据
	bad := auditYAML(t, "product", `
data:
  database: {postgres: {host: old-pg.example.com, port: 5432, password: fixture-password}}
recommend:
  gorse: {enable: true, endpoint: "https://gorse.example.com", api_key: fixture-key}
`)
	require.Len(t, bad, 1)
	line := bad[0].String()
	assert.Contains(t, line, "kind=NOT_IN_MATRIX")
	for _, secret := range []string{"fixture-password", "fixture-key"} {
		assert.NotContains(t, line, secret)
	}
}
