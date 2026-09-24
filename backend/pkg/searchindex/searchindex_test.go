package searchindex

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type stubRow struct {
	value time.Time
	err   error
}

func (r stubRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	*(dest[0].(*time.Time)) = r.value
	return nil
}

func TestDocumentJSONContractMatchesIndexMapping(t *testing.T) {
	definition := indexDefinition("")
	mappings := definition["mappings"].(map[string]any)
	properties := mappings["properties"].(map[string]any)

	docType := reflect.TypeOf(Doc{})
	jsonFields := make([]string, 0, docType.NumField())
	for i := 0; i < docType.NumField(); i++ {
		jsonFields = append(jsonFields, strings.Split(docType.Field(i).Tag.Get("json"), ",")[0])
	}
	mappingFields := make([]string, 0, len(properties))
	for field := range properties {
		mappingFields = append(mappingFields, field)
	}
	require.ElementsMatch(t, jsonFields, mappingFields)
	require.Len(t, properties, 10)

	require.Equal(t, map[string]any{"type": "long"}, properties["id"])
	require.Equal(t, map[string]any{"type": "keyword"}, properties["merchant_id"])
	require.Equal(t, map[string]any{"type": "scaled_float", "scaling_factor": 100}, properties["price"])
	require.Equal(t, map[string]any{"type": "long"}, properties["sale_count"])
	require.Equal(t, map[string]any{
		"type": "date", "format": "strict_date_optional_time_nanos||epoch_millis",
	}, properties["updated_at"])
}

func TestEnsureIndexCreatesStrictIKMappingAndStableAlias(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodHead && r.URL.Path == "/_alias/ecommerce_catalog_products":
			w.WriteHeader(http.StatusNotFound)
		case r.Method == http.MethodPut && r.URL.Path == "/ecommerce_catalog_products-000001":
			var body map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			settings := body["settings"].(map[string]any)
			require.Equal(t, float64(0), settings["number_of_replicas"])
			require.Equal(t, "request", settings["index.translog.durability"])

			mappings := body["mappings"].(map[string]any)
			require.Equal(t, "strict", mappings["dynamic"])
			properties := mappings["properties"].(map[string]any)
			require.Equal(t, "long", properties["id"].(map[string]any)["type"])
			require.Equal(t, "ik_max_word", properties["name"].(map[string]any)["analyzer"])
			require.Equal(t, "ik_smart", properties["name"].(map[string]any)["search_analyzer"])
			require.Equal(t, "ik_max_word", properties["description"].(map[string]any)["analyzer"])
			require.Equal(t, "scaled_float", properties["price"].(map[string]any)["type"])
			require.Equal(t, float64(100), properties["price"].(map[string]any)["scaling_factor"])
			require.Equal(t, "long", properties["sale_count"].(map[string]any)["type"])

			aliases := body["aliases"].(map[string]any)
			require.Equal(t, true, aliases["ecommerce_catalog_products"].(map[string]any)["is_write_index"])
			_, _ = w.Write([]byte(`{"acknowledged":true}`))
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()
	client := newTestClient(t, server)

	require.NoError(t, client.EnsureIndex(context.Background(), "ecommerce_catalog_products"))
}

func TestIndexDocumentRedeliveryUsesStableDocumentID(t *testing.T) {
	var bodies [][]byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPut, r.Method)
		require.Equal(t, "/ecommerce_catalog_products/_doc/42", r.URL.Path)
		require.Equal(t, "true", r.URL.Query().Get("require_alias"))
		require.Equal(t, "false", r.URL.Query().Get("refresh"))
		require.Equal(t, "1", r.URL.Query().Get("wait_for_active_shards"))
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		bodies = append(bodies, body)
		w.Header().Set("Content-Type", "application/json")
		if len(bodies) == 1 {
			w.WriteHeader(http.StatusCreated)
		}
		_, _ = w.Write([]byte(`{"result":"updated"}`))
	}))
	defer server.Close()
	client := newTestClient(t, server)
	doc := Doc{ID: 42, SpuCode: "SPU-42", Name: "鲁班灯", Status: "online", Price: 199.5}

	require.NoError(t, client.IndexDocument(context.Background(), "ecommerce_catalog_products", doc))
	require.NoError(t, client.IndexDocument(context.Background(), "ecommerce_catalog_products", doc))
	require.Len(t, bodies, 2)
	require.JSONEq(t, string(bodies[0]), string(bodies[1]))
}

func TestDeleteDocumentTreatsMissingDocumentAsIdempotentSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodDelete, r.Method)
		require.Equal(t, "/ecommerce_catalog_products/_doc/42", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"_index":"ecommerce_catalog_products-000001","_id":"42","result":"not_found"}`))
	}))
	defer server.Close()
	client := newTestClient(t, server)

	require.NoError(t, client.DeleteDocument(context.Background(), "ecommerce_catalog_products", 42))
}

func TestDeleteDocumentRejectsMissingAlias(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":{"type":"index_not_found_exception"},"status":404}`))
	}))
	defer server.Close()
	client := newTestClient(t, server)

	err := client.DeleteDocument(context.Background(), "ecommerce_catalog_products", 42)
	require.Error(t, err)
	require.Contains(t, err.Error(), "alias or index not found")
}

func TestPhysicalIndexNameBoundsLongAlias(t *testing.T) {
	alias := strings.Repeat("a", 255)
	physical := physicalIndexName(alias, "-rebuild-20260831t120000000000000")

	require.LessOrEqual(t, len(physical), 255)
	require.True(t, indexNamePattern.MatchString(physical))
	require.True(t, strings.HasSuffix(physical, "-rebuild-20260831t120000000000000"))
	require.Equal(t, physical, physicalIndexName(alias, "-rebuild-20260831t120000000000000"))
}

func TestClientRejectsMismatchedAuthentication(t *testing.T) {
	_, err := NewClient(ClientConfig{
		Endpoint: "http://127.0.0.1:9200",
		Username: "elastic",
	})
	require.Error(t, err)
	require.True(t, strings.Contains(err.Error(), "both username and password"))

	_, err = NewClient(ClientConfig{
		Endpoint: "http://127.0.0.1:9200",
		Username: "elastic",
		Password: "secret",
		APIKey:   "api-key",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "mutually exclusive")
}

func newTestClient(t *testing.T, server *httptest.Server) *Client {
	t.Helper()
	client, err := NewClient(ClientConfig{
		Endpoint:  server.URL,
		Transport: server.Client().Transport,
	})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, client.Close(context.Background())) })
	return client
}
