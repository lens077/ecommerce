package service

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/search/v1"
	"github.com/lens077/ecommerce/backend/services/search/internal/biz"
)

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
