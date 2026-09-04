package structcheck

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/lens077/go-connect-kit/meta"
)

// meta 自 2026-09-02 起来自独立模块 go-connect-kit，不再是本仓的 backend/pkg/meta。
// 这个字符串与 10 份 Dockerfile 的 ldflags 必须逐字一致；模块路径变更时两边同步改，
// 否则注入静默失效（linker 对不存在的 -X 目标不报错）。
const buildVersionLDFlag = "-X github.com/lens077/go-connect-kit/meta.Version=$VERSION"

// The Go linker silently ignores a missing -X target, so compilation alone
// cannot prove that image version injection still works.
func TestBuildVersionInjection(t *testing.T) {
	// Taking a *string keeps this an addressable string variable, which -X requires.
	// Changing it to a const would still compile consumers but make injection silent.
	requireStringVariable := func(*string) {}
	requireStringVariable(&meta.Version)
	if meta.Version == "" {
		t.Fatal("go-connect-kit/meta.Version must have a non-empty local-build fallback")
	}

	baselinePath := filepath.Join(servicesDir, "cart", "Dockerfile")
	baseline, err := os.ReadFile(baselinePath)
	if err != nil {
		t.Fatalf("read %s: %v", baselinePath, err)
	}

	for service := range loadMatrix(t).Services {
		dockerfile := filepath.Join(servicesDir, service, "Dockerfile")
		data, err := os.ReadFile(dockerfile)
		if err != nil {
			t.Fatalf("read %s: %v", dockerfile, err)
		}
		if string(data) != string(baseline) {
			t.Errorf("%s Dockerfile differs from the shared cart baseline", service)
		}
		contents := string(data)
		if strings.Count(contents, buildVersionLDFlag) != 1 {
			t.Errorf("%s must contain exactly one build-version ldflag %q", service, buildVersionLDFlag)
		}
		if strings.Count(contents, "COPY pkg/ ./pkg/") != 1 {
			t.Errorf("%s must copy the shared backend/pkg tree into the build context", service)
		}
	}
}

func TestSharedImplementationsDoNotReturnToConsumers(t *testing.T) {
	for service := range loadMatrix(t).Services {
		for _, packageName := range []string{"env", "meta", "dbutil"} {
			path := filepath.Join(servicesDir, service, "internal", "pkg", packageName)
			if _, err := os.Stat(path); err == nil {
				t.Errorf("%s still has duplicated internal/pkg/%s; import go-connect-kit/%s", service, packageName, packageName)
			} else if !os.IsNotExist(err) {
				t.Fatalf("stat %s: %v", path, err)
			}
		}
	}

	for _, packageName := range []string{"config", "configschema", "dbutil", "env", "log", "meta", "otel", "registry"} {
		path := filepath.Join("..", "pkg", packageName)
		if _, err := os.Stat(path); err == nil {
			t.Errorf("backend/pkg/%s is an implementation copy; import go-connect-kit/%s", packageName, packageName)
		} else if !os.IsNotExist(err) {
			t.Fatalf("stat %s: %v", path, err)
		}
	}
}

// adapterOwnedVendors 列出每个 kit 包独占的实现依赖。适配层出现其中任何一个，
// 都说明实现正在从 go-connect-kit 漏回服务内。
//
// fx 与 zap 不在此列：适配层用 fx.Provide 装配、用 *zap.Logger 收参数是正当的。
var adapterOwnedVendors = map[string][]string{
	"config":   {"github.com/spf13/viper", "github.com/mitchellh/mapstructure"},
	"log":      {"go.opentelemetry.io/contrib/bridges", "go.opentelemetry.io/otel/log"},
	"otel":     {"go.opentelemetry.io/otel", "go.opentelemetry.io/contrib/instrumentation", "github.com/redis/go-redis"},
	"registry": {"github.com/hashicorp/consul"},
}

// TestInfraAdaptersStayThin 守住 config/log/otel/registry 四个模块「只做适配」的边界。
//
// 为什么单靠 TestInfraHomogeneity 不够：那道门禁比较的是副本之间是否一致。
// 如果有人把同一份实现同时抄回 10 个服务，副本仍然彼此相同，同构检查照样绿，
// 而 15,106 行重复会静默长回来。这里改为检查语义：适配层必须委托给共享包，
// 且不得直接依赖共享包独占的实现库。
//
// 触发背景见 context/team/infra-duplication.md：副本的根因是生成模板。
// 模板现已改为依赖 kit，这道门禁防止后续把实现复制回来。
func TestInfraAdaptersStayThin(t *testing.T) {
	for service := range loadMatrix(t).Services {
		for _, packageName := range []string{"config", "log", "otel", "registry"} {
			dir := filepath.Join(servicesDir, service, "internal", "pkg", packageName)
			entries, err := os.ReadDir(dir)
			if err != nil {
				t.Errorf("%s 缺少 internal/pkg/%s 适配层: %v", service, packageName, err)
				continue
			}

			sharedImport := "github.com/lens077/go-connect-kit/" + packageName
			delegates := false
			for _, entry := range entries {
				if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") ||
					strings.HasSuffix(entry.Name(), "_test.go") {
					continue
				}
				data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
				if err != nil {
					t.Fatalf("读取 %s/%s: %v", dir, entry.Name(), err)
				}
				contents := string(data)
				if strings.Contains(contents, sharedImport) {
					delegates = true
				}
				for _, vendor := range adapterOwnedVendors[packageName] {
					if strings.Contains(contents, `"`+vendor) {
						t.Errorf("%s/internal/pkg/%s/%s 直接依赖 %s；该实现属于 go-connect-kit/%s，"+
							"适配层只应做 confv1→Options 映射与泛型实例化",
							service, packageName, entry.Name(), vendor, packageName)
					}
				}
			}
			if !delegates {
				t.Errorf("%s/internal/pkg/%s 没有 import %s；它不再是适配层，而是又一份副本",
					service, packageName, sharedImport)
			}
		}
	}
}
