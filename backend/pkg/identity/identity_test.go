package identity

import (
	"errors"
	"net/http"
	"testing"
)

func hdr(userID, anon string) http.Header {
	h := http.Header{}
	if userID != "" {
		h.Set(HeaderUserID, userID)
	}
	if anon != "" {
		h.Set(HeaderAnonymous, anon)
	}
	return h
}

const (
	realUser = "11111111-1111-4111-8111-111111111111"
	guestID  = "22222222-2222-4222-8222-222222222222"
)

// 这是整个匿名购物设计的安全防线：访客 ID 与真实用户 ID 形状完全相同，
// 只判非空会把访客放进下单/支付链路。
func TestRequireUser_RejectsGuest(t *testing.T) {
	_, err := RequireUser(hdr(guestID, "true"))
	if !errors.Is(err, ErrAnonymousNotAllowed) {
		t.Fatalf("访客必须被拒绝，得到 err=%v", err)
	}
}

func TestRequireUser_AcceptsLoggedIn(t *testing.T) {
	got, err := RequireUser(hdr(realUser, ""))
	if err != nil {
		t.Fatalf("登录用户不该被拒: %v", err)
	}
	if got != realUser {
		t.Errorf("UserID = %q, 期望 %q", got, realUser)
	}
}

func TestRequireUser_NoIdentity(t *testing.T) {
	if _, err := RequireUser(hdr("", "")); !errors.Is(err, ErrNoIdentity) {
		t.Errorf("无身份应返回 ErrNoIdentity，得到 %v", err)
	}
}

// B 级接口对访客与登录用户平权。
func TestRequireAny_AcceptsBoth(t *testing.T) {
	for _, tc := range []struct{ name, id, anon string }{
		{"访客", guestID, "true"},
		{"登录用户", realUser, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := RequireAny(hdr(tc.id, tc.anon))
			if err != nil {
				t.Fatalf("不该报错: %v", err)
			}
			if got != tc.id {
				t.Errorf("ID = %q, 期望 %q", got, tc.id)
			}
		})
	}
}

func TestRequireAny_NoIdentity(t *testing.T) {
	if _, err := RequireAny(hdr("", "")); !errors.Is(err, ErrNoIdentity) {
		t.Errorf("无身份应返回 ErrNoIdentity，得到 %v", err)
	}
}

// 只有精确的 "true" 算匿名标记。网关注入的就是这个值；
// 若将来有人注入 "1"/"yes" 之类，应当在网关侧统一，而不是让下游各自猜。
func TestIsAnonymous_OnlyExactTrue(t *testing.T) {
	if IsAnonymous(hdr(guestID, "false")) {
		t.Error(`"false" 不该判为匿名`)
	}
	if !IsAnonymous(hdr(guestID, "true")) {
		t.Error(`"true" 应判为匿名`)
	}
}
