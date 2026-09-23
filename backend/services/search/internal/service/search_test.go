package service

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/search/v1"
	"github.com/lens077/ecommerce/backend/services/search/internal/biz"
)

type failingSearchRepo struct{ err error }

func (r failingSearchRepo) Search(context.Context, biz.SearchRequest) (*biz.SearchResponse, error) {
	return nil, r.err
}

// 2026-09-23：搜索错误原样返回，Elasticsearch 抖动、客户端取消都被记成 rpc.code=unknown 按 ERROR 上报。
func TestSearch_MapsErrorsToRPCCodes(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want connect.Code
	}{
		{"搜索后端不可用", fmt.Errorf("%w: connection refused", biz.ErrSearchUnavailable), connect.CodeUnavailable},
		{"客户端取消", fmt.Errorf("search products: %w", context.Canceled), connect.CodeCanceled},
		{"超时", fmt.Errorf("search products: %w", context.DeadlineExceeded), connect.CodeDeadlineExceeded},
		{"未知错误", errors.New("boom"), connect.CodeUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := NewSearchService(biz.NewSearchUseCase(failingSearchRepo{err: tt.err}))
			_, err := s.Search(context.Background(), connect.NewRequest(&v1.SearchRequest{Name: "lamp"}))
			if got := connect.CodeOf(err); got != tt.want {
				t.Fatalf("code = %v, want %v (err=%v)", got, tt.want, err)
			}
			if !errors.Is(err, tt.err) {
				t.Fatalf("errors.Is 链被切断: %v", err)
			}
		})
	}
}

type recordingSearchRepo struct {
	request biz.SearchRequest
}

func (r *recordingSearchRepo) Search(_ context.Context, req biz.SearchRequest) (*biz.SearchResponse, error) {
	r.request = req
	return &biz.SearchResponse{}, nil
}

func TestSearchIgnoresClientSuppliedIndex(t *testing.T) {
	repo := &recordingSearchRepo{}
	service := NewSearchService(biz.NewSearchUseCase(repo))

	_, err := service.Search(context.Background(), connect.NewRequest(&v1.SearchRequest{
		Index: "attacker-controlled-index",
		Name:  "lamp",
	}))
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	if repo.request.Name != "lamp" {
		t.Fatalf("repository query = %q, want %q", repo.request.Name, "lamp")
	}
}
