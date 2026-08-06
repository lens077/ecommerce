// Package structcheck 把仓库的结构性约束固化成可执行测试,随 `go test ./...` 在 CI 里跑。
//
// 覆盖两类约束:
//  1. .service-matrix.yaml 与 backend/services/、gateway/configs/config.yaml 的一致性
//     —— matrix 自称「服务拓扑真相源」,真相源与实际接线漂移时必须在 CI 里报警。
//  2. 各服务 internal/pkg 基础设施副本的同构性 —— 同名文件原文或归一化服务名后
//     必须字节一致;存量漂移记录在 homogeneity_baseline.txt,只许收敛不许新增(棘轮)。
package structcheck

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

const (
	repoRoot      = "../.."
	servicesDir   = "../services"
	matrixPath    = "../../.service-matrix.yaml"
	gatewayConfig = "../../gateway/configs/config.yaml"
	baselinePath  = "homogeneity_baseline.txt"
)

// backend/services 下存在、但按约不进 matrix services 段的目录。
// config: 与外部 config-center 撞名的进程,matrix 里以 externals.config_center 记录。
var dirsNotInMatrix = map[string]string{
	"config": "配置中心撞名进程,见 .service-matrix.yaml externals.config_center",
}

// 网关里存在、但不对应 matrix services 条目的 discovery target。
// telemetry 复用 behavior-service(matrix 的 behavior.note 有记录),behavior-service
// 本身能对上,无需例外;config-service 对应上面的 config 目录。
var gatewayTargetsNotInMatrix = map[string]string{
	"config-service": "配置中心撞名进程",
}

type serviceEntry struct {
	Discovery        string   `yaml:"discovery"`
	GatewayPrefix    string   `yaml:"gateway_prefix"`
	DependsOn        []string `yaml:"depends_on"`
	DependsOnPlanned []string `yaml:"depends_on_planned"`
}

type serviceMatrix struct {
	Services map[string]serviceEntry `yaml:"services"`
}

func loadMatrix(t *testing.T) serviceMatrix {
	t.Helper()
	data, err := os.ReadFile(matrixPath)
	if err != nil {
		t.Fatalf("读取 .service-matrix.yaml: %v", err)
	}
	var m serviceMatrix
	if err := yaml.Unmarshal(data, &m); err != nil {
		t.Fatalf("解析 .service-matrix.yaml: %v", err)
	}
	if len(m.Services) == 0 {
		t.Fatal(".service-matrix.yaml 的 services 段为空")
	}
	return m
}

func listServiceDirs(t *testing.T) []string {
	t.Helper()
	entries, err := os.ReadDir(servicesDir)
	if err != nil {
		t.Fatalf("读取 backend/services: %v", err)
	}
	var dirs []string
	for _, e := range entries {
		if e.IsDir() {
			dirs = append(dirs, e.Name())
		}
	}
	return dirs
}

// matrix services 与 backend/services 目录双向对齐。
func TestServiceDirsMatchMatrix(t *testing.T) {
	m := loadMatrix(t)
	dirs := listServiceDirs(t)
	dirSet := map[string]bool{}
	for _, d := range dirs {
		dirSet[d] = true
	}
	for name := range m.Services {
		if !dirSet[name] {
			t.Errorf("matrix 里的服务 %q 在 backend/services/ 下没有目录", name)
		}
	}
	for _, d := range dirs {
		if _, inMatrix := m.Services[d]; !inMatrix {
			if _, allowed := dirsNotInMatrix[d]; !allowed {
				t.Errorf("backend/services/%s 不在 .service-matrix.yaml 的 services 段,也不在已知例外里", d)
			}
		}
	}
}

// matrix 自身:discovery / gateway_prefix 非空且唯一,依赖只指向已知服务。
func TestMatrixInternalConsistency(t *testing.T) {
	m := loadMatrix(t)
	seenDiscovery := map[string]string{}
	seenPrefix := map[string]string{}
	for name, svc := range m.Services {
		if svc.Discovery == "" {
			t.Errorf("%s: discovery 为空", name)
		} else if prev, dup := seenDiscovery[svc.Discovery]; dup {
			t.Errorf("%s 与 %s 的 discovery 重复: %q", name, prev, svc.Discovery)
		} else {
			seenDiscovery[svc.Discovery] = name
		}
		if svc.GatewayPrefix == "" {
			t.Errorf("%s: gateway_prefix 为空", name)
		} else if prev, dup := seenPrefix[svc.GatewayPrefix]; dup {
			t.Errorf("%s 与 %s 的 gateway_prefix 重复: %q", name, prev, svc.GatewayPrefix)
		} else {
			seenPrefix[svc.GatewayPrefix] = name
		}
		for _, dep := range append(append([]string{}, svc.DependsOn...), svc.DependsOnPlanned...) {
			if _, ok := m.Services[dep]; !ok {
				t.Errorf("%s 依赖了未知服务 %q", name, dep)
			}
		}
	}
}

type gatewayEndpoint struct {
	Path     string `yaml:"path"`
	Backends []struct {
		Target string `yaml:"target"`
	} `yaml:"backends"`
}

type gatewayConf struct {
	Endpoints []gatewayEndpoint `yaml:"endpoints"`
}

// matrix 的 (gateway_prefix, discovery) 必须与网关配置的实际接线一致,双向核对。
func TestGatewayWiringMatchesMatrix(t *testing.T) {
	m := loadMatrix(t)
	data, err := os.ReadFile(gatewayConfig)
	if err != nil {
		t.Fatalf("读取网关配置: %v", err)
	}
	var gw gatewayConf
	if err := yaml.Unmarshal(data, &gw); err != nil {
		t.Fatalf("解析网关配置: %v", err)
	}
	// path → discovery 名集合
	wired := map[string]map[string]bool{}
	for _, ep := range gw.Endpoints {
		targets := map[string]bool{}
		for _, b := range ep.Backends {
			if name, ok := strings.CutPrefix(b.Target, "discovery:///"); ok {
				targets[name] = true
			}
		}
		wired[ep.Path] = targets
	}

	knownDiscovery := map[string]bool{}
	for name, svc := range m.Services {
		knownDiscovery[svc.Discovery] = true
		targets, ok := wired[svc.GatewayPrefix]
		if !ok {
			t.Errorf("%s: matrix 声明前缀 %q,网关配置里没有这个 endpoint", name, svc.GatewayPrefix)
			continue
		}
		if !targets[svc.Discovery] {
			t.Errorf("%s: 网关 endpoint %q 的 target 不含 discovery:///%s(matrix 与实际接线漂移)",
				name, svc.GatewayPrefix, svc.Discovery)
		}
	}
	for path, targets := range wired {
		for target := range targets {
			if !knownDiscovery[target] {
				if _, allowed := gatewayTargetsNotInMatrix[target]; !allowed {
					t.Errorf("网关 endpoint %q 指向 discovery:///%s,但 matrix 里没有对应服务", path, target)
				}
			}
		}
	}
}

// 各服务 internal/pkg 的同名文件必须是同一份代码的副本。
//
// 判定用两把尺子,任一把认为一致就算同构:
//   - 原文哈希 —— 文件里根本没出现服务名时(逐字节相同)直接过;
//   - 归一化哈希 —— 把服务自身目录名替换成 _SVC_ 后相同,覆盖 `serviceName = "order"`
//     这类只有服务名不同的副本。
//
// 只用归一化那把尺子会误报:服务名恰好是个普通单词时(`address` 同时是配置项键名),
// 归一化只在该服务自己的副本里生效,逐字节相同的文件反而被判成漂移。
//
// 存量漂移列在 homogeneity_baseline.txt:新漂移 → 立即失败;基线条目收敛 → 提示删除。
func TestInfraHomogeneity(t *testing.T) {
	m := loadMatrix(t)
	baseline := loadBaseline(t)

	// relpath → hash → 持有的服务列表(raw 为原文,norm 为归一化服务名后)
	byPathRaw := map[string]map[string][]string{}
	byPathNorm := map[string]map[string][]string{}
	for name := range m.Services {
		pkgRoot := filepath.Join(servicesDir, name, "internal", "pkg")
		if _, err := os.Stat(pkgRoot); os.IsNotExist(err) {
			continue
		}
		namePat := regexp.MustCompile(`\b` + regexp.QuoteMeta(name) + `\b`)
		err := filepath.WalkDir(pkgRoot, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return err
			}
			rel, _ := filepath.Rel(pkgRoot, path)
			rel = filepath.ToSlash(rel)
			data, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			add := func(m map[string]map[string][]string, b []byte) {
				sum := sha256.Sum256(b)
				h := hex.EncodeToString(sum[:8])
				if m[rel] == nil {
					m[rel] = map[string][]string{}
				}
				m[rel][h] = append(m[rel][h], name)
			}
			add(byPathRaw, data)
			add(byPathNorm, namePat.ReplaceAll(data, []byte("_SVC_")))
			return nil
		})
		if err != nil {
			t.Fatalf("扫描 %s: %v", pkgRoot, err)
		}
	}

	divergent := map[string]bool{}
	for rel, variants := range byPathNorm {
		holders := 0
		for _, svcs := range variants {
			holders += len(svcs)
		}
		if holders < 2 {
			continue // 只有一个服务有这个文件,谈不上同构
		}
		if len(variants) > 1 && len(byPathRaw[rel]) > 1 {
			divergent[rel] = true
			if !baseline[rel] {
				var desc []string
				for h, svcs := range variants {
					sort.Strings(svcs)
					desc = append(desc, fmt.Sprintf("%s=%s", h, strings.Join(svcs, ",")))
				}
				sort.Strings(desc)
				t.Errorf("新的同构漂移: internal/pkg/%s 在各服务间不一致(归一化服务名后)。\n"+
					"  变体: %s\n"+
					"  基础设施副本一改要全部服务一起改;确属有意分叉才把路径加进 %s",
					rel, strings.Join(desc, " | "), baselinePath)
			}
		}
	}
	for rel := range baseline {
		if !divergent[rel] {
			t.Errorf("基线条目已收敛(或文件已不存在): %s —— 请从 %s 删除该行,让棘轮前进", rel, baselinePath)
		}
	}
}

func loadBaseline(t *testing.T) map[string]bool {
	t.Helper()
	f, err := os.Open(baselinePath)
	if err != nil {
		t.Fatalf("读取漂移基线 %s: %v", baselinePath, err)
	}
	defer f.Close()
	baseline := map[string]bool{}
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		baseline[line] = true
	}
	if err := sc.Err(); err != nil {
		t.Fatalf("读取漂移基线: %v", err)
	}
	return baseline
}
