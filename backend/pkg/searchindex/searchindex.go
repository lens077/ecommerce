// Package searchindex maintains the curated product projection in Elasticsearch.
//
// The document schema preserves three settled invariants:
//   - id is the top-level numeric SPU primary key;
//   - price is the minimum active-SKU price projection. PostgreSQL DECIMAL remains
//     the money source of truth; the indexed value is only for display and sorting;
//   - sale_count is the top-level numeric products.spu_total_sales projection.
//
// Upserts overwrite a stable Elasticsearch document ID and deletes use the same
// ID, so Kafka redelivery remains idempotent. The production projection transport
// is Debezium -> Kafka -> Elasticsearch Sink (docs/design/search/search.md).
package searchindex

// Doc is one curated product search document. Its JSON field names are the
// projection contract; changing them requires an index schema migration.
type Doc struct {
	ID           int64   `json:"id"`             // SPU primary key
	SpuCode      string  `json:"spu_code"`       // business code
	Name         string  `json:"name"`           // primary search field
	Description  string  `json:"description"`    // IK-analyzed product description
	Status       string  `json:"status"`         // draft/online/offline/deleted
	MainMediaURL string  `json:"main_media_url"` // primary image
	MerchantID   string  `json:"merchant_id"`    // merchant filter
	Price        float64 `json:"price"`          // display/sort projection only
	SaleCount    int64   `json:"sale_count"`     // total sales projection
	UpdatedAt    string  `json:"updated_at"`     // RFC3339 freshness/sort fallback
}
