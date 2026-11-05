package service

import (
	"context"
	"strings"
	"time"

	"connectrpc.com/connect/v2"
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

func (s *BehaviorService) Track(ctx context.Context, req *v1.TrackRequest) (*v1.TrackResponse, error) {
	userID, anonymous := identity(ctx, req.AnonId)

	// 没有任何身份就没法归因,收下也是废数据,直接当全丢
	if userID == "" {
		return &v1.TrackResponse{
			Dropped: uint32(len(req.Events)),
		}, nil
	}

	accepted, dropped := s.uc.Track(ctx, biz.TrackInput{
		UserID:    userID,
		Anonymous: anonymous,
		SessionID: req.SessionId,
		Events:    toBizEvents(req.Events),
	})

	return &v1.TrackResponse{
		Accepted: uint32(accepted),
		Dropped:  uint32(dropped),
	}, nil
}

func (s *BehaviorService) Recommend(ctx context.Context, req *v1.RecommendRequest) (*v1.RecommendResponse, error) {
	userID, anonymous := identity(ctx, req.AnonId)

	out, err := s.uc.Recommend(ctx, biz.RecommendInput{
		UserID:        userID,
		Anonymous:     anonymous,
		Category:      req.Category,
		N:             int(req.N),
		Offset:        int(req.Offset),
		SessionEvents: toBizEvents(req.SessionEvents),
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err.Error()).WithCause(err)
	}

	return &v1.RecommendResponse{
		Items:    toV1Items(out.Items),
		Strategy: out.Strategy,
	}, nil
}

func (s *BehaviorService) SimilarItems(ctx context.Context, req *v1.SimilarItemsRequest) (*v1.SimilarItemsResponse, error) {
	userID, _ := identity(ctx, "")

	items, err := s.uc.SimilarItems(ctx, userID, req.ItemId, req.Category, int(req.N))
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err.Error()).WithCause(err)
	}

	return &v1.SimilarItemsResponse{
		Items: toV1Items(items),
	}, nil
}

// identity 解析调用方身份。
// 网关注入的 x-md-global-user-id 是可信来源,优先级高于请求体里的 anon_id
// —— anon_id 来自浏览器,任何人都能随便填。
func identity(ctx context.Context, anonID string) (userID string, anonymous bool) {
	// v2 拿不到请求包装对象,网关注入的可信身份改从 CallInfo 读。
	info, _ := connect.CallInfoForServerContext(ctx)
	if info != nil {
		if id := strings.TrimSpace(info.RequestHeader().Get(constants.UserIdMetadataKey)); id != "" {
			return id, false
		}
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
