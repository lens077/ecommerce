package service

import (
	"context"
	"strings"
	"time"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/behavior/v1"
	"github.com/lens077/ecommerce/backend/api/behavior/v1/behaviorv1connect"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/behavior/internal/biz"
)

// 匿名用户在 gorse 里也要占一个 UserId。加前缀是为了和 casdoor 的真实 user id
// 分处两个命名空间,既避免撞号,也让日后做"登录后合并匿名画像"时一眼能认出来。
const anonPrefix = "anon:"

type BehaviorService struct {
	uc *biz.BehaviorUseCase
}

var _ behaviorv1connect.BehaviorServiceHandler = (*BehaviorService)(nil)

func NewBehaviorService(uc *biz.BehaviorUseCase) behaviorv1connect.BehaviorServiceHandler {
	return &BehaviorService{uc: uc}
}

func (s *BehaviorService) Track(ctx context.Context, req *connect.Request[v1.TrackRequest]) (*connect.Response[v1.TrackResponse], error) {
	userID, anonymous := identity(req, req.Msg.AnonId)

	// 没有任何身份就没法归因,收下也是废数据,直接当全丢
	if userID == "" {
		return connect.NewResponse(&v1.TrackResponse{
			Dropped: uint32(len(req.Msg.Events)),
		}), nil
	}

	accepted, dropped := s.uc.Track(ctx, biz.TrackInput{
		UserID:    userID,
		Anonymous: anonymous,
		SessionID: req.Msg.SessionId,
		Events:    toBizEvents(req.Msg.Events),
	})

	return connect.NewResponse(&v1.TrackResponse{
		Accepted: uint32(accepted),
		Dropped:  uint32(dropped),
	}), nil
}

func (s *BehaviorService) Recommend(ctx context.Context, req *connect.Request[v1.RecommendRequest]) (*connect.Response[v1.RecommendResponse], error) {
	userID, anonymous := identity(req, req.Msg.AnonId)

	out, err := s.uc.Recommend(ctx, biz.RecommendInput{
		UserID:        userID,
		Anonymous:     anonymous,
		Category:      req.Msg.Category,
		N:             int(req.Msg.N),
		Offset:        int(req.Msg.Offset),
		SessionEvents: toBizEvents(req.Msg.SessionEvents),
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&v1.RecommendResponse{
		Items:    toV1Items(out.Items),
		Strategy: out.Strategy,
	}), nil
}

func (s *BehaviorService) SimilarItems(ctx context.Context, req *connect.Request[v1.SimilarItemsRequest]) (*connect.Response[v1.SimilarItemsResponse], error) {
	userID, _ := identity(req, "")

	items, err := s.uc.SimilarItems(ctx, userID, req.Msg.ItemId, req.Msg.Category, int(req.Msg.N))
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&v1.SimilarItemsResponse{
		Items: toV1Items(items),
	}), nil
}

// identity 解析调用方身份。
// 网关注入的 x-md-global-user-id 是可信来源,优先级高于请求体里的 anon_id
// —— anon_id 来自浏览器,任何人都能随便填。
func identity[T any](req *connect.Request[T], anonID string) (userID string, anonymous bool) {
	if id := strings.TrimSpace(req.Header().Get(constants.UserIdMetadataKey)); id != "" {
		return id, false
	}
	if anonID = strings.TrimSpace(anonID); anonID != "" {
		return anonPrefix + anonID, true
	}
	return "", true
}

func toBizEvents(in []*v1.Event) []biz.Event {
	out := make([]biz.Event, 0, len(in))
	for _, e := range in {
		t := toEventType(e.Type)
		if t == "" {
			continue
		}
		out = append(out, biz.Event{
			Type:       t,
			ItemID:     e.ItemId,
			Value:      e.Value,
			Source:     e.Source,
			OccurredAt: time.UnixMilli(e.TsMs),
		})
	}
	return out
}

func toEventType(t v1.EventType) biz.EventType {
	switch t {
	case v1.EventType_EVENT_TYPE_IMPRESSION:
		return biz.EventImpression
	case v1.EventType_EVENT_TYPE_READ:
		return biz.EventRead
	case v1.EventType_EVENT_TYPE_DWELL:
		return biz.EventDwell
	case v1.EventType_EVENT_TYPE_CART:
		return biz.EventCart
	case v1.EventType_EVENT_TYPE_FAVORITE:
		return biz.EventFavorite
	case v1.EventType_EVENT_TYPE_PURCHASE:
		return biz.EventPurchase
	case v1.EventType_EVENT_TYPE_DISLIKE:
		return biz.EventDislike
	default:
		return ""
	}
}

func toV1Items(items []biz.ScoredItem) []*v1.RecommendItem {
	out := make([]*v1.RecommendItem, 0, len(items))
	for _, it := range items {
		out = append(out, &v1.RecommendItem{ItemId: it.ItemID, Score: it.Score})
	}
	return out
}
