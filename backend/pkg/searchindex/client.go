package searchindex

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/elastic/elastic-transport-go/v8/elastictransport"
	"github.com/elastic/go-elasticsearch/v9/esapi"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

const (
	defaultRequestTimeout = 10 * time.Second
	defaultSearchLimit    = 20
	maxSearchLimit        = 100
	bulkChunkSize         = 500
)

var indexNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,254}$`)

// ClientConfig owns the Elasticsearch connection contract used by this package.
// It deliberately contains no Elasticsearch SDK types.
type ClientConfig struct {
	Endpoint       string
	Username       string
	Password       string
	APIKey         string
	RequestTimeout time.Duration
	Transport      http.RoundTripper
}

// Client provides the search projection operations needed by the query service
// and the projection worker. Elasticsearch SDK types do not cross this boundary.
type Client struct {
	api       *esapi.API
	transport *elastictransport.Client
	timeout   time.Duration
}

func NewClient(cfg ClientConfig) (*Client, error) {
	endpoint, err := parseEndpoint(cfg.Endpoint)
	if err != nil {
		return nil, err
	}
	if cfg.APIKey != "" && (cfg.Username != "" || cfg.Password != "") {
		return nil, errors.New("searchindex: api key and basic auth are mutually exclusive")
	}
	if (cfg.Username == "") != (cfg.Password == "") {
		return nil, errors.New("searchindex: basic auth requires both username and password")
	}

	timeout := cfg.RequestTimeout
	if timeout <= 0 {
		timeout = defaultRequestTimeout
	}

	baseTransport := cfg.Transport
	if baseTransport == nil {
		httpTransport := http.DefaultTransport.(*http.Transport).Clone()
		httpTransport.MaxIdleConnsPerHost = 20
		httpTransport.ResponseHeaderTimeout = timeout
		baseTransport = httpTransport
	}

	options := []elastictransport.Option{
		elastictransport.WithURLs(endpoint),
		elastictransport.WithTransport(otelhttp.NewTransport(baseTransport)),
		elastictransport.WithUserAgent("ecommerce-searchindex/1"),
		elastictransport.WithMaxRetries(2),
	}
	if cfg.APIKey != "" {
		options = append(options, elastictransport.WithAPIKey(cfg.APIKey))
	} else if cfg.Username != "" {
		options = append(options, elastictransport.WithBasicAuth(cfg.Username, cfg.Password))
	}

	transport, err := elastictransport.NewClient(options...)
	if err != nil {
		return nil, fmt.Errorf("searchindex: create elasticsearch transport: %w", err)
	}
	return &Client{
		api:       esapi.New(transport),
		transport: transport,
		timeout:   timeout,
	}, nil
}

func parseEndpoint(raw string) (*url.URL, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, errors.New("searchindex: elasticsearch endpoint is required")
	}
	endpoint, err := url.ParseRequestURI(raw)
	if err != nil {
		return nil, fmt.Errorf("searchindex: parse elasticsearch endpoint: %w", err)
	}
	if endpoint.Scheme != "http" && endpoint.Scheme != "https" {
		return nil, fmt.Errorf("searchindex: unsupported elasticsearch endpoint scheme %q", endpoint.Scheme)
	}
	if endpoint.Host == "" {
		return nil, errors.New("searchindex: elasticsearch endpoint must include a host")
	}
	if endpoint.User != nil {
		return nil, errors.New("searchindex: credentials must not be embedded in the elasticsearch endpoint")
	}
	return endpoint, nil
}

func (c *Client) Close(ctx context.Context) error {
	if c == nil || c.transport == nil {
		return nil
	}
	return c.transport.Close(ctx)
}

func (c *Client) withTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, c.timeout)
}

// SearchProducts searches the configured read alias and returns the owned
// projection document contract rather than an SDK response.
func (c *Client) SearchProducts(ctx context.Context, index, query string, limit int) ([]Doc, error) {
	if err := validateIndexName(index); err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = defaultSearchLimit
	}
	if limit > maxSearchLimit {
		return nil, fmt.Errorf("searchindex: search limit %d exceeds %d", limit, maxSearchLimit)
	}

	queryClause := map[string]any{"match_all": map[string]any{}}
	if query != "" {
		queryClause = map[string]any{
			"multi_match": map[string]any{
				"query":  query,
				"fields": []string{"name^4", "spu_code.search^3", "description"},
				"type":   "best_fields",
			},
		}
	}
	body, err := json.Marshal(map[string]any{
		"size": limit,
		"_source": []string{
			"id", "spu_code", "name", "description", "status",
			"main_media_url", "merchant_id", "price", "sale_count", "updated_at",
		},
		"query": map[string]any{
			"bool": map[string]any{
				"must":   []any{queryClause},
				"filter": []any{map[string]any{"term": map[string]any{"status": "online"}}},
			},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("searchindex: encode search request: %w", err)
	}

	requestCtx, cancel := c.withTimeout(ctx)
	defer cancel()
	response, err := c.api.Search(
		c.api.Search.WithContext(requestCtx),
		c.api.Search.WithIndex(index),
		c.api.Search.WithBody(bytes.NewReader(body)),
	)
	if err != nil {
		return nil, fmt.Errorf("searchindex: search request: %w", err)
	}
	defer response.Body.Close()
	if response.IsError() {
		return nil, responseError("search products", response)
	}

	var payload struct {
		Hits struct {
			Hits []struct {
				Source Doc `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("searchindex: decode search response: %w", err)
	}
	docs := make([]Doc, 0, len(payload.Hits.Hits))
	for _, hit := range payload.Hits.Hits {
		docs = append(docs, hit.Source)
	}
	return docs, nil
}

// Health verifies authentication, the server major, the configured alias, and
// the query policy used by the service readiness probe.
func (c *Client) Health(ctx context.Context, index string) error {
	requestCtx, cancel := c.withTimeout(ctx)
	defer cancel()
	response, err := c.api.Info(c.api.Info.WithContext(requestCtx))
	if err != nil {
		return fmt.Errorf("searchindex: cluster info request: %w", err)
	}
	defer response.Body.Close()
	if response.IsError() {
		return responseError("cluster info", response)
	}
	var info struct {
		Version struct {
			Number string `json:"number"`
		} `json:"version"`
	}
	if err := json.NewDecoder(response.Body).Decode(&info); err != nil {
		return fmt.Errorf("searchindex: decode cluster info: %w", err)
	}
	if !strings.HasPrefix(info.Version.Number, "9.") {
		return fmt.Errorf("searchindex: unsupported elasticsearch version %q", info.Version.Number)
	}
	if _, err := c.aliasIndices(ctx, index); err != nil {
		return err
	}
	if _, err := c.SearchProducts(ctx, index, "", 1); err != nil {
		return fmt.Errorf("searchindex: index readiness probe: %w", err)
	}
	return nil
}

// EnsureIndex creates the first physical index and write alias if they do not
// already exist. The alias is the stable name used by readers and writers.
func (c *Client) EnsureIndex(ctx context.Context, alias string) error {
	if err := validateIndexName(alias); err != nil {
		return err
	}
	requestCtx, cancel := c.withTimeout(ctx)
	defer cancel()
	response, err := c.api.Indices.ExistsAlias(
		[]string{alias},
		c.api.Indices.ExistsAlias.WithContext(requestCtx),
	)
	if err != nil {
		return fmt.Errorf("searchindex: check alias %s: %w", alias, err)
	}
	if response.StatusCode == http.StatusOK {
		drainAndClose(response.Body)
		return nil
	}
	if response.StatusCode != http.StatusNotFound {
		defer response.Body.Close()
		return responseError("check alias "+alias, response)
	}
	drainAndClose(response.Body)

	physical := physicalIndexName(alias, "-000001")
	if err := c.createIndex(ctx, physical, alias); err == nil {
		return nil
	} else if _, recheckErr := c.aliasIndices(ctx, alias); recheckErr == nil {
		// Another process won the create race and installed the alias.
		return nil
	} else {
		return err
	}
}

func (c *Client) createIndex(ctx context.Context, physical, alias string) error {
	if err := validateIndexName(physical); err != nil {
		return err
	}
	body, err := json.Marshal(indexDefinition(alias))
	if err != nil {
		return fmt.Errorf("searchindex: encode index definition: %w", err)
	}
	requestCtx, cancel := c.withTimeout(ctx)
	defer cancel()
	response, err := c.api.Indices.Create(
		physical,
		c.api.Indices.Create.WithContext(requestCtx),
		c.api.Indices.Create.WithBody(bytes.NewReader(body)),
		c.api.Indices.Create.WithWaitForActiveShards("1"),
	)
	if err != nil {
		return fmt.Errorf("searchindex: create index %s: %w", physical, err)
	}
	return decodeAcknowledged("create index "+physical, response)
}

func indexDefinition(alias string) map[string]any {
	definition := map[string]any{
		"settings": map[string]any{
			"number_of_replicas":        0,
			"index.translog.durability": "request",
		},
		"mappings": map[string]any{
			"dynamic": "strict",
			"properties": map[string]any{
				"id": map[string]any{"type": "long"},
				"spu_code": map[string]any{
					"type": "keyword",
					"fields": map[string]any{
						"search": map[string]any{"type": "text", "analyzer": "standard"},
					},
				},
				"name": map[string]any{
					"type":            "text",
					"analyzer":        "ik_max_word",
					"search_analyzer": "ik_smart",
				},
				"description": map[string]any{
					"type":            "text",
					"analyzer":        "ik_max_word",
					"search_analyzer": "ik_smart",
				},
				"status":         map[string]any{"type": "keyword"},
				"main_media_url": map[string]any{"type": "keyword", "index": false, "doc_values": false},
				"merchant_id":    map[string]any{"type": "keyword"},
				// PostgreSQL DECIMAL remains the money source of truth. This value is
				// only a two-decimal display/sort projection and is never used in transactions.
				"price":      map[string]any{"type": "scaled_float", "scaling_factor": 100},
				"sale_count": map[string]any{"type": "long"},
				"updated_at": map[string]any{"type": "date", "format": "strict_date_time"},
			},
		},
	}
	if alias != "" {
		definition["aliases"] = map[string]any{
			alias: map[string]any{"is_write_index": true},
		}
	}
	return definition
}

// IndexDocument uses the stable alias and explicit document ID. A successful
// response means the primary-shard write was acknowledged. The index definition
// pins translog durability to request, so the worker may ACK JetStream at that
// point; refresh only controls search visibility. Redelivery overwrites the same
// ID and remains idempotent.
func (c *Client) IndexDocument(ctx context.Context, alias string, doc Doc) error {
	if err := validateIndexName(alias); err != nil {
		return err
	}
	if doc.ID <= 0 {
		return errors.New("searchindex: document id must be positive")
	}
	body, err := json.Marshal(doc)
	if err != nil {
		return fmt.Errorf("searchindex: encode document: %w", err)
	}
	requestCtx, cancel := c.withTimeout(ctx)
	defer cancel()
	response, err := c.api.Index(
		alias,
		bytes.NewReader(body),
		c.api.Index.WithContext(requestCtx),
		c.api.Index.WithDocumentID(strconv.FormatInt(doc.ID, 10)),
		c.api.Index.WithRequireAlias(true),
		c.api.Index.WithRefresh("false"),
		c.api.Index.WithWaitForActiveShards("1"),
	)
	if err != nil {
		return fmt.Errorf("searchindex: index document %d: %w", doc.ID, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusCreated {
		return responseError("index document "+strconv.FormatInt(doc.ID, 10), response)
	}
	_, _ = io.Copy(io.Discard, response.Body)
	return nil
}

// DeleteDocument treats a repeated delete of an already missing document as
// success, but still rejects a missing alias so a topology mistake cannot be ACKed.
func (c *Client) DeleteDocument(ctx context.Context, alias string, id int64) error {
	if err := validateIndexName(alias); err != nil {
		return err
	}
	if id <= 0 {
		return errors.New("searchindex: document id must be positive")
	}
	requestCtx, cancel := c.withTimeout(ctx)
	defer cancel()
	response, err := c.api.Delete(
		alias,
		strconv.FormatInt(id, 10),
		c.api.Delete.WithContext(requestCtx),
		c.api.Delete.WithRefresh("false"),
		c.api.Delete.WithWaitForActiveShards("1"),
	)
	if err != nil {
		return fmt.Errorf("searchindex: delete document %d: %w", id, err)
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusOK {
		_, _ = io.Copy(io.Discard, response.Body)
		return nil
	}
	if response.StatusCode == http.StatusNotFound {
		var payload struct {
			Result string          `json:"result"`
			Error  json.RawMessage `json:"error"`
		}
		if err := json.NewDecoder(response.Body).Decode(&payload); err == nil && payload.Result == "not_found" && len(payload.Error) == 0 {
			return nil
		}
		return fmt.Errorf("searchindex: delete document %d: alias or index not found", id)
	}
	return responseError("delete document "+strconv.FormatInt(id, 10), response)
}

func (c *Client) bulkIndex(ctx context.Context, index string, docs []Doc, requireAlias bool) error {
	if err := validateIndexName(index); err != nil {
		return err
	}
	for start := 0; start < len(docs); start += bulkChunkSize {
		end := min(start+bulkChunkSize, len(docs))
		var body bytes.Buffer
		encoder := json.NewEncoder(&body)
		for _, doc := range docs[start:end] {
			if doc.ID <= 0 {
				return errors.New("searchindex: document id must be positive")
			}
			if err := encoder.Encode(map[string]any{"index": map[string]any{"_id": strconv.FormatInt(doc.ID, 10)}}); err != nil {
				return fmt.Errorf("searchindex: encode bulk metadata: %w", err)
			}
			if err := encoder.Encode(doc); err != nil {
				return fmt.Errorf("searchindex: encode bulk document: %w", err)
			}
		}

		requestCtx, cancel := c.withTimeout(ctx)
		response, err := c.api.Bulk(
			&body,
			c.api.Bulk.WithContext(requestCtx),
			c.api.Bulk.WithIndex(index),
			c.api.Bulk.WithRequireAlias(requireAlias),
			c.api.Bulk.WithRefresh("false"),
			c.api.Bulk.WithWaitForActiveShards("1"),
		)
		if err != nil {
			cancel()
			return fmt.Errorf("searchindex: bulk index documents: %w", err)
		}
		decodeErr := decodeBulkResponse(response)
		cancel()
		if decodeErr != nil {
			return decodeErr
		}
	}
	return nil
}

func decodeBulkResponse(response *esapi.Response) error {
	defer response.Body.Close()
	if response.IsError() {
		return responseError("bulk index documents", response)
	}
	var payload struct {
		Errors bool `json:"errors"`
		Items  []map[string]struct {
			Status int             `json:"status"`
			Error  json.RawMessage `json:"error"`
		} `json:"items"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return fmt.Errorf("searchindex: decode bulk response: %w", err)
	}
	if !payload.Errors {
		return nil
	}
	for _, item := range payload.Items {
		for operation, result := range item {
			if result.Status >= 300 {
				return fmt.Errorf("searchindex: bulk %s failed with status %d: %s", operation, result.Status, strings.TrimSpace(string(result.Error)))
			}
		}
	}
	return errors.New("searchindex: bulk response reported errors without a failed item")
}

func (c *Client) aliasIndices(ctx context.Context, alias string) ([]string, error) {
	if err := validateIndexName(alias); err != nil {
		return nil, err
	}
	requestCtx, cancel := c.withTimeout(ctx)
	defer cancel()
	response, err := c.api.Indices.GetAlias(
		c.api.Indices.GetAlias.WithContext(requestCtx),
		c.api.Indices.GetAlias.WithName(alias),
	)
	if err != nil {
		return nil, fmt.Errorf("searchindex: get alias %s: %w", alias, err)
	}
	defer response.Body.Close()
	if response.IsError() {
		return nil, responseError("get alias "+alias, response)
	}
	var payload map[string]json.RawMessage
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("searchindex: decode alias %s: %w", alias, err)
	}
	indices := make([]string, 0, len(payload))
	for index := range payload {
		indices = append(indices, index)
	}
	slices.Sort(indices)
	if len(indices) == 0 {
		return nil, fmt.Errorf("searchindex: alias %s has no backing index", alias)
	}
	return indices, nil
}

func (c *Client) swapAlias(ctx context.Context, alias, next string) ([]string, error) {
	current, err := c.aliasIndices(ctx, alias)
	if err != nil {
		return nil, err
	}
	actions := make([]any, 0, len(current)+1)
	for _, index := range current {
		actions = append(actions, map[string]any{
			// Omitting must_exist keeps a transport-level retry idempotent if the
			// first atomic update succeeded but its response was lost.
			"remove": map[string]any{"index": index, "alias": alias},
		})
	}
	actions = append(actions, map[string]any{
		"add": map[string]any{"index": next, "alias": alias, "is_write_index": true},
	})
	body, err := json.Marshal(map[string]any{"actions": actions})
	if err != nil {
		return nil, fmt.Errorf("searchindex: encode alias swap: %w", err)
	}
	requestCtx, cancel := c.withTimeout(ctx)
	defer cancel()
	response, err := c.api.Indices.UpdateAliases(
		bytes.NewReader(body),
		c.api.Indices.UpdateAliases.WithContext(requestCtx),
	)
	if err != nil {
		if c.aliasPointsOnlyTo(ctx, alias, next) {
			return current, nil
		}
		return nil, fmt.Errorf("searchindex: swap alias %s: %w", alias, err)
	}
	if err := decodeAcknowledged("swap alias "+alias, response); err != nil {
		if c.aliasPointsOnlyTo(ctx, alias, next) {
			return current, nil
		}
		return nil, err
	}
	return current, nil
}

func (c *Client) aliasPointsOnlyTo(ctx context.Context, alias, index string) bool {
	indices, err := c.aliasIndices(ctx, alias)
	return err == nil && len(indices) == 1 && indices[0] == index
}

func (c *Client) deleteIndex(ctx context.Context, index string, missingOK bool) error {
	if err := validateIndexName(index); err != nil {
		return err
	}
	requestCtx, cancel := c.withTimeout(ctx)
	defer cancel()
	response, err := c.api.Indices.Delete(
		[]string{index},
		c.api.Indices.Delete.WithContext(requestCtx),
	)
	if err != nil {
		return fmt.Errorf("searchindex: delete index %s: %w", index, err)
	}
	if missingOK && response.StatusCode == http.StatusNotFound {
		drainAndClose(response.Body)
		return nil
	}
	return decodeAcknowledged("delete index "+index, response)
}

func (c *Client) refreshIndex(ctx context.Context, index string) error {
	requestCtx, cancel := c.withTimeout(ctx)
	defer cancel()
	response, err := c.api.Indices.Refresh(
		c.api.Indices.Refresh.WithContext(requestCtx),
		c.api.Indices.Refresh.WithIndex(index),
	)
	if err != nil {
		return fmt.Errorf("searchindex: refresh index %s: %w", index, err)
	}
	defer response.Body.Close()
	if response.IsError() {
		return responseError("refresh index "+index, response)
	}
	_, _ = io.Copy(io.Discard, response.Body)
	return nil
}

func physicalIndexName(alias, suffix string) string {
	const maxIndexNameBytes = 255
	if len(alias)+len(suffix) <= maxIndexNameBytes {
		return alias + suffix
	}
	digest := sha256.Sum256([]byte(alias))
	hash := fmt.Sprintf("%x", digest[:6])
	prefixLength := maxIndexNameBytes - len(suffix) - len(hash) - 1
	prefix := strings.TrimRight(alias[:prefixLength], ".-_")
	return prefix + "-" + hash + suffix
}

func validateIndexName(index string) error {
	if !indexNamePattern.MatchString(index) || index == "." || index == ".." {
		return fmt.Errorf("searchindex: invalid index or alias name %q", index)
	}
	return nil
}

func decodeAcknowledged(operation string, response *esapi.Response) error {
	defer response.Body.Close()
	if response.IsError() {
		return responseError(operation, response)
	}
	var payload struct {
		Acknowledged bool `json:"acknowledged"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return fmt.Errorf("searchindex: decode %s response: %w", operation, err)
	}
	if !payload.Acknowledged {
		return fmt.Errorf("searchindex: %s was not acknowledged", operation)
	}
	return nil
}

func responseError(operation string, response *esapi.Response) error {
	body, err := io.ReadAll(io.LimitReader(response.Body, 64<<10))
	if err != nil {
		return fmt.Errorf("searchindex: %s failed with HTTP %s (read error: %v)", operation, response.Status(), err)
	}
	detail := strings.TrimSpace(string(body))
	if detail == "" {
		return fmt.Errorf("searchindex: %s failed with HTTP %s", operation, response.Status())
	}
	return fmt.Errorf("searchindex: %s failed with HTTP %s: %s", operation, response.Status(), detail)
}

func drainAndClose(body io.ReadCloser) {
	_, _ = io.Copy(io.Discard, body)
	_ = body.Close()
}
