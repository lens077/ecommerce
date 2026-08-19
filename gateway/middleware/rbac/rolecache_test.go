package rbac

import (
	"testing"
	"time"
)

// 缓存的核心不变量：Redis 没配/挂了，也必须能正常读写 L1 并让调用方回源，
// 绝不因为缓存故障而让鉴权失败。
func TestRoleCacheWorksWithoutRedis(t *testing.T) {
	roleRedis = nil // 模拟未配置或连接失败后的降级状态

	if _, ok := roleCacheGet("nobody"); ok {
		t.Fatal("空缓存不应命中")
	}

	roleCacheSet("u-1", "admin")
	role, ok := roleCacheGet("u-1")
	if !ok || role != "admin" {
		t.Fatalf("L1 读写失败: got %q, ok=%v", role, ok)
	}

	InvalidateRole("u-1")
	if _, ok := roleCacheGet("u-1"); ok {
		t.Fatal("InvalidateRole 后不应再命中")
	}
}

// 空角色不入缓存：否则一次异常结果会被固化一个 TTL。
func TestRoleCacheSkipsEmptyRole(t *testing.T) {
	roleRedis = nil
	roleCacheSet("u-empty", "")
	if _, ok := roleCacheGet("u-empty"); ok {
		t.Fatal("空角色不应被缓存")
	}
}

// TTL 到期后必须失效，否则 Casdoor 侧改了角色永远不生效。
func TestRoleCacheExpires(t *testing.T) {
	roleRedis = nil
	orig := roleCacheTTL
	roleCacheTTL = 30 * time.Millisecond
	defer func() { roleCacheTTL = orig }()

	roleCacheSet("u-ttl", "user")
	if _, ok := roleCacheGet("u-ttl"); !ok {
		t.Fatal("刚写入就应命中")
	}
	time.Sleep(60 * time.Millisecond)
	if _, ok := roleCacheGet("u-ttl"); ok {
		t.Fatal("TTL 过期后仍命中")
	}
}
