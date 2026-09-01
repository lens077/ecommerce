package searchindex

// 针对真实 Elasticsearch 的集成测试。
//
// 为什么需要它：本包其余测试全部用 fake transport，能证明「代码按预期发请求」，
// 但证明不了「ES 按预期接受这些请求」。mapping 是否真的 strict、IK 分词器是否真的
// 装了、alias 切换是否真的原子、delete 缺文档是否真的返回 not_found —— 这些只有
// 打真实 ES 才知道。2026-09-01 Meilisearch→ES 迁移完成时，全仓没有任何一行代码
// 碰过真实 ES，这个文件补上那个缺口。
//
// 运行方式（ES 只监听 node3 回环，需先开隧道）：
//
//	ssh -f -N -L 9201:127.0.0.1:9200 node3
//	ES_INTEGRATION_URL=http://127.0.0.1:9201 \
//	ES_INTEGRATION_API_KEY=<indexer key> \
//	go test -count=1 -run Integration ./pkg/searchindex/
//
// 缺环境变量或 -short 时自动跳过，因此 CI 的 `go test -short ./...` 不受影响。

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

type itEnv struct {
	url    string
	apiKey string
	client *Client
	alias  string
}

func newITEnv(t *testing.T) *itEnv {
	t.Helper()
	if testing.Short() {
		t.Skip("集成测试在 -short 下跳过")
	}
	url := os.Getenv("ES_INTEGRATION_URL")
	key := os.Getenv("ES_INTEGRATION_API_KEY")
	if url == "" || key == "" {
		t.Skip("未设置 ES_INTEGRATION_URL / ES_INTEGRATION_API_KEY，跳过集成测试")
	}

	c, err := NewClient(ClientConfig{
		Endpoint:       url,
		APIKey:         key,
		RequestTimeout: 15 * time.Second,
	})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	// 别名带纳秒后缀，避免并发运行互相踩；前缀落在 indexer key 的
	// ecommerce_catalog_* 授权范围内。
	env := &itEnv{
		url:    url,
		apiKey: key,
		client: c,
		alias:  fmt.Sprintf("ecommerce_catalog_it_%d", time.Now().UnixNano()),
	}
	t.Cleanup(func() { env.cleanup(t) })
	return env
}

// raw 直接打 ES，用于断言 mapping/settings 这类客户端不暴露的事实。
func (e *itEnv) raw(t *testing.T, method, path string, body string) (int, map[string]any) {
	t.Helper()
	var rdr io.Reader
	if body != "" {
		rdr = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, e.url+path, rdr)
	if err != nil {
		t.Fatalf("构造请求: %v", err)
	}
	req.Header.Set("Authorization", "ApiKey "+e.apiKey)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer func() { _ = resp.Body.Close() }()
	raw, _ := io.ReadAll(resp.Body)
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	return resp.StatusCode, out
}

func (e *itEnv) cleanup(t *testing.T) {
	t.Helper()
	// 必须先把 alias 解析成具体索引名，再逐个按精确名删除。
	//
	// 不能用通配：本集群 action.destructive_requires_name=true（ES 8+ 默认，
	// 2026-09-01 实测），任何带 * 的删除一律 400，一个都删不掉。这个设置是对的，
	// 不要为了测试方便去关它。
	code, body := e.raw(t, http.MethodGet, "/_alias/"+e.alias, "")
	if code == http.StatusNotFound {
		return
	}
	if code != http.StatusOK {
		t.Logf("解析 alias %s 返回 %d，可能有残留索引需人工清理", e.alias, code)
		return
	}
	for index := range body {
		c, _ := e.raw(t, http.MethodDelete, "/"+index, "")
		if c >= 300 && c != http.StatusNotFound {
			t.Logf("删除索引 %s 返回 %d，请人工确认", index, c)
		}
	}
}

func dig(m map[string]any, path ...string) any {
	var cur any = m
	for _, p := range path {
		mm, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = mm[p]
	}
	return cur
}

// 断言 EnsureIndex 建出来的 mapping/settings 与定稿契约一致。
// 这三条是被历史事故换来的，见 pkg/searchindex 头注释。
func TestIntegrationEnsureIndexMappingContract(t *testing.T) {
	env := newITEnv(t)
	ctx := context.Background()

	if err := env.client.EnsureIndex(ctx, env.alias); err != nil {
		t.Fatalf("EnsureIndex: %v", err)
	}

	code, body := env.raw(t, http.MethodGet, "/"+env.alias+"/_mapping", "")
	if code != http.StatusOK {
		t.Fatalf("读 mapping 返回 %d", code)
	}
	// 响应以物理索引名为键，取第一个。
	var mp map[string]any
	for _, v := range body {
		if m, ok := v.(map[string]any); ok {
			mp, _ = dig(m, "mappings").(map[string]any)
		}
		break
	}
	if mp == nil {
		t.Fatalf("mapping 结构异常: %v", body)
	}

	if got := mp["dynamic"]; got != "strict" {
		t.Errorf("dynamic 应为 strict，实际 %v —— 非 strict 会让未预期字段静默进库", got)
	}

	props, _ := mp["properties"].(map[string]any)
	checks := []struct {
		field, key string
		want       any
	}{
		{"id", "type", "long"},
		{"price", "type", "scaled_float"},
		{"sale_count", "type", "long"},
		{"name", "analyzer", "ik_max_word"},
		{"name", "search_analyzer", "ik_smart"},
		{"description", "analyzer", "ik_max_word"},
	}
	for _, c := range checks {
		if got := dig(props, c.field, c.key); got != c.want {
			t.Errorf("%s.%s = %v，期望 %v", c.field, c.key, got, c.want)
		}
	}

	code, sb := env.raw(t, http.MethodGet, "/"+env.alias+"/_settings", "")
	if code != http.StatusOK {
		t.Fatalf("读 settings 返回 %d", code)
	}
	for _, v := range sb {
		m, _ := v.(map[string]any)
		idx, _ := dig(m, "settings", "index").(map[string]any)
		if got := dig(idx, "translog", "durability"); got != "request" {
			t.Errorf("translog.durability = %v，期望 request —— ACK 的持久性依赖它", got)
		}
		if got := idx["number_of_replicas"]; got != "0" {
			t.Errorf("number_of_replicas = %v，期望 \"0\" —— 单节点否则永远 yellow", got)
		}
		break
	}
}

// dynamic:strict 必须真的拒绝未知字段，而不只是写在 mapping 里。
func TestIntegrationStrictMappingRejectsUnknownField(t *testing.T) {
	env := newITEnv(t)
	if err := env.client.EnsureIndex(context.Background(), env.alias); err != nil {
		t.Fatalf("EnsureIndex: %v", err)
	}
	code, body := env.raw(t, http.MethodPost, "/"+env.alias+"/_doc/999",
		`{"id":999,"totally_unexpected_field":"x"}`)
	if code < 400 {
		t.Fatalf("写入未知字段应被拒绝，实际 HTTP %d，响应 %v", code, body)
	}
}

// 写入幂等、检索可达、删除幂等 —— 覆盖 ACK 语义依赖的三个前提。
func TestIntegrationIndexSearchDeleteIdempotency(t *testing.T) {
	env := newITEnv(t)
	ctx := context.Background()
	if err := env.client.EnsureIndex(ctx, env.alias); err != nil {
		t.Fatalf("EnsureIndex: %v", err)
	}

	doc := Doc{
		ID:           4242,
		SpuCode:      "IT-SPU-4242",
		Name:         "集成测试商品 中文分词",
		Description:  "用于验证 IK 分词器与 strict mapping 的测试文档",
		Status:       "online",
		MainMediaURL: "https://example.com/it.png",
		MerchantID:   "m-it",
		Price:        199.95,
		SaleCount:    7,
		UpdatedAt:    time.Now().UTC().Format(time.RFC3339),
	}

	// 重复投递同一文档：显式 _id 覆盖，不应产生第二篇。
	for i := 0; i < 2; i++ {
		if err := env.client.IndexDocument(ctx, env.alias, doc); err != nil {
			t.Fatalf("第 %d 次 IndexDocument: %v", i+1, err)
		}
	}
	env.raw(t, http.MethodPost, "/"+env.alias+"/_refresh", "")

	code, cnt := env.raw(t, http.MethodGet, "/"+env.alias+"/_count", "")
	if code != http.StatusOK {
		t.Fatalf("_count 返回 %d", code)
	}
	if n, _ := cnt["count"].(float64); n != 1 {
		t.Errorf("重复投递后文档数 = %v，期望 1（显式 _id 应幂等覆盖）", cnt["count"])
	}

	// 中文检索必须命中，否则说明 IK 没生效、退化成单字切分。
	docs, err := env.client.SearchProducts(ctx, env.alias, "分词", 10)
	if err != nil {
		t.Fatalf("SearchProducts: %v", err)
	}
	if len(docs) != 1 || docs[0].ID != doc.ID {
		t.Fatalf("中文检索未命中，返回 %d 篇: %+v", len(docs), docs)
	}
	if docs[0].Price != doc.Price || docs[0].SaleCount != doc.SaleCount {
		t.Errorf("投影字段回读不一致: price=%v sale_count=%v", docs[0].Price, docs[0].SaleCount)
	}

	if err := env.client.Health(ctx, env.alias); err != nil {
		t.Errorf("Health: %v", err)
	}

	// 删除后再删一次：缺文档必须当作幂等成功，否则消费者会卡在毒消息上。
	if err := env.client.DeleteDocument(ctx, env.alias, doc.ID); err != nil {
		t.Fatalf("首次 DeleteDocument: %v", err)
	}
	if err := env.client.DeleteDocument(ctx, env.alias, doc.ID); err != nil {
		t.Errorf("重复 DeleteDocument 应幂等成功，实际: %v", err)
	}

	env.raw(t, http.MethodPost, "/"+env.alias+"/_refresh", "")
	_, cnt2 := env.raw(t, http.MethodGet, "/"+env.alias+"/_count", "")
	if n, _ := cnt2["count"].(float64); n != 0 {
		t.Errorf("删除后文档数 = %v，期望 0", cnt2["count"])
	}
}

// 缺失 alias 必须报错而不是被当成幂等成功 —— 区分「文档不存在」与「索引没了」。
func TestIntegrationDeleteOnMissingAliasFails(t *testing.T) {
	env := newITEnv(t)
	err := env.client.DeleteDocument(context.Background(), env.alias+"_nonexistent", 1)
	if err == nil {
		t.Fatal("对不存在的 alias 删除应报错，实际返回 nil —— 索引丢失会被静默吞掉")
	}
}
