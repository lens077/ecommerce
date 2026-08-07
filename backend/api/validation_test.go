package api_test

import (
	"math"
	"strings"
	"testing"

	"buf.build/go/protovalidate"
	addressv1 "github.com/lens077/ecommerce/backend/api/address/v1"
	behaviorv1 "github.com/lens077/ecommerce/backend/api/behavior/v1"
	cartv1 "github.com/lens077/ecommerce/backend/api/cart/v1"
	casdoorv1 "github.com/lens077/ecommerce/backend/api/casdoor/v1"
	paymentv1 "github.com/lens077/ecommerce/backend/api/payment/v1"
	telemetryv1 "github.com/lens077/ecommerce/backend/api/telemetry/v1"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/wrapperspb"
)

func TestValidationRulesCompileAndRejectInvalidPayloads(t *testing.T) {
	t.Parallel()

	validator, err := protovalidate.New()
	if err != nil {
		t.Fatalf("create validator: %v", err)
	}

	tests := []struct {
		name string
		msg  proto.Message
	}{
		{
			name: "wrapped address field",
			msg: &addressv1.UpdateAddressRequest{
				AddressId:     "018f47a2-9e4b-7d83-a5a0-b09a4bb9422d",
				RecipientName: wrapperspb.String(""),
			},
		},
		{
			name: "parallel cart arrays",
			msg: &cartv1.RemoveCartItemRequest{
				SpuIds:      []int64{1},
				SkuIds:      []int64{2},
				MerchantIds: []string{"018f47a2-9e4b-7d83-a5a0-b09a4bb9422d"},
				Status:      nil,
			},
		},
		{
			name: "non-finite behavior value",
			msg: &behaviorv1.TrackRequest{
				Events: []*behaviorv1.Event{{
					Type:   behaviorv1.EventType_EVENT_TYPE_DWELL,
					ItemId: "sku-1",
					Value:  math.NaN(),
				}},
			},
		},
		{
			name: "behavior response batch total",
			msg:  &behaviorv1.TrackResponse{Accepted: 200, Dropped: 1},
		},
		{
			name: "payment decimal precision",
			msg: &paymentv1.CreatePaymentRequest{
				OrderId:          1,
				ConsumerId:       "018f47a2-9e4b-7d83-a5a0-b09a4bb9422d",
				Amount:           "12.345",
				Currency:         "CNY",
				Subject:          "order",
				ReturnUrl:        "https://example.com/payment/result",
				FreezeId:         1,
				MerchantVersions: []int64{0},
			},
		},
		{
			name: "casdoor provider payload",
			msg:  &casdoorv1.User{Github: strings.Repeat("x", 2049)},
		},
		{
			name: "non-finite telemetry value",
			msg: &telemetryv1.CollectWebVitalsRequest{
				Vitals: []*telemetryv1.WebVital{{
					Name:  telemetryv1.WebVitalName_WEB_VITAL_NAME_LCP,
					Value: math.Inf(1),
				}},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := validator.Validate(test.msg); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestValidationRulesAcceptBoundaryPayloads(t *testing.T) {
	t.Parallel()

	validator, err := protovalidate.New()
	if err != nil {
		t.Fatalf("create validator: %v", err)
	}

	tests := []struct {
		name string
		msg  proto.Message
	}{
		{
			name: "partial address update",
			msg: &addressv1.UpdateAddressRequest{
				AddressId: "018f47a2-9e4b-7d83-a5a0-b09a4bb9422d",
			},
		},
		{
			name: "parallel cart arrays",
			msg: &cartv1.RemoveCartItemRequest{
				SpuIds:      []int64{1},
				SkuIds:      []int64{2},
				MerchantIds: []string{"018f47a2-9e4b-7d83-a5a0-b09a4bb9422d"},
				Status:      []cartv1.CartStatus{cartv1.CartStatus_CART_STATUS_ACTIVE},
			},
		},
		{
			name: "behavior event",
			msg: &behaviorv1.TrackRequest{
				Events: []*behaviorv1.Event{{
					Type:   behaviorv1.EventType_EVENT_TYPE_DWELL,
					ItemId: "sku-1",
					Value:  1,
				}},
			},
		},
		{
			name: "behavior response batch total",
			msg:  &behaviorv1.TrackResponse{Accepted: 200},
		},
		{
			name: "payment decimal",
			msg: &paymentv1.CreatePaymentRequest{
				OrderId:          1,
				ConsumerId:       "018f47a2-9e4b-7d83-a5a0-b09a4bb9422d",
				Amount:           "12.34",
				Currency:         "CNY",
				Subject:          "order",
				ReturnUrl:        "https://example.com/payment/result",
				FreezeId:         1,
				MerchantVersions: []int64{0},
			},
		},
		{
			name: "empty casdoor profile",
			msg:  &casdoorv1.User{},
		},
		{
			name: "web vital",
			msg: &telemetryv1.CollectWebVitalsRequest{
				Vitals: []*telemetryv1.WebVital{{
					Name:  telemetryv1.WebVitalName_WEB_VITAL_NAME_LCP,
					Value: 2500,
				}},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := validator.Validate(test.msg); err != nil {
				t.Fatalf("validate boundary payload: %v", err)
			}
		})
	}
}
