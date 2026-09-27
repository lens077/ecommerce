package data

import (
	"context"

	"github.com/lens077/ecommerce/backend/pkg/gorse"
	"github.com/lens077/ecommerce/backend/services/behavior/internal/biz"
	"go.uber.org/zap"
)

type recommendRepo struct {
	data *Data
	log  *zap.Logger
}

var _ biz.RecommendRepo = (*recommendRepo)(nil)

func NewRecommendRepo(data *Data, logger *zap.Logger) biz.RecommendRepo {
	return &recommendRepo{data: data, log: logger}
}

// Enabled 每次都现读:gorse 可能被配置热更新关掉或打开。
func (r *recommendRepo) Enabled() bool {
	return r.data.gorse.Client() != nil
}

// PushFeedback 投喂反馈。
//
// 按写语义拆成两批:
//   - 累加(POST):impression / read。gorse 把 Value 加到已有值上,
//     config.toml 的 "read>=3" 靠的就是这个累加值。
//   - 覆盖(PUT):dwell / cart / favorite / purchase。dwell 是绝对秒数,
//     其余是布尔事实,累加都会得出错误的量纲 —— 一个点了三次购物车的商品
//     不该拿到 3 倍权重。
func (r *recommendRepo) PushFeedback(ctx context.Context, events []biz.Event) error {
	client := r.data.gorse.Client()
	if client == nil || len(events) == 0 {
		return nil
	}

	var accumulate, overwrite []gorse.Feedback
	for _, e := range events {
		fb := gorse.Feedback{
			FeedbackType: string(e.Type),
			UserId:       e.UserID,
			ItemId:       e.ItemID,
			Value:        e.Value,
			Timestamp:    e.OccurredAt,
		}
		if e.Type.Accumulates() {
			accumulate = append(accumulate, fb)
		} else {
			overwrite = append(overwrite, fb)
		}
	}

	if _, err := client.InsertFeedback(ctx, accumulate); err != nil {
		return err
	}
	if _, err := client.PutFeedback(ctx, overwrite); err != nil {
		return err
	}
	return nil
}

func (r *recommendRepo) Recommend(ctx context.Context, userID, category string, n, offset int) ([]biz.ScoredItem, error) {
	client := r.data.gorse.Client()
	if client == nil || userID == "" {
		return nil, nil
	}
	scores, err := client.Recommend(ctx, userID, category, n, offset)
	if err != nil {
		return nil, err
	}
	return toScoredItems(scores), nil
}

func (r *recommendRepo) SessionRecommend(ctx context.Context, events []biz.Event, n int) ([]biz.ScoredItem, error) {
	client := r.data.gorse.Client()
	if client == nil || len(events) == 0 {
		return nil, nil
	}
	fb := make([]gorse.Feedback, 0, len(events))
	for _, e := range events {
		fb = append(fb, gorse.Feedback{
			FeedbackType: string(e.Type),
			UserId:       e.UserID,
			ItemId:       e.ItemID,
			Value:        e.Value,
			Timestamp:    e.OccurredAt,
		})
	}
	scores, err := client.SessionRecommend(ctx, fb, n)
	if err != nil {
		return nil, err
	}
	return toScoredItems(scores), nil
}

func (r *recommendRepo) Neighbors(ctx context.Context, itemID, category string, n int) ([]biz.ScoredItem, error) {
	client := r.data.gorse.Client()
	if client == nil {
		return nil, nil
	}
	scores, err := client.Neighbors(ctx, itemID, category, n, 0)
	if err != nil {
		return nil, err
	}
	return toScoredItems(scores), nil
}

func (r *recommendRepo) Latest(ctx context.Context, userID, category string, n, offset int) ([]biz.ScoredItem, error) {
	client := r.data.gorse.Client()
	if client == nil {
		return nil, nil
	}
	scores, err := client.LatestItems(ctx, userID, category, n, offset)
	if err != nil {
		return nil, err
	}
	return toScoredItems(scores), nil
}

func (r *recommendRepo) Healthz(ctx context.Context) error {
	client := r.data.gorse.Client()
	if client == nil {
		return nil
	}
	return client.Healthz(ctx)
}

func toScoredItems(scores []gorse.Score) []biz.ScoredItem {
	out := make([]biz.ScoredItem, 0, len(scores))
	for _, s := range scores {
		out = append(out, biz.ScoredItem{ItemID: s.Id, Score: s.Score})
	}
	return out
}
