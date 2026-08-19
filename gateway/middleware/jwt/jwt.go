package jwt

import (
	"context"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/pem"
	goErrors "errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/go-kratos/gateway/middleware/routerfilter"

	config "github.com/go-kratos/gateway/api/gateway/config/v1"
	"github.com/go-kratos/gateway/constants"
	"github.com/go-kratos/gateway/middleware"
	"github.com/go-kratos/gateway/pkg/loader"
	"github.com/go-kratos/gateway/proxy/auth"
	kratoserrors "github.com/go-kratos/kratos/v2/errors"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/golang-jwt/jwt/v5"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

var (
	logger        = log.NewHelper(log.With(log.DefaultLogger, "module", "middleware/jwt"))
	NotAuthN      = kratoserrors.New(401, "JWT_AUTHN_REQUIRED", "未授权: 需要身份验证")
	publicKey     *rsa.PublicKey
	publicKeyPath string
	initialized   bool
	mu            sync.RWMutex
)

func Init(ctx context.Context, source loader.Source) error {
	if initialized {
		return nil
	}

	// 初始化公钥路径
	publicKeyPath = getPublicKeyPath()

	// 创建密钥目录
	if err := os.MkdirAll(filepath.Dir(publicKeyPath), 0o755); err != nil {
		logger.Errorf("[JWT] 创建密钥目录失败: %v", err)
		return kratoserrors.New(500, "INTERNAL_ERROR", "创建密钥目录失败")
	}

	// 同步公钥文件
	key := loader.RelatedKey(source.MainKey(), filepath.ToSlash(filepath.Join(constants.SecretsDirName, constants.JwtPublicFileName)))
	if err := loader.SyncFile(
		ctx,
		source,
		key,
		publicKeyPath,
		validatePublicKey,
	); err != nil {
		logger.Errorf("[JWT] 公钥同步失败: %v", err)
		return kratoserrors.New(500, "INTERNAL_ERROR", "公钥同步失败")
	}

	// 初始加载公钥
	if err := reloadPublicKey(); err != nil {
		logger.Errorf("[JWT] 初始公钥加载失败: %v", err)
		return kratoserrors.New(500, "INTERNAL_ERROR", "初始公钥加载失败")
	}

	if source.Name() != constants.ConfigSourceFile {
		go func() {
			err := loader.WatchFile(ctx, source, key, publicKeyPath, validatePublicKey, reloadPublicKey,
				func(err error) { logger.Errorf("[JWT] 公钥更新失败，保留当前公钥: %v", err) })
			if err != nil && ctx.Err() == nil {
				logger.Errorf("[JWT] 公钥监听退出: %v", err)
			}
		}()
	}

	middleware.Register("jwt", Middleware)
	initialized = true
	logger.Info("[JWT] 初始化完成")
	return nil
}

func getPublicKeyPath() string {
	if pubPath := os.Getenv(constants.JwtPubkeyPath); pubPath != "" {
		return filepath.Clean(pubPath) // 防止路径注入
	}
	return filepath.Join(
		constants.ConfigDir,
		constants.SecretsDirName,
		constants.JwtPublicFileName,
	)
}

func reloadPublicKey() error {
	mu.Lock()
	defer mu.Unlock()

	// 检查文件是否最新
	_, err := os.Stat(publicKeyPath)
	if err != nil {
		logger.Errorf("[JWT] 文件状态获取失败: %v", err)
		return kratoserrors.New(500, "INTERNAL_ERROR", "文件状态获取失败")
	}

	data, err := os.ReadFile(publicKeyPath)
	if err != nil {
		logger.Errorf("[JWT] 读取文件失败: %v", err)
		return kratoserrors.New(500, "INTERNAL_ERROR", "读取文件失败")
	}

	// 添加哈希校验
	newHash := fmt.Sprintf("%x", sha256.Sum256(data))
	if publicKey != nil {
		oldHash := fmt.Sprintf("%x", sha256.Sum256(publicKey.N.Bytes()))
		if newHash == oldHash {
			logger.Warn("[JWT] 公钥未发生实际变更")
			return nil
		}
	}
	block, _ := pem.Decode(data)
	if block == nil {
		logger.Errorf("[JWT] PEM 解码失败")
		return kratoserrors.New(400, "PEM_DECODE_FAILED", "PEM 解码失败")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		logger.Errorf("[JWT] 证书解析失败: %v", err)
		return kratoserrors.New(400, "CERT_PARSE_FAILED", "证书解析失败")
	}

	pubKey, ok := cert.PublicKey.(*rsa.PublicKey)
	if !ok {
		logger.Errorf("[JWT] 非 RSA 公钥类型")
		return kratoserrors.New(400, "NOT_RSA_PUBLIC_KEY", "非 RSA 公钥类型")
	}

	publicKey = pubKey
	logger.Infof("[JWT] 公钥已更新 (SHA256: %s)", newHash)
	return nil
}

func validatePublicKey(tempPath string) error {
	data, err := os.ReadFile(tempPath)
	if err != nil {
		logger.Errorf("[JWT] 读取公钥文件失败: %v", err)
		return kratoserrors.New(500, "INTERNAL_ERROR", "读取公钥文件失败")
	}

	block, _ := pem.Decode(data)
	if block == nil {
		logger.Errorf("[JWT] 无效PEM格式")
		return kratoserrors.New(400, "INVALID_PEM_FORMAT", "无效PEM格式")
	}

	if _, err := x509.ParseCertificate(block.Bytes); err != nil {
		logger.Errorf("[JWT] 证书解析失败: %v", err)
		return kratoserrors.New(400, "CERT_PARSE_FAILED", "证书解析失败")
	}
	return nil
}

type CustomClaims struct {
	jwt.RegisteredClaims
	auth.User
}

func ParseJwt(tokenString string) (*CustomClaims, error) {
	mu.RLock()
	defer mu.RUnlock()

	t, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodRS256 {
			logger.Errorf("[JWT] 不支持的签名方法: %v", token.Method.Alg())
			return nil, kratoserrors.New(400, "INVALID_SIGNING_METHOD", "不支持的签名方法")
		}
		return publicKey, nil
	},
		// 容忍网关与 Casdoor 之间的时钟偏移：否则刚签发的令牌（nbf/iat≈now）
		// 在前端登录后毫秒级请求时会被判定为 "token is not valid yet" 而 401，导致登录死循环。
		jwt.WithLeeway(60*time.Second),
	)

	// 首先检查是否是令牌过期错误
	if goErrors.Is(err, jwt.ErrTokenExpired) {
		logger.Warn("[JWT] 令牌已过期")
		return nil, kratoserrors.New(401, "TOKEN_EXPIRED", "令牌已过期")
	}

	// 处理其他解析错误
	if err != nil {
		logger.Errorf("[JWT] 令牌解析失败: %v", err)
		return nil, kratoserrors.New(401, "TOKEN_PARSE_FAILED", "令牌解析失败")
	}

	// 检查令牌声明是否有效
	if claims, ok := t.Claims.(*CustomClaims); ok && t.Valid {
		return claims, nil
	}

	// 处理无效的令牌声明
	logger.Errorf("[JWT] 无效的令牌声明")
	return nil, kratoserrors.New(401, "INVALID_TOKEN_CLAIMS", "无效的令牌声明")
}

// inboundIdentityHeaders 是下游服务据以判断"我在为谁服务"的全部头。
// 它们只允许由网关按验签结果注入，客户端传什么都必须先丢掉。
// 新增同类头时**必须**登记到这里，否则又会出现一条可伪造的身份通道。
var inboundIdentityHeaders = []string{
	constants.UserIdMetadataKey,
	constants.UserNameMetadataKey,
	constants.UserRoleMetadataKey,  // RBAC 中间件注入，同样不能由客户端自带
	constants.UserOwnerMetadataKey, // 同上
}

// stripInboundIdentity 丢弃客户端自带的身份头。
// 用 Del 而不是 Set("")：Set("") 会留下一个空值的头，下游若用 "键是否存在" 判断就仍会误判。
func stripInboundIdentity(req *http.Request) {
	for _, h := range inboundIdentityHeaders {
		if req.Header.Get(h) != "" {
			// 这是被拦下的伪造尝试，值得留痕(只记键名与路径，不记值，避免把攻击载荷写进日志)
			logger.Warnf("[JWT] 丢弃客户端自带的身份头 %s: %s %s", h, req.Method, req.URL.Path)
		}
		req.Header.Del(h)
	}
}

func Middleware(c *config.Middleware) (middleware.Middleware, error) {
	matchers := make([]*routerfilter.PathMatcher, 0)
	if c.GetRouterFilter() != nil {
		for _, rule := range c.GetRouterFilter().Rules {
			matcher, err := routerfilter.NewPathMatcher(rule.Path, rule.Methods)
			if err != nil {
				logger.Errorf("[JWT] 创建路径匹配器失败: %v", err)
				return nil, kratoserrors.New(500, "INTERNAL_ERROR", "创建路径匹配器失败")
			}
			matchers = append(matchers, matcher)
			// 记录创建的匹配器规则
			// logger.Infof("[JWT] 创建匹配器规则: %s, 方法: %v", rule.Path, rule.Methods)
		}
	}

	tracer := otel.Tracer("middleware/jwt")

	return func(next http.RoundTripper) http.RoundTripper {
		return middleware.RoundTripperFunc(func(req *http.Request) (*http.Response, error) {
			ctx, span := tracer.Start(req.Context(), "middleware.jwt", trace.WithSpanKind(trace.SpanKindInternal))
			defer span.End()

			// ⚠️ 必须是入口的第一件事，且在跳过规则之前 ——
			// 下游服务(cart/address/behavior…)一律裸信 x-md-global-*，自己不验签，
			// 信任模型是"网关是唯一入口且这些头只可能由网关注入"。
			// 之前只在验签成功时 Set，从不 Del：白名单路径直接 next.RoundTrip 放行，
			// 客户端自带的 x-md-global-user-id 就原样到了下游，等于任何人都能自称是谁。
			// (behavior 的 identity() 明确写着"网关注入的是可信来源，优先级高于 anon_id")
			//
			// 白名单的语义是"不要求登录"，不是"允许自称身份"，所以这里无条件剥离。
			stripInboundIdentity(req)

			// 记录请求路径用于调试
			logger.Infof("[JWT] 处理请求: %s %s", req.Method, req.URL.Path)

			// 检查是否匹配跳过规则
			logger.Infof("[JWT] 开始匹配跳过规则，共有 %d 个规则", len(matchers))
			for i, matcher := range matchers {
				ok, _ := matcher.Match(req)
				logger.Infof("[JWT] 规则 %d 匹配结果: %t, 原始模式: %s, 请求路径: %s, 请求方法: %s", i, ok, matcher.RawPattern(), req.URL.Path, req.Method)
				if ok {
					logger.Infof("[JWT] 请求匹配跳过规则，不需要JWT验证: %s %s", req.Method, req.URL.Path)
					span.SetStatus(codes.Ok, "skipped")
					return next.RoundTrip(req.WithContext(ctx))
				}
			}

			authHeader := req.Header.Get("Authorization")
			if !strings.HasPrefix(authHeader, "Bearer ") {
				logger.Warn("[JWT] 缺少Bearer token")
				span.SetStatus(codes.Error, "missing token")
				return nil, kratoserrors.New(401, "MISSING_AUTH_TOKEN", "缺少Bearer token")
			}

			claims, err := ParseJwt(strings.TrimPrefix(authHeader, "Bearer "))
			if err != nil {
				logger.Errorf("[JWT] 令牌验证失败: %v", err)
				span.SetStatus(codes.Error, err.Error())
				return nil, err
			}

			req.Header.Set(constants.UserIdMetadataKey, claims.User.Id)
			req.Header.Set(constants.UserNameMetadataKey, claims.User.Name)
			span.SetStatus(codes.Ok, "authenticated")
			return next.RoundTrip(req.WithContext(ctx))
		})
	}, nil
}
