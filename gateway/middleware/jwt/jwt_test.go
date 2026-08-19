package jwt

import (
	"net/http"
	"path/filepath"
	"testing"

	"github.com/go-kratos/gateway/constants"
)

func TestGetPublicKeyPathUsesConfiguredPath(t *testing.T) {
	configuredPath := filepath.Join(t.TempDir(), "keys", "..", "public.pem")
	t.Setenv(constants.JwtPubkeyPath, configuredPath)

	if got, want := getPublicKeyPath(), filepath.Clean(configuredPath); got != want {
		t.Fatalf("getPublicKeyPath() = %q, want %q", got, want)
	}
}

// 身份头伪造回归测试。
//
// 背景：下游服务(cart/address/behavior)一律裸信 x-md-global-*、自己不验签，
// 全靠"网关是唯一入口且这些头只由网关注入"这条约定。曾经的实现只在验签成功时
// Set、从不 Del，于是白名单路径(不需要 JWT 的那 10 条)上客户端自带的
// x-md-global-user-id 会原样透传到下游 —— 任何人都能自称是任何人。
//
// 这个测试钉住的不变量：**无论走哪条路径、验不验签，客户端自带的身份头都到不了下游。**
func TestStripInboundIdentityRemovesClientSuppliedHeaders(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "/behavior.v1.BehaviorService/Track", nil)
	if err != nil {
		t.Fatalf("构造请求失败: %v", err)
	}

	// 模拟攻击者在白名单路径上自带全套身份头
	req.Header.Set(constants.UserIdMetadataKey, "victim-user-id")
	req.Header.Set(constants.UserNameMetadataKey, "victim")
	req.Header.Set(constants.UserRoleMetadataKey, "admin")
	req.Header.Set(constants.UserOwnerMetadataKey, "lens")

	stripInboundIdentity(req)

	for _, h := range inboundIdentityHeaders {
		if got := req.Header.Get(h); got != "" {
			t.Errorf("%s 未被剥离，仍为 %q —— 下游会把它当可信身份", h, got)
		}
		// Del 而非 Set("")：确保键本身消失，下游用 "键是否存在" 判断时也不会误判
		if _, exists := req.Header[http.CanonicalHeaderKey(h)]; exists {
			t.Errorf("%s 的键仍然存在（应当被 Del 掉，而不是置空）", h)
		}
	}
}

// 覆盖登记完整性：漏登记一个头就等于留一条可伪造通道。
func TestInboundIdentityHeadersCoversAllMetadataKeys(t *testing.T) {
	want := map[string]bool{
		constants.UserIdMetadataKey:    false,
		constants.UserNameMetadataKey:  false,
		constants.UserRoleMetadataKey:  false,
		constants.UserOwnerMetadataKey: false,
	}
	for _, h := range inboundIdentityHeaders {
		if _, ok := want[h]; !ok {
			t.Errorf("inboundIdentityHeaders 含未知头 %q", h)
			continue
		}
		want[h] = true
	}
	for h, covered := range want {
		if !covered {
			t.Errorf("身份头 %q 未登记进 inboundIdentityHeaders —— 它将可被客户端伪造", h)
		}
	}
}
