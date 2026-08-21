package data

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/lens077/ecommerce/backend/services/search/internal/biz"
	confv1 "github.com/lens077/ecommerce/backend/services/search/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/search/internal/pkg/config"
	"github.com/meilisearch/meilisearch-go"
	"github.com/stretchr/testify/require"
	"go.uber.org/fx/fxtest"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"
)

type fakeSearchEngine struct {
	response  *meilisearch.SearchResponse
	searchErr error
	healthErr error
	query     string
}

func (f *fakeSearchEngine) Search(_ context.Context, query string) (*meilisearch.SearchResponse, error) {
	f.query = query
	return f.response, f.searchErr
}

func (f *fakeSearchEngine) Health(context.Context) error {
	return f.healthErr
}

func TestSearchRepoMapsCanonicalDocument(t *testing.T) {
	engine := &fakeSearchEngine{response: &meilisearch.SearchResponse{
		Hits: meilisearch.Hits{newHit(t, map[string]any{
			"id":             42,
			"spu_code":       "SPU-42",
			"name":           "鲁班灯",
			"status":         "online",
			"main_media_url": "https://example.test/42.webp",
			"price":          199.5,
			"sale_count":     17,
		})},
	}}
	repo := searchRepo{
		data: &Data{search: engine},
		log:  zap.NewNop(),
	}

	result, err := repo.Search(context.Background(), biz.SearchRequest{Name: "鲁班"})
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	if engine.query != "鲁班" {
		t.Fatalf("query = %q, want %q", engine.query, "鲁班")
	}
	if len(result.Products) != 1 {
		t.Fatalf("products = %d, want 1", len(result.Products))
	}
	got := result.Products[0]
	if got.ID != 42 || got.SpuCode != "SPU-42" || got.Name != "鲁班灯" || got.Status != "online" || got.Price != 199.5 || got.Quantity != 17 {
		t.Fatalf("mapped product = %+v", got)
	}
}

func TestSearchRepoSkipsInvalidIDsAndBoundsSaleCount(t *testing.T) {
	engine := &fakeSearchEngine{response: &meilisearch.SearchResponse{
		Hits: meilisearch.Hits{
			newHit(t, map[string]any{"id": 0, "sale_count": 1}),
			newHit(t, map[string]any{"id": 7, "sale_count": int64(math.MaxUint32) + 1}),
		},
	}}
	repo := searchRepo{data: &Data{search: engine}, log: zap.NewNop()}

	result, err := repo.Search(context.Background(), biz.SearchRequest{Name: "lamp"})
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	if len(result.Products) != 1 {
		t.Fatalf("products = %d, want 1", len(result.Products))
	}
	if result.Products[0].Quantity != math.MaxUint32 {
		t.Fatalf("quantity = %d, want %d", result.Products[0].Quantity, uint32(math.MaxUint32))
	}
}

func TestSearchRepoReturnsEngineError(t *testing.T) {
	want := errors.New("search unavailable")
	repo := searchRepo{
		data: &Data{search: &fakeSearchEngine{searchErr: want}},
		log:  zap.NewNop(),
	}

	_, err := repo.Search(context.Background(), biz.SearchRequest{Name: "lamp"})
	if !errors.Is(err, want) {
		t.Fatalf("Search() error = %v, want wrapped %v", err, want)
	}
}

func TestCheckSearch(t *testing.T) {
	want := errors.New("unhealthy")
	data := &Data{search: &fakeSearchEngine{healthErr: want}}
	if err := data.CheckSearch(context.Background()); !errors.Is(err, want) {
		t.Fatalf("CheckSearch() error = %v, want wrapped %v", err, want)
	}
}

func TestMeilisearchConfigChangeWarnsThatRestartIsRequired(t *testing.T) {
	oldConfig := &confv1.Bootstrap{Search: &confv1.Search{Meilisearch: &confv1.Search_Meilisearch{
		Host: "http://127.0.0.1:7700", ApiKey: "search-only-api-key", Index: "products",
	}}}
	live := config.NewLive(oldConfig)
	core, logs := observer.New(zap.WarnLevel)
	lifecycle := fxtest.NewLifecycle(t)
	_ = NewMeilisearchClient(lifecycle, oldConfig, live, zap.New(core))
	lifecycle.RequireStart()
	t.Cleanup(lifecycle.RequireStop)

	live.Set(&confv1.Bootstrap{Search: &confv1.Search{Meilisearch: &confv1.Search_Meilisearch{
		Host: "http://127.0.0.1:7700", ApiKey: "rotated-search-api-key", Index: "products",
	}}})

	entries := logs.FilterMessage("该配置段已变更,但需要重启服务才会生效").All()
	require.Len(t, entries, 1)
	require.Equal(t, "search", entries[0].ContextMap()["section"])
}

func TestMeilisearchEngineUsesConfiguredIndexAndQueryPolicy(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/indexes/products/search" {
			t.Errorf("request = %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer search-only-api-key" {
			t.Errorf("Authorization = %q", got)
		}
		var body struct {
			Query                string   `json:"q"`
			Filter               string   `json:"filter"`
			AttributesToRetrieve []string `json:"attributesToRetrieve"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request: %v", err)
		}
		if body.Query != "lamp" || body.Filter != "status = online" {
			t.Errorf("request body = %+v", body)
		}
		wantAttrs := []string{"id", "spu_code", "name", "status", "main_media_url", "price", "sale_count"}
		if !reflect.DeepEqual(body.AttributesToRetrieve, wantAttrs) {
			t.Errorf("attributesToRetrieve = %v, want %v", body.AttributesToRetrieve, wantAttrs)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"hits":[],"query":"lamp","processingTimeMs":1,"limit":20,"offset":0,"estimatedTotalHits":0}`))
	}))
	defer server.Close()

	client := meilisearch.New(server.URL,
		meilisearch.WithAPIKey("search-only-api-key"),
		meilisearch.WithCustomClient(server.Client()),
	)
	defer client.Close()
	engine := &meilisearchEngine{client: client, index: "products"}

	if _, err := engine.Search(context.Background(), "lamp"); err != nil {
		t.Fatalf("Search() error = %v", err)
	}
}

func TestMeilisearchEngineHealthPerformsDeepIndexProbe(t *testing.T) {
	var probed bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/health":
			_, _ = w.Write([]byte(`{"status":"available"}`))
		case "/indexes/products/search":
			probed = true
			var body struct {
				Query                string   `json:"q"`
				Filter               string   `json:"filter"`
				Limit                int64    `json:"limit"`
				AttributesToRetrieve []string `json:"attributesToRetrieve"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("decode readiness request: %v", err)
			}
			if body.Query != "" || body.Filter != "status = online" || body.Limit != 1 || !reflect.DeepEqual(body.AttributesToRetrieve, []string{"id"}) {
				t.Errorf("readiness request body = %+v", body)
			}
			_, _ = w.Write([]byte(`{"hits":[],"query":"","processingTimeMs":1,"limit":1,"offset":0,"estimatedTotalHits":0}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := meilisearch.New(server.URL,
		meilisearch.WithAPIKey("search-only-api-key"),
		meilisearch.WithCustomClient(server.Client()),
	)
	defer client.Close()
	engine := &meilisearchEngine{client: client, index: "products"}

	if err := engine.Health(context.Background()); err != nil {
		t.Fatalf("Health() error = %v", err)
	}
	if !probed {
		t.Fatal("Health() did not probe the configured index")
	}
}

func TestMeilisearchEngineHealthRejectsUnavailableIndex(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/health" {
			_, _ = w.Write([]byte(`{"status":"available"}`))
			return
		}
		http.Error(w, `{"message":"Index products not found","code":"index_not_found","type":"invalid_request","link":"https://docs.meilisearch.com/errors#index_not_found"}`, http.StatusNotFound)
	}))
	defer server.Close()

	client := meilisearch.New(server.URL,
		meilisearch.WithAPIKey("search-only-api-key"),
		meilisearch.WithCustomClient(server.Client()),
	)
	defer client.Close()
	engine := &meilisearchEngine{client: client, index: "products"}

	err := engine.Health(context.Background())
	if err == nil || !strings.Contains(err.Error(), "index readiness probe") {
		t.Fatalf("Health() error = %v", err)
	}
}

func newHit(t *testing.T, value map[string]any) meilisearch.Hit {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal hit: %v", err)
	}
	var hit meilisearch.Hit
	if err := json.Unmarshal(raw, &hit); err != nil {
		t.Fatalf("unmarshal hit: %v", err)
	}
	return hit
}
