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
	"fmt"
	"net/http"
	"strings"
)

// 头名与网关注入端逐字一致（.service-matrix.yaml 与 control-tower 共同契约）。
const (
	HeaderUserID    = "x-md-global-user-id"
	HeaderAnonymous = "x-md-global-anonymous"
	// HeaderRole 是网关按已验签 claims 注入的角色列表，多角色逗号拼接。
	// 角色名与 Casdoor 原值一致（control-tower docs/design/auth.md）：admin / merchant / customer。
	HeaderRole = "x-md-global-role"
)

// 粗粒度角色名。这里只列 handler 内做「动作级」判定时用到的；
// 对象级授权目标由 OpenFGA 承担（TECH.md §8.2），接线前先用角色收口。
const (
	RoleAdmin = "admin"
)

// ErrRoleNotAllowed 表示登录用户没有该操作要求的角色。
// 调用方应转换成 connect.CodePermissionDenied 返回。
var ErrRoleNotAllowed = errors.New("identity: 当前用户没有执行该操作的角色")

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

// Roles 返回网关注入的角色列表（去空白、去空项）。访客与无角色用户返回空切片。
func Roles(h http.Header) []string {
	raw := h.Get(HeaderRole)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := parts[:0]
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// RequireRole 返回**登录用户**的 ID，并要求其持有 role。
//
// 这是 TECH.md §8.5 原则六「网关不是唯一防线」在 handler 内的落点：网关 Casbin 按
// (procedure, method) 粗粒度放行，handler 自己再判「这个主体能不能做这个动作」。
// 到了这一层，请求是什么 HTTP 方法已经无关——攻击者改传输层逃不掉这一行。
// 访客、无身份、角色不含 role 分别返回 ErrAnonymousNotAllowed / ErrNoIdentity / ErrRoleNotAllowed。
func RequireRole(h http.Header, role string) (string, error) {
	id, err := RequireUser(h)
	if err != nil {
		return "", err
	}
	for _, r := range Roles(h) {
		if r == role {
			return id, nil
		}
	}
	return "", fmt.Errorf("%w: 需要 %q", ErrRoleNotAllowed, role)
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
