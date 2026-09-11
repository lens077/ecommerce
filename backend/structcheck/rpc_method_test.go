package structcheck

import (
	"bufio"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// getEnabledRPCs 是允许经 GET 到达的 procedure 白名单（`/pkg.Service/Method`）。
//
// 加一条要同时满足（context/team/proto-design.md「方法与副作用」）：
//  1. 该 RPC 真的无副作用——GET 请求跳过网关 CSRF Origin 校验（control-tower
//     httpmw safeMethod），有副作用的 GET 就是 CSRF 入口；
//  2. control-tower authz.allowedAct 同步放开该 procedure 的 GET，否则 Casbin
//     默认拒绝，标了也到不了 handler。
var getEnabledRPCs = map[string]bool{}

var (
	rpcLine         = regexp.MustCompile(`^\s*rpc\s+(\w+)\s*\(`)
	packageLine     = regexp.MustCompile(`^\s*package\s+([\w.]+)\s*;`)
	serviceLine     = regexp.MustCompile(`^\s*service\s+(\w+)\s*\{`)
	idempotencyLine = regexp.MustCompile(`idempotency_level\s*=\s*NO_SIDE_EFFECTS`)
)

// TestNoSideEffectsRPCsAreAllowlisted 挡住「为了让 CDN 缓存把有副作用的 RPC 标成
// NO_SIDE_EFFECTS」——这是本栈「基于请求方法的访问控制绕过」最可能的入口：
// Connect 只对标了该选项的方法接受 GET，而网关对 GET 免 CSRF 校验。
func TestNoSideEffectsRPCsAreAllowlisted(t *testing.T) {
	t.Parallel()

	var protos []string
	err := filepath.WalkDir("../api", func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(path, ".proto") {
			protos = append(protos, path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("遍历 backend/api: %v", err)
	}
	if len(protos) == 0 {
		t.Fatal("backend/api 下没找到任何 .proto，检查路径")
	}

	for _, path := range protos {
		f, err := os.Open(path)
		if err != nil {
			t.Fatalf("打开 %s: %v", path, err)
		}
		var pkg, svc, rpc string
		sc := bufio.NewScanner(f)
		for line := 1; sc.Scan(); line++ {
			text := sc.Text()
			if m := packageLine.FindStringSubmatch(text); m != nil {
				pkg = m[1]
			}
			if m := serviceLine.FindStringSubmatch(text); m != nil {
				svc = m[1]
			}
			if m := rpcLine.FindStringSubmatch(text); m != nil {
				rpc = m[1]
			}
			if !idempotencyLine.MatchString(text) {
				continue
			}
			procedure := "/" + pkg + "." + svc + "/" + rpc
			if !getEnabledRPCs[procedure] {
				t.Errorf("%s:%d 标了 NO_SIDE_EFFECTS（放开 GET）但 %s 不在 getEnabledRPCs 白名单；"+
					"先确认它真的无副作用并同步 control-tower authz.allowedAct，再把它加进白名单", path, line, procedure)
			}
		}
		f.Close()
		if err := sc.Err(); err != nil {
			t.Fatalf("读取 %s: %v", path, err)
		}
	}
}
