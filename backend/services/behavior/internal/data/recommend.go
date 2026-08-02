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

func (r *recommendRepo) Enabled() bool {
	return r.data.gorseEnabled && r.data.gorse != nil
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
	if !r.Enabled() || len(events) == 0 {
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

	if _, err := r.data.gorse.InsertFeedback(ctx, accumulate); err != nil {
		return err
	}
	if _, err := r.data.gorse.PutFeedback(ctx, overwrite); err != nil {
		return err
	}
	return nil
}

func (r *recommendRepo) Recommend(ctx context.Context, userID, category string, n, offset int) ([]biz.ScoredItem, error) {
	if !r.Enabled() || userID == "" {
		return nil, nil
	}
	scores, err := r.data.gorse.Recommend(ctx, userID, category, n, offset)
	if err != nil {
		return nil, err
	}
	return toScoredItems(scores), nil
}

func (r *recommendRepo) SessionRecommend(ctx context.Context, events []biz.Event, n int) ([]biz.ScoredItem, error) {
	if !r.Enabled() || len(events) == 0 {
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
	scores, err := r.data.gorse.SessionRecommend(ctx, fb, n)
	if err != nil {
		return nil, err
	}
	return toScoredItems(scores), nil
}

func (r *recommendRepo) Neighbors(ctx context.Context, itemID, category string, n int) ([]biz.ScoredItem, error) {
	if !r.Enabled() {
		return nil, nil
	}
	scores, err := r.data.gorse.Neighbors(ctx, itemID, category, n, 0)
	if err != nil {
		return nil, err
	}
	return toScoredItems(scores), nil
}

func (r *recommendRepo) Latest(ctx context.Context, userID, category string, n, offset int) ([]biz.ScoredItem, error) {
	if !r.Enabled() {
		return nil, nil
	}
	scores, err := r.data.gorse.LatestItems(ctx, userID, category, n, offset)
	if err != nil {
		return nil, err
	}
	return toScoredItems(scores), nil
}

func (r *recommendRepo) Healthz(ctx context.Context) error {
	if !r.Enabled() {
		return nil
	}
	return r.data.gorse.Healthz(ctx)
}

func toScoredItems(scores []gorse.Score) []biz.ScoredItem {
	out := make([]biz.ScoredItem, 0, len(scores))
	for _, s := range scores {
		out = append(out, biz.ScoredItem{ItemID: s.Id, Score: s.Score})
	}
	return out
}
