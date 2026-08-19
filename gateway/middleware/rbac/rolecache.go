package rbac

// RBAC 角色缓存的 L2（Redis）。
//
// 为什么需要：此前 getUserRoles 里读缓存那三行是注释掉的，只写不读 ——
// 于是**每个受保护请求都实打实打一次 Casdoor** 的 /api/get-user。后果有两条：
//   1. 网关在局域网集群、Casdoor 在公网 VPS，每个请求都白付一次跨公网 RTT；
//   2. Casdoor 挂掉 = 全站鉴权挂掉（fetch 失败直接 503）。
//
// 分两级：
//   L1 = 进程内 map（已存在的 Cache），命中不产生任何网络 IO；
//   L2 = Redis，跨网关副本共享，副本重启后不必重新回源。
//
// 设计上的三条硬规则：
//   - **缓存不可用一律降级到回源**，绝不因为缓存故障而拒绝请求。缓存是省调用的，
//     不是鉴权依据；把它做成硬依赖等于凭空多一个能让全站 401 的组件。
//   - 只缓存**成功**的查询结果。错误不缓存，否则 Casdoor 抖一下就会把"查不到角色"
//     固化 TTL 那么久。
//   - Redis 操作全部带独立短超时，不继承请求的 ctx —— 缓存慢不能拖垮请求。

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"os"
	"strconv"
	"time"

	"github.com/go-kratos/gateway/constants"
	"github.com/redis/go-redis/v9"
)

const (
	// redisOpTimeout 单次缓存操作的上限。取值原则：必须**远小于**回源 Casdoor 的
	// 3s 超时，否则缓存慢的时候还不如直接回源。
	redisOpTimeout = 200 * time.Millisecond
	// roleCacheKeyPrefix 带版本号，将来改缓存值的格式时递增即可让旧值自然失效，
	// 不必手工清库。
	roleCacheKeyPrefix  = "gw:rbac:role:v1:"
	defaultRoleCacheTTL = 5 * time.Minute
)

var (
	roleRedis    *redis.Client
	roleCacheTTL = defaultRoleCacheTTL
)

// initRoleCache 按环境变量初始化 L2。地址留空则只用 L1，属正常配置而非错误。
func initRoleCache() {
	if ttlStr := os.Getenv(constants.RbacRoleCacheTTL); ttlStr != "" {
		if d, err := time.ParseDuration(ttlStr); err == nil && d > 0 {
			roleCacheTTL = d
		} else {
			logger.Warnf("[RBAC] %s=%q 解析失败，沿用默认 %s", constants.RbacRoleCacheTTL, ttlStr, defaultRoleCacheTTL)
		}
	}

	addr := os.Getenv(constants.RedisAddr)
	if addr == "" {
		logger.Infof("[RBAC] 未配置 %s，仅使用进程内角色缓存（TTL %s）", constants.RedisAddr, roleCacheTTL)
		return
	}

	opt := &redis.Options{
		Addr:     addr,
		Password: os.Getenv(constants.RedisPassword),
		// 连接期超时同样要短：网关启动时 Redis 没起来不应该拖住整个网关。
		DialTimeout:  2 * time.Second,
		ReadTimeout:  redisOpTimeout,
		WriteTimeout: redisOpTimeout,
	}
	if db := os.Getenv(constants.RedisDB); db != "" {
		if n, err := strconv.Atoi(db); err == nil {
			opt.DB = n
		}
	}

	// 集群内 Redis 开了原生 TLS：service 端口 6379 转发到容器 6380 的 TLS 口，
	// 不带 TLS 连过去会被 reset（不是"连不上"，容易误判成网络问题）。
	if caFile := os.Getenv(constants.RedisTLSCAFile); caFile != "" {
		pem, err := os.ReadFile(caFile)
		if err != nil {
			logger.Errorf("[RBAC] 读取 Redis CA 失败(%s)，降级为仅 L1: %v", caFile, err)
			return
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(pem) {
			logger.Errorf("[RBAC] Redis CA 解析失败(%s)，降级为仅 L1", caFile)
			return
		}
		opt.TLSConfig = &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
	}

	client := redis.NewClient(opt)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		// 起不来不算致命：降级到仅 L1，网关照常提供服务。
		logger.Errorf("[RBAC] Redis 连接失败(%s)，降级为仅进程内缓存: %v", addr, err)
		_ = client.Close()
		return
	}

	roleRedis = client
	logger.Infof("[RBAC] 角色缓存已接入 Redis %s（TTL %s，TLS=%t）", addr, roleCacheTTL, opt.TLSConfig != nil)
}

// roleCacheGet 依次查 L1 → L2。任何一层出错都当作未命中，交由调用方回源。
func roleCacheGet(userID string) (string, bool) {
	if v, ok := cache.Get(userID); ok {
		if role, ok := v.(string); ok && role != "" {
			return role, true
		}
	}
	if roleRedis == nil {
		return "", false
	}

	ctx, cancel := context.WithTimeout(context.Background(), redisOpTimeout)
	defer cancel()
	role, err := roleRedis.Get(ctx, roleCacheKeyPrefix+userID).Result()
	if err != nil {
		// redis.Nil 是正常的未命中，不值得记日志；其余才是真异常。
		if err != redis.Nil {
			logger.Warnf("[RBAC] 读 Redis 角色缓存失败，回源 Casdoor: %v", err)
		}
		return "", false
	}
	if role == "" {
		return "", false
	}
	// 回填 L1，让同一副本的后续请求连 Redis 都不用查
	cache.Set(userID, role)
	return role, true
}

// roleCacheSet 同时写 L1 与 L2。写失败只记日志 —— 缓存写不进去不影响本次请求的正确性。
func roleCacheSet(userID, role string) {
	if role == "" {
		return
	}
	cache.Set(userID, role)
	if roleRedis == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), redisOpTimeout)
	defer cancel()
	if err := roleRedis.Set(ctx, roleCacheKeyPrefix+userID, role, roleCacheTTL).Err(); err != nil {
		logger.Warnf("[RBAC] 写 Redis 角色缓存失败(不影响本次请求): %v", err)
	}
}

// InvalidateRole 在 Casdoor 侧改了某人的角色后主动踢掉缓存。
// 目前没有调用方（Casdoor webhook 接进来后即可使用，node1 上已有 casdoor-webhook-handle 容器）；
// 导出它是为了让"改了角色要等 TTL"这个已知延迟有一条可收敛的路径。
func InvalidateRole(userID string) {
	cache.Delete(userID)
	if roleRedis == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), redisOpTimeout)
	defer cancel()
	if err := roleRedis.Del(ctx, roleCacheKeyPrefix+userID).Err(); err != nil {
		logger.Warnf("[RBAC] 删除 Redis 角色缓存失败: %v", err)
	}
}
