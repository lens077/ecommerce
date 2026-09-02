// Package structcheck 把仓库的结构性约束固化成可执行测试,随 `go test ./...` 在 CI 里跑。
//
// 覆盖两类约束:
//  1. .service-matrix.yaml 与 backend/services/、control-tower 网关路由模板
//     (github.com/lens077/control-tower/routes,go:embed 导出)的一致性
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

	ctroutes "github.com/lens077/control-tower/routes"
	"gopkg.in/yaml.v3"
)

const (
	repoRoot     = "../.."
	servicesDir  = "../services"
	matrixPath   = "../../.service-matrix.yaml"
	baselinePath = "homogeneity_baseline.txt"
)

// backend/services 下存在、但按约不进 matrix services 段的目录。
// config: 与外部 config-center 撞名的进程,matrix 里以 externals.config_center 记录。
var dirsNotInMatrix = map[string]string{
	"config": "配置中心撞名进程,见 .service-matrix.yaml externals.config_center",
}

// 说明:旧例外表 gatewayTargetsNotInMatrix 已随 /config* 路由删除而移除——
// 新路由模板不再有 config 条目(config web/api 独立域名直连,不过网关);
// telemetry 复用 behavior-service,而 behavior-service 本身在 matrix 中,反向核对天然通过。

type serviceEntry struct {
	Discovery        string   `yaml:"discovery"`
	GatewayPrefix    string   `yaml:"gateway_prefix"`
	DependsOn        []string `yaml:"depends_on"`
	DependsOnPlanned []string `yaml:"depends_on_planned"`
}

type serviceMatrix struct {
	Services  map[string]serviceEntry  `yaml:"services"`
	Externals map[string]externalEntry `yaml:"externals"`
}

// externalEntry 只取 used_by —— 其余字段(host/note)是自由文本,不参与结构断言。
type externalEntry struct {
	UsedBy []string `yaml:"used_by"`
}

// externalRefPatterns: external 名 → 在服务代码里能证明「确实用了它」的字符串。
//
// 判定刻意宽松(大小写不敏感、含生成的 conf.pb.go):`used_by` 的语义是「这个服务用到
// 该外部依赖」,而用法未必是导入客户端库 —— 例如 cart 只从配置里取 minio host 拼
// 缩略图 URL,证据就落在生成的配置 schema 里。**要拦的是「一次引用都没有」那种错**,
// 不是「用法不够典型」。宁可漏报不可误报:误报会让人删断言。
//
// 触发事故(2026-08-29):matrix 里写着 `nats: used_by: [search]`,而 search 服务对
// nats **零引用** —— 真正的导入方是 backend/tools/{search-indexer,outbox-relay}。
// 查拓扑的人会据此把 search 误判成 NATS 消费者。
var externalRefPatterns = map[string][]string{
	"meilisearch":    {"meilisearch"},
	"minio":          {"minio", "silo"},
	"gorse":          {"gorse"},
	"alipay":         {"alipay"},
	"kafka":          {"kafka", "franz-go"},
	"elasticsearch":  {"elasticsearch", "opensearch"},
	"casdoor":        {"casdoor"},
	"consul":         {"consul"},
	"dragonfly":      {"redis", "dragonfly"},
	"config_center":  {"configsource", "config-center", "configcenter"},
	"redis_gorse":    {"gorse"},
	"postgres_gorse": {"gorse"},
	"pigsty_node3":   {"pgx", "postgres", "pgxpool"},
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

// serviceReferences 报告 backend/services/<svc>/ 下是否有任一 .go 文件提到 pats 之一。
func serviceReferences(t *testing.T, svc string, pats []string) bool {
	t.Helper()
	root := filepath.Join(servicesDir, svc)
	found := false
	err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || found || !strings.HasSuffix(p, ".go") {
			return nil //nolint:nilerr // 单个文件读不到不应中断整棵树的遍历
		}
		b, readErr := os.ReadFile(p)
		if readErr != nil {
			return nil
		}
		low := strings.ToLower(string(b))
		for _, pat := range pats {
			if strings.Contains(low, strings.ToLower(pat)) {
				found = true
				return filepath.SkipAll
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("遍历 %s: %v", root, err)
	}
	return found
}

// externals.*.used_by 里点名的服务,必须在自己的代码里真的引用了该外部依赖。
//
// 这条断言防的是「真相源写了拓扑边,代码里却没有」——查拓扑的人会照着它做错误判断,
// 而这种错不会被编译、测试或部署发现,只能靠交叉核对。
func TestExternalUsedByMatchesCode(t *testing.T) {
	m := loadMatrix(t)
	if len(m.Externals) == 0 {
		t.Fatal(".service-matrix.yaml 的 externals 段为空")
	}

	for ext, entry := range m.Externals {
		for _, consumer := range entry.UsedBy {
			// used_by 允许点名非本仓服务(如 redis_gorse.used_by:[gorse],gorse 是外部引擎)。
			// 这类跳过 —— 本仓没有它的代码可查。
			if _, isService := m.Services[consumer]; !isService {
				if _, isExternal := m.Externals[consumer]; !isExternal {
					t.Errorf("externals.%s.used_by 里的 %q 既不是 services 段的服务,"+
						"也不是 externals 段的条目 —— 写错名字或该条目已删除", ext, consumer)
				}
				continue
			}

			pats, ok := externalRefPatterns[ext]
			if !ok {
				t.Errorf("externals.%s 有 used_by 但 externalRefPatterns 缺少它的判定模式 —— "+
					"新增 external 时要同步在 structcheck 里补一行,否则这条边不受任何检查", ext)
				continue
			}
			if !serviceReferences(t, consumer, pats) {
				t.Errorf("externals.%s.used_by 声称 %s 用了它,但 backend/services/%s/ 下"+
					"没有任何 .go 文件提到 %v —— 要么删掉这个 used_by 条目,"+
					"要么它的真实使用方不在 services 段(如 backend/tools/,应在 note 里写明)",
					ext, consumer, consumer, pats)
			}
		}
	}
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

// matrix 的 (gateway_prefix, discovery) 必须与网关路由模板的实际接线一致,双向核对。
//
// 2026-08-23 起网关由 control-tower 承载:路由模板经其 routes 包(go:embed)导出,
// 本测试 import 该包核对——路由变更必须同 PR 升级本仓对 control-tower 的依赖版本,
// 否则这里就红(自动闭环,替代旧的「读 gateway/configs/config.yaml 文件」)。
// 旧模板 path 形如 /user*,新模板是一级 proto 包名 user;映射=去掉首「/」尾「*」。
func TestGatewayWiringMatchesMatrix(t *testing.T) {
	m := loadMatrix(t)
	knownDiscovery := map[string]bool{}
	for _, svc := range m.Services {
		knownDiscovery[svc.Discovery] = true
	}

	for _, env := range ctroutes.Envs() {
		parsed, err := ctroutes.Parse(env)
		if err != nil {
			t.Fatalf("解析 control-tower 路由模板 %s: %v", env, err)
		}
		// 路由 target 两种形态(2026-09-03 起 dev 关闭 Consul 注册,改用 direct://):
		//   discovery:///<consul 注册名>            → 与 matrix 的 discovery 比对
		//   direct://ecommerce-<svc>-service.<ns>.svc:<port> → 主机名反推服务名,与 matrix 的键比对
		// 两种都不是的 target 直接报错,不给第三种形态留静默通过的口子。
		wired := map[string]ctroutes.Entry{} // package → 条目
		for _, e := range parsed.Routes {
			wired[e.Package] = e
		}

		for name, svc := range m.Services {
			pkg := strings.TrimSuffix(strings.TrimPrefix(svc.GatewayPrefix, "/"), "*")
			e, ok := wired[pkg]
			if !ok {
				t.Errorf("[%s] %s: matrix 前缀 %q(包名 %q)在路由模板中没有条目", env, name, svc.GatewayPrefix, pkg)
				continue
			}
			switch {
			case e.DiscoveryTarget() != "":
				if e.DiscoveryTarget() != svc.Discovery {
					t.Errorf("[%s] %s: 路由包 %q 指向 %q,matrix 声明 %q(接线漂移)", env, name, pkg, e.DiscoveryTarget(), svc.Discovery)
				}
			case e.DirectHost() != "":
				if want := directHostFor(name); e.DirectHost() != want {
					t.Errorf("[%s] %s: 路由包 %q 直连 %q,按服务名应为 %q(接线漂移)", env, name, pkg, e.DirectHost(), want)
				}
			default:
				t.Errorf("[%s] %s: 路由包 %q 的 target %q 既非 discovery:/// 也非 direct://", env, name, pkg, e.Target)
			}
		}
		for pkg, e := range wired {
			switch {
			case e.DiscoveryTarget() != "":
				if !knownDiscovery[e.DiscoveryTarget()] {
					t.Errorf("[%s] 路由包 %q 指向 discovery:///%s,但 matrix 里没有对应服务", env, pkg, e.DiscoveryTarget())
				}
			case e.DirectHost() != "":
				if _, ok := serviceFromDirectHost(e.DirectHost(), m); !ok {
					t.Errorf("[%s] 路由包 %q 直连 %q,但 matrix 里没有对应服务", env, pkg, e.DirectHost())
				}
			}
		}
	}
}

// directHostFor 是 direct:// 形态的接线约定:matrix 服务名 <svc> 对应
// k8s Service ecommerce-<svc>-service(见各 services/*/deploy/dev/service.yaml),
// 网关 target 写 ecommerce-<svc>-service.ecommerce.svc:<port>,端口不在 matrix 里,不核。
func directHostFor(service string) string {
	return "ecommerce-" + service + "-service.ecommerce.svc"
}

// serviceFromDirectHost 是 directHostFor 的反向:主机名不符合约定或服务不在 matrix 时返回 false。
func serviceFromDirectHost(host string, m serviceMatrix) (string, bool) {
	const prefix, suffix = "ecommerce-", "-service.ecommerce.svc"
	if !strings.HasPrefix(host, prefix) || !strings.HasSuffix(host, suffix) {
		return "", false
	}
	name := strings.TrimSuffix(strings.TrimPrefix(host, prefix), suffix)
	_, ok := m.Services[name]
	return name, ok
}

// matrix 的 anonymous_paths 与路由模板的 anonymous 必须是同一个集合(单一真相源双向核对)。
func TestGatewayAnonymousMatchesMatrix(t *testing.T) {
	data, err := os.ReadFile(matrixPath)
	if err != nil {
		t.Fatalf("读取 .service-matrix.yaml: %v", err)
	}
	var doc struct {
		Gateway struct {
			AnonymousPaths []string `yaml:"anonymous_paths"`
		} `yaml:"gateway"`
	}
	if err := yaml.Unmarshal(data, &doc); err != nil {
		t.Fatalf("解析 .service-matrix.yaml: %v", err)
	}
	if len(doc.Gateway.AnonymousPaths) == 0 {
		t.Fatal("matrix gateway.anonymous_paths 为空")
	}
	want := map[string]bool{}
	for _, p := range doc.Gateway.AnonymousPaths {
		want[p] = true
	}
	for _, env := range ctroutes.Envs() {
		parsed, err := ctroutes.Parse(env)
		if err != nil {
			t.Fatal(err)
		}
		got := map[string]bool{}
		for _, p := range parsed.Anonymous {
			got[p] = true
			if !want[p] {
				t.Errorf("[%s] 路由模板匿名项 %q 不在 matrix.anonymous_paths", env, p)
			}
		}
		for p := range want {
			if !got[p] {
				t.Errorf("[%s] matrix.anonymous_paths 的 %q 不在路由模板", env, p)
			}
		}
	}
}

// matrix 的 guest_paths 与路由模板的 guest 必须是同一个集合(匿名购物 B 级,
// 单一真相源双向核对)。设计见 docs/design/platform/anonymous-shopping.md。
func TestGatewayGuestMatchesMatrix(t *testing.T) {
	data, err := os.ReadFile(matrixPath)
	if err != nil {
		t.Fatalf("读取 .service-matrix.yaml: %v", err)
	}
	var doc struct {
		Gateway struct {
			AnonymousPaths []string `yaml:"anonymous_paths"`
			GuestPaths     []string `yaml:"guest_paths"`
		} `yaml:"gateway"`
	}
	if err := yaml.Unmarshal(data, &doc); err != nil {
		t.Fatalf("解析 .service-matrix.yaml: %v", err)
	}
	if len(doc.Gateway.GuestPaths) == 0 {
		t.Fatal("matrix gateway.guest_paths 为空")
	}

	// A 与 B 语义互斥:同一路径同时出现两边,网关 Build 会报错,这里提前拦住。
	anon := map[string]bool{}
	for _, p := range doc.Gateway.AnonymousPaths {
		anon[p] = true
	}
	want := map[string]bool{}
	for _, p := range doc.Gateway.GuestPaths {
		if anon[p] {
			t.Errorf("%q 同时在 anonymous_paths 与 guest_paths —— 两者语义互斥", p)
		}
		want[p] = true
	}

	for _, env := range ctroutes.Envs() {
		parsed, err := ctroutes.Parse(env)
		if err != nil {
			t.Fatal(err)
		}
		got := map[string]bool{}
		for _, p := range parsed.Guest {
			got[p] = true
			if !want[p] {
				t.Errorf("[%s] 路由模板访客项 %q 不在 matrix.guest_paths", env, p)
			}
		}
		for p := range want {
			if !got[p] {
				t.Errorf("[%s] matrix.guest_paths 的 %q 不在路由模板", env, p)
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

// Cart is the configuration glue baseline. Every service must carry the same
// production files; the general homogeneity check intentionally ignores files
// that exist in only one service, so it cannot catch a newly omitted copy.
func TestConfigGlueFileSet(t *testing.T) {
	m := loadMatrix(t)
	expected := configProductionFiles(t, "cart")

	for name := range m.Services {
		actual := configProductionFiles(t, name)
		var missing, extra []string
		for file := range expected {
			if !actual[file] {
				missing = append(missing, file)
			}
		}
		for file := range actual {
			if !expected[file] {
				extra = append(extra, file)
			}
		}
		sort.Strings(missing)
		sort.Strings(extra)
		if len(missing) > 0 || len(extra) > 0 {
			t.Errorf("%s: internal/pkg/config production file set differs from cart; missing=%v extra=%v",
				name, missing, extra)
		}
	}
}

func configProductionFiles(t *testing.T, service string) map[string]bool {
	t.Helper()
	dir := filepath.Join(servicesDir, service, "internal", "pkg", "config")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read %s: %v", dir, err)
	}
	files := map[string]bool{}
	for _, entry := range entries {
		name := entry.Name()
		if !entry.IsDir() && strings.HasSuffix(name, ".go") && !strings.HasSuffix(name, "_test.go") {
			files[name] = true
		}
	}
	return files
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
