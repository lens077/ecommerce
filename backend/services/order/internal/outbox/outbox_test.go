package outbox

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"go.opentelemetry.io/otel/trace"
)

type fakeExecer struct {
	sql  string
	args []any
}

func (f *fakeExecer) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	f.sql, f.args = sql, args
	return pgconn.CommandTag{}, nil
}

// 这条测试钉的是 W1 的契约：一行事件必须作为独立 INSERT 交给事务执行器，
// 十个列按 CE/EventRouter 顺序写全；headers 里必须带 traceparent。
func TestAppendWritesOneRowWithCloudEventColumns(t *testing.T) {
	ctx := trace.ContextWithSpanContext(context.Background(), trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    trace.TraceID{0x4b, 0xf9, 0x2f, 0x35, 0x77, 0xb3, 0x4d, 0xa6, 0xa3, 0xce, 0x92, 0x9d, 0x0e, 0x0a, 0x2e, 0x9a},
		SpanID:     trace.SpanID{0x00, 0xf0, 0x67, 0xaa, 0x0b, 0xa9, 0x02, 0xb7},
		TraceFlags: trace.FlagsSampled,
	}))

	ex := &fakeExecer{}
	id := uuid.MustParse("018f0000-0000-7000-8000-000000000001")
	payload, err := json.Marshal(map[string]any{"order_id": 1})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	ev := Event{
		ID:            id,
		Source:        "/services/order",
		Type:          "io.lens077.ecommerce.order.completed.v1",
		Subject:       "order/10001",
		AggregateType: "order",
		AggregateID:   "10001",
		PartitionKey:  "10001",
		Payload:       payload,
	}
	if err := Append(ctx, ex, ev); err != nil {
		t.Fatalf("append: %v", err)
	}

	if ex.sql != insertSQL {
		t.Fatalf("unexpected SQL: %s", ex.sql)
	}
	if len(ex.args) != 10 {
		t.Fatalf("want 10 args, got %d", len(ex.args))
	}
	if got := ex.args[0]; got != id {
		t.Fatalf("arg0 = %v, want %v", got, id)
	}
	if got := ex.args[2]; got != ev.Type {
		t.Fatalf("arg2 = %v, want %v", got, ev.Type)
	}
	if got := ex.args[8].([]byte); string(got) != `{"traceparent":"00-4bf92f3577b34da6a3ce929d0e0a2e9a-00f067aa0ba902b7-01"}` {
		t.Fatalf("headers = %s", got)
	}
}

// 没有 span 时不能伪造 traceparent：宁可留空，也不要造一条假父子关系。
func TestAppendSkipsTraceParentWithoutSpan(t *testing.T) {
	ex := &fakeExecer{}
	if err := Append(context.Background(), ex, Event{ID: uuid.New(), Type: "x"}); err != nil {
		t.Fatalf("append: %v", err)
	}
	var headers map[string]string
	if err := json.Unmarshal(ex.args[8].([]byte), &headers); err != nil {
		t.Fatalf("unmarshal headers: %v", err)
	}
	if _, ok := headers["traceparent"]; ok {
		t.Fatalf("traceparent must be absent, got %v", headers)
	}
}

// 空 ID 会被 Debezium 当成坏行、且破坏幂等键，必须在写入侧就拒绝。
func TestAppendRejectsEmptyID(t *testing.T) {
	if err := Append(context.Background(), &fakeExecer{}, Event{Type: "x"}); err == nil {
		t.Fatal("want error for empty id")
	}
}
