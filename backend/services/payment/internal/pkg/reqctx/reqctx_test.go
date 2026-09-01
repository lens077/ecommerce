package reqctx

import (
	"context"
	"net/http"
	"testing"

	"github.com/lens077/ecommerce/backend/constants"
)

func TestHTTPRequest(t *testing.T) {
	request := &http.Request{Method: http.MethodPost}
	ctx := context.WithValue(t.Context(), constants.HttpRequestKey, request)
	if got := HTTPRequest(ctx); got != request {
		t.Fatalf("HTTPRequest() = %p, want %p", got, request)
	}
}

func TestHTTPRequestReturnsNilWithoutRequest(t *testing.T) {
	if got := HTTPRequest(t.Context()); got != nil {
		t.Fatalf("HTTPRequest() = %p, want nil", got)
	}
}
