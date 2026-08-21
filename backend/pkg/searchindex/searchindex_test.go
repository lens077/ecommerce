package searchindex

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/meilisearch/meilisearch-go"
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

func TestDatabaseWatermarkUsesPostgreSQLClock(t *testing.T) {
	want := time.Date(2026, 8, 21, 10, 0, 0, 0, time.UTC)
	var query string
	got, err := databaseWatermark(context.Background(), func(_ context.Context, sql string, _ ...any) pgx.Row {
		query = sql
		return stubRow{value: want}
	})
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("watermark = %s, want %s", got, want)
	}
	if !strings.Contains(query, "clock_timestamp()") {
		t.Fatalf("watermark query must use PostgreSQL clock, got %q", query)
	}
}

func TestDatabaseWatermarkWrapsQueryError(t *testing.T) {
	wantErr := errors.New("database unavailable")
	_, err := databaseWatermark(context.Background(), func(context.Context, string, ...any) pgx.Row {
		return stubRow{err: wantErr}
	})
	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want wrapped %v", err, wantErr)
	}
}

func TestDeleteIndexAndWaitPropagatesDeleteError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete || r.URL.Path != "/indexes/products_rebuild" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"message":"delete failed","code":"internal","type":"internal","link":"https://example.invalid"}`))
	}))
	defer server.Close()

	err := deleteIndexAndWait(context.Background(), meilisearch.New(server.URL), "products_rebuild")
	if err == nil || !strings.Contains(err.Error(), "删除索引 products_rebuild 失败") {
		t.Fatalf("error = %v, want propagated delete failure", err)
	}
}

func TestDeleteIndexAndWaitPropagatesTaskFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodDelete && r.URL.Path == "/indexes/products_rebuild":
			w.WriteHeader(http.StatusAccepted)
			_, _ = w.Write([]byte(`{"taskUid":42,"indexUid":"products_rebuild","status":"enqueued","type":"indexDeletion","enqueuedAt":"2026-08-21T10:00:00Z"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/tasks/42":
			_, _ = w.Write([]byte(`{"uid":42,"indexUid":"products_rebuild","status":"failed","type":"indexDeletion","canceledBy":null,"details":{},"error":{"message":"storage failure","code":"internal","type":"internal","link":"https://example.invalid"},"duration":"PT0S","enqueuedAt":"2026-08-21T10:00:00Z","startedAt":"2026-08-21T10:00:00Z","finishedAt":"2026-08-21T10:00:00Z"}`))
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	err := deleteIndexAndWait(context.Background(), meilisearch.New(server.URL), "products_rebuild")
	if err == nil || !strings.Contains(err.Error(), "等待索引 products_rebuild 删除失败") {
		t.Fatalf("error = %v, want propagated task failure", err)
	}
}
