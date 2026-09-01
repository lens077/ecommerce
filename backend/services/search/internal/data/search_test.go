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

	sharedconfig "github.com/lens077/ecommerce/backend/pkg/config"
	"github.com/lens077/ecommerce/backend/pkg/searchindex"
	"github.com/lens077/ecommerce/backend/services/search/internal/biz"
	confv1 "github.com/lens077/ecommerce/backend/services/search/internal/conf/v1"
	"github.com/stretchr/testify/require"
	"go.uber.org/fx/fxtest"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"
)

type fakeSearchCatalog struct {
	products  []CatalogProduct
	searchErr error
	healthErr error
	query     string
}

func (f *fakeSearchCatalog) SearchProducts(_ context.Context, query string) ([]CatalogProduct, error) {
	f.query = query
	return f.products, f.searchErr
}

func (f *fakeSearchCatalog) Health(context.Context) error {
	return f.healthErr
}

func TestSearchRepoMapsCanonicalDocument(t *testing.T) {
	catalog := &fakeSearchCatalog{products: []CatalogProduct{{
		ID:           42,
		SpuCode:      "SPU-42",
		Name:         "鲁班灯",
		Status:       "online",
		MainMediaURL: "https://example.test/42.webp",
		Price:        199.5,
		SaleCount:    17,
	}}}
	repo := searchRepo{
		data: &Data{catalog: catalog},
		log:  zap.NewNop(),
	}

	result, err := repo.Search(context.Background(), biz.SearchRequest{Name: "鲁班"})
	require.NoError(t, err)
	require.Equal(t, "鲁班", catalog.query)
	require.Len(t, result.Products, 1)
	got := result.Products[0]
	require.Equal(t, uint32(42), got.ID)
	require.Equal(t, "SPU-42", got.SpuCode)
	require.Equal(t, "鲁班灯", got.Name)
	require.Equal(t, "online", got.Status)
	require.Equal(t, 199.5, got.Price)
	require.Equal(t, uint32(17), got.Quantity)
}

func TestSearchRepoSkipsInvalidIDsAndBoundsSaleCount(t *testing.T) {
	catalog := &fakeSearchCatalog{products: []CatalogProduct{
		{ID: 0, SaleCount: 1},
		{ID: 7, SaleCount: int64(math.MaxUint32) + 1},
	}}
	repo := searchRepo{data: &Data{catalog: catalog}, log: zap.NewNop()}

	result, err := repo.Search(context.Background(), biz.SearchRequest{Name: "lamp"})
	require.NoError(t, err)
	require.Len(t, result.Products, 1)
	require.Equal(t, uint32(math.MaxUint32), result.Products[0].Quantity)
}

func TestSearchRepoReturnsCatalogError(t *testing.T) {
	want := errors.New("search unavailable")
	repo := searchRepo{
		data: &Data{catalog: &fakeSearchCatalog{searchErr: want}},
		log:  zap.NewNop(),
	}

	_, err := repo.Search(context.Background(), biz.SearchRequest{Name: "lamp"})
	require.ErrorIs(t, err, want)
}

func TestCheckSearch(t *testing.T) {
	want := errors.New("unhealthy")
	data := &Data{catalog: &fakeSearchCatalog{healthErr: want}}
	require.ErrorIs(t, data.CheckSearch(context.Background()), want)
}

func TestSearchCatalogContractContainsNoVendorTypes(t *testing.T) {
	contract := reflect.TypeOf((*SearchCatalog)(nil)).Elem()
	for i := 0; i < contract.NumMethod(); i++ {
		method := contract.Method(i)
		assertNoVendorType(t, method.Type, map[reflect.Type]bool{})
	}
}

func assertNoVendorType(t *testing.T, typ reflect.Type, seen map[reflect.Type]bool) {
	t.Helper()
	if seen[typ] {
		return
	}
	seen[typ] = true
	pkg := typ.PkgPath()
	if strings.HasPrefix(pkg, "github.com/elastic/") || strings.HasPrefix(pkg, "github.com/meilisearch/") {
		t.Fatalf("SearchCatalog exposes vendor type %s", typ)
	}
	switch typ.Kind() {
	case reflect.Pointer, reflect.Slice, reflect.Array, reflect.Chan:
		assertNoVendorType(t, typ.Elem(), seen)
	case reflect.Map:
		assertNoVendorType(t, typ.Key(), seen)
		assertNoVendorType(t, typ.Elem(), seen)
	case reflect.Func:
		for i := 0; i < typ.NumIn(); i++ {
			assertNoVendorType(t, typ.In(i), seen)
		}
		for i := 0; i < typ.NumOut(); i++ {
			assertNoVendorType(t, typ.Out(i), seen)
		}
	case reflect.Interface:
		for i := 0; i < typ.NumMethod(); i++ {
			assertNoVendorType(t, typ.Method(i).Type, seen)
		}
	case reflect.Struct:
		for i := 0; i < typ.NumField(); i++ {
			assertNoVendorType(t, typ.Field(i).Type, seen)
		}
	}
}

func TestSearchCatalogConfigChangeWarnsThatRestartIsRequired(t *testing.T) {
	oldConfig := testCatalogBootstrap("old-search-api-key")
	live := sharedconfig.NewLive(oldConfig)
	core, logs := observer.New(zap.WarnLevel)
	lifecycle := fxtest.NewLifecycle(t)
	catalog, err := NewSearchCatalog(lifecycle, oldConfig, live, zap.New(core))
	require.NoError(t, err)
	require.NotNil(t, catalog)
	lifecycle.RequireStart()
	t.Cleanup(lifecycle.RequireStop)

	live.Set(testCatalogBootstrap("rotated-search-api-key"))

	entries := logs.FilterMessage("该配置段已变更,但需要重启服务才会生效").All()
	require.Len(t, entries, 1)
	require.Equal(t, "search", entries[0].ContextMap()["section"])
}

func TestESProviderUsesConfiguredAliasAndQueryPolicy(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/ecommerce_catalog_products/_search", r.URL.Path)
		require.Equal(t, "APIKey search-only-api-key", r.Header.Get("Authorization"))
		var body struct {
			Size  int `json:"size"`
			Query struct {
				Bool struct {
					Must []struct {
						MultiMatch struct {
							Query  string   `json:"query"`
							Fields []string `json:"fields"`
						} `json:"multi_match"`
					} `json:"must"`
					Filter []map[string]map[string]string `json:"filter"`
				} `json:"bool"`
			} `json:"query"`
		}
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		require.Equal(t, 20, body.Size)
		require.Equal(t, "lamp", body.Query.Bool.Must[0].MultiMatch.Query)
		require.Equal(t, []string{"name^4", "spu_code.search^3", "description"}, body.Query.Bool.Must[0].MultiMatch.Fields)
		require.Equal(t, "online", body.Query.Bool.Filter[0]["term"]["status"])
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"hits":{"hits":[{"_source":{"id":42,"spu_code":"SPU-42","name":"Lamp","status":"online","main_media_url":"https://example.test/42.webp","price":199.5,"sale_count":17}}]}}`))
	}))
	defer server.Close()

	client, err := searchindex.NewClient(searchindex.ClientConfig{
		Endpoint:  server.URL,
		APIKey:    "search-only-api-key",
		Transport: server.Client().Transport,
	})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, client.Close(context.Background())) })
	catalog := &esCatalog{client: client, index: "ecommerce_catalog_products"}

	products, err := catalog.SearchProducts(context.Background(), "lamp")
	require.NoError(t, err)
	require.Len(t, products, 1)
	require.Equal(t, int64(42), products[0].ID)
}

func TestESProviderHealthPerformsDeepAliasProbe(t *testing.T) {
	var probed bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/":
			_, _ = w.Write([]byte(`{"version":{"number":"9.4.5"}}`))
		case "/_alias/ecommerce_catalog_products":
			_, _ = w.Write([]byte(`{"ecommerce_catalog_products-000001":{"aliases":{"ecommerce_catalog_products":{"is_write_index":true}}}}`))
		case "/ecommerce_catalog_products/_search":
			probed = true
			_, _ = w.Write([]byte(`{"hits":{"hits":[]}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, err := searchindex.NewClient(searchindex.ClientConfig{Endpoint: server.URL, Transport: server.Client().Transport})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, client.Close(context.Background())) })
	catalog := &esCatalog{client: client, index: "ecommerce_catalog_products"}

	require.NoError(t, catalog.Health(context.Background()))
	require.True(t, probed)
}

func TestESProviderHealthRejectsUnavailableAlias(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/" {
			_, _ = w.Write([]byte(`{"version":{"number":"9.4.5"}}`))
			return
		}
		http.Error(w, `{"error":{"type":"index_not_found_exception"}}`, http.StatusNotFound)
	}))
	defer server.Close()

	client, err := searchindex.NewClient(searchindex.ClientConfig{Endpoint: server.URL, Transport: server.Client().Transport})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, client.Close(context.Background())) })
	catalog := &esCatalog{client: client, index: "ecommerce_catalog_products"}

	err = catalog.Health(context.Background())
	require.Error(t, err)
	require.Contains(t, err.Error(), "get alias")
}

func testCatalogBootstrap(apiKey string) *confv1.Bootstrap {
	return &confv1.Bootstrap{Search: &confv1.Search{Catalog: &confv1.Search_ElasticsearchCatalog{
		Endpoint: "http://127.0.0.1:9200",
		ApiKey:   apiKey,
		Index:    "ecommerce_catalog_products",
	}}}
}
