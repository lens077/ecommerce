// Package identity 读取网关注入的可信身份头，并给出「访客 vs 登录用户」的判定。
//
// 背景：匿名购物（docs/design/platform/anonymous-shopping.md）让网关也会给**未登录
// 用户**注入 x-md-global-user-id——它是一个合法 UUID，与真实用户 ID 形状完全一样。
// 两者唯一的区别是访客请求额外带 x-md-global-anonymous: true。
//
// 因此下游服务判定「这个接口必须登录」时：
//
//	❌ 错：userID != ""            —— 访客也满足，等于把访客放进下单/支付链路
//	✅ 对：RequireUser(header)     —— 显式拒绝带匿名标记的请求
//
// 这些头由网关无条件剥离后重新注入，客户端伪造不了（control-tower
// services/gateway/internal/identity）。服务侧直接信任，不再验签。
package identity

import (
	"errors"
	"net/http"
)

// 头名与网关注入端逐字一致（.service-matrix.yaml 与 control-tower 共同契约）。
const (
	HeaderUserID    = "x-md-global-user-id"
	HeaderAnonymous = "x-md-global-anonymous"
)

// ErrAnonymousNotAllowed 表示该接口要求登录用户，而来访者是访客。
// 调用方应转换成 connect.CodeUnauthenticated 返回。
var ErrAnonymousNotAllowed = errors.New("identity: 该操作需要登录用户，访客身份不被接受")

// ErrNoIdentity 表示网关没有注入任何身份——通常意味着路由配置漏了，
// 或该路径被放进了 anonymous 清单（完全无身份）却又被当作需要身份的接口实现。
var ErrNoIdentity = errors.New("identity: 请求没有携带身份头")

// IsAnonymous 判定当前请求是否来自访客。
func IsAnonymous(h http.Header) bool {
	return h.Get(HeaderAnonymous) == "true"
}

// UserID 返回身份头里的 ID（可能是真实用户，也可能是访客）。
// 需要区分二者时用 RequireUser / IsAnonymous，不要只判空。
func UserID(h http.Header) string {
	return h.Get(HeaderUserID)
}

// RequireUser 返回**登录用户**的 ID。
// 访客请求返回 ErrAnonymousNotAllowed；无身份返回 ErrNoIdentity。
//
// C 级接口（下单/支付/地址簿/个人中心）一律用这个函数取身份。
func RequireUser(h http.Header) (string, error) {
	id := h.Get(HeaderUserID)
	if id == "" {
		return "", ErrNoIdentity
	}
	if IsAnonymous(h) {
		return "", ErrAnonymousNotAllowed
	}
	return id, nil
}

// RequireAny 返回身份 ID，允许访客。
// B 级接口（购物车）用它——访客与登录用户在这里是平权的。
func RequireAny(h http.Header) (string, error) {
	id := h.Get(HeaderUserID)
	if id == "" {
		return "", ErrNoIdentity
	}
	return id, nil
}
