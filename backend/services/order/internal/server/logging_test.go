package server

import (
	"context"
	"errors"
	"strings"
	"testing"

	"connectrpc.com/connect"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"
)

// 回归：业务异常（failed_precondition 等非系统码）的日志曾只记 rpc.code、不带 err 本体，
// 排障时分不清是购物车为空还是库存不足（2026-09-24）。四个分支里唯独这条漏了 zap.Error。
func TestLoggingInterceptor_BusinessExceptionCarriesError(t *testing.T) {
	core, logs := observer.New(zap.DebugLevel)
	interceptor := NewLoggingInterceptor(zap.New(core))

	sentinel := errors.New("[order] cart is empty")
	next := func(context.Context, connect.AnyRequest) (connect.AnyResponse, error) {
		return nil, connect.NewError(connect.CodeFailedPrecondition, sentinel)
	}

	_, err := interceptor.WrapUnary(next)(context.Background(), connect.NewRequest(&struct{}{}))
	if err == nil {
		t.Fatal("interceptor must pass the error through")
	}

	entries := logs.FilterMessage("rpc business exception").All()
	if len(entries) != 1 {
		t.Fatalf("want exactly 1 business exception log, got %d", len(entries))
	}
	fields := entries[0].ContextMap()
	if got := fields["rpc.code"]; got != "failed_precondition" {
		t.Fatalf("rpc.code = %v, want failed_precondition", got)
	}
	errField, ok := fields["error"].(string)
	if !ok || errField == "" {
		t.Fatalf("business exception log must carry the error body, fields=%v", fields)
	}
	if !strings.Contains(errField, sentinel.Error()) {
		t.Fatalf("error field %q does not contain sentinel %q", errField, sentinel.Error())
	}
}
