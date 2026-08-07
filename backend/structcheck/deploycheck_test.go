// deploycheck 把「服务清单散落在四处、互相漂移」这件事变成 CI 门禁。
//
// 背景:仓库有三条聚合部署入口(Makefile 扇出 / compose / helm+ArgoCD),
// 外加各服务的 deploy 裸 manifest,每一处都手抄了一份服务清单。手抄就会漂移,
// 而且漂移是静默的 —— config 拆仓后仍留在 Makefile 的 SERVICES 里,配合
// `|| exit 1` 让 make k8s-dev-all 每次在它那儿中断,排在后面的 payment
// 永远 apply 不到,报错还长得像普通的 kubectl 报错,谁都不会多看一眼。
//
// 真相源是 .service-matrix.yaml 的 services 段;本文件让四处副本与它对齐。
package structcheck

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

const (
	makefilePath   = "../Makefile"
	composePath    = "../compose.yaml"
	helmValuesPath = "../../helm/values.yaml"

	// compose 里的键名统一带这个前缀,比对前剥掉
	composePrefix = "ecommerce-"
)

// helm/values.yaml 顶层允许出现的非服务键。
// global 是 Helm 的标准跨 subchart 传参键;其余非服务键应当显式加进来,
// 而不是放宽比对 —— 多一个不认识的顶层键本身就值得看一眼。
var helmNonServiceKeys = map[string]bool{
	"global": true,
}

// .service-matrix.yaml 的 deployment_coverage 段。
// 这里单独定义而不去扩 structcheck_test.go 里的 serviceMatrix,
// 是为了让两个文件各自独立演进,互不牵连。
type deploymentCoverage struct {
	// exceptions[入口名][服务名] = 原因
	Exceptions map[string]map[string]string `yaml:"exceptions"`
}

type coverageMatrix struct {
	Services           map[string]yaml.Node `yaml:"services"`
	DeploymentCoverage deploymentCoverage   `yaml:"deployment_coverage"`
}

func loadCoverageMatrix(t *testing.T) coverageMatrix {
	t.Helper()
	data, err := os.ReadFile(matrixPath)
	if err != nil {
		t.Fatalf("读取 .service-matrix.yaml: %v", err)
	}
	var m coverageMatrix
	if err := yaml.Unmarshal(data, &m); err != nil {
		t.Fatalf("解析 .service-matrix.yaml: %v", err)
	}
	if len(m.Services) == 0 {
		t.Fatal(".service-matrix.yaml 的 services 段为空")
	}
	return m
}

// backend/Makefile 的 SERVICES 变量。
// 这份清单是手抄的副本而非 yq 派生 —— yq 不是本机必备工具,
// make 不该因为缺一个工具就跑不动,所以用本测试兜底。
func readMakefileServices(t *testing.T) []string {
	t.Helper()
	data, err := os.ReadFile(makefilePath)
	if err != nil {
		t.Fatalf("读取 backend/Makefile: %v", err)
	}
	re := regexp.MustCompile(`(?m)^SERVICES\s*\?=\s*(.*)$`)
	match := re.FindSubmatch(data)
	if match == nil {
		t.Fatal("backend/Makefile 里找不到 SERVICES ?= 定义")
	}
	return strings.Fields(string(match[1]))
}

// backend/compose.yaml 的 services 段,键名剥掉 ecommerce- 前缀。
func readComposeServices(t *testing.T) []string {
	t.Helper()
	data, err := os.ReadFile(composePath)
	if err != nil {
		t.Fatalf("读取 backend/compose.yaml: %v", err)
	}
	var doc struct {
		Services map[string]yaml.Node `yaml:"services"`
	}
	if err := yaml.Unmarshal(data, &doc); err != nil {
		t.Fatalf("解析 backend/compose.yaml: %v", err)
	}
	if len(doc.Services) == 0 {
		t.Fatal("backend/compose.yaml 的 services 段为空")
	}
	names := make([]string, 0, len(doc.Services))
	for k := range doc.Services {
		// 前缀不匹配时原样保留 —— 让它在比对阶段暴露成「不认识的名字」,
		// 而不是在这里被悄悄改写成别的东西
		names = append(names, strings.TrimPrefix(k, composePrefix))
	}
	return names
}

// helm/values.yaml 的顶层键(umbrella chart 用顶层键覆盖各 subchart)。
func readHelmServices(t *testing.T) []string {
	t.Helper()
	data, err := os.ReadFile(helmValuesPath)
	if err != nil {
		t.Fatalf("读取 helm/values.yaml: %v", err)
	}
	var doc map[string]yaml.Node
	if err := yaml.Unmarshal(data, &doc); err != nil {
		t.Fatalf("解析 helm/values.yaml: %v", err)
	}
	if len(doc) == 0 {
		t.Fatal("helm/values.yaml 为空")
	}
	names := make([]string, 0, len(doc))
	for k := range doc {
		if helmNonServiceKeys[k] {
			continue
		}
		names = append(names, k)
	}
	return names
}

// 同时具备 deploy/dev 与 deploy/prod 才算被裸 manifest 覆盖 ——
// 只有一半会在另一个环境静默漏掉这个服务。
func readDeployCoveredServices(t *testing.T) []string {
	t.Helper()
	entries, err := os.ReadDir(servicesDir)
	if err != nil {
		t.Fatalf("读取 backend/services: %v", err)
	}
	var covered []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		hasAll := true
		for _, env := range []string{"dev", "prod"} {
			info, err := os.Stat(filepath.Join(servicesDir, e.Name(), "deploy", env))
			if err != nil || !info.IsDir() {
				hasAll = false
				break
			}
		}
		if hasAll {
			covered = append(covered, e.Name())
		}
	}
	return covered
}

// 四处部署清单必须与 matrix 的 services 段对齐。
func TestDeploymentListsMatchMatrix(t *testing.T) {
	m := loadCoverageMatrix(t)

	lists := []struct {
		path  string // 与 deployment_coverage.exceptions 的键一致
		hint  string
		items []string
	}{
		{"makefile", "backend/Makefile 的 SERVICES", readMakefileServices(t)},
		{"compose", "backend/compose.yaml 的 services 段", readComposeServices(t)},
		{"helm", "helm/values.yaml 的顶层键", readHelmServices(t)},
		{"deploy", "backend/services/{svc}/deploy/{dev,prod}", readDeployCoveredServices(t)},
	}

	for _, l := range lists {
		t.Run(l.path, func(t *testing.T) {
			present := map[string]bool{}
			for _, name := range l.items {
				present[name] = true
			}

			// 方向一:清单里有、matrix 里没有 → 陈旧残留,不接受例外。
			// config 拆仓那次就是死在这个方向上。
			var stale []string
			for _, name := range l.items {
				if _, ok := m.Services[name]; !ok {
					stale = append(stale, name)
				}
			}
			sort.Strings(stale)
			for _, name := range stale {
				t.Errorf("%s 里的 %q 不在 .service-matrix.yaml 的 services 段 —— "+
					"服务已删除/拆仓就把它从这份清单里一并删掉", l.hint, name)
			}

			// 方向二:matrix 里有、清单里缺 → 必须在 exceptions 里写明原因
			exceptions := m.DeploymentCoverage.Exceptions[l.path]
			var missing []string
			for name := range m.Services {
				if !present[name] {
					missing = append(missing, name)
				}
			}
			sort.Strings(missing)
			for _, name := range missing {
				if reason, allowed := exceptions[name]; allowed {
					t.Logf("已知缺口:%s 缺 %q —— %s", l.hint, name, reason)
					continue
				}
				t.Errorf("%s 缺少 matrix 里的服务 %q —— 要么补上,"+
					"要么在 .service-matrix.yaml 的 deployment_coverage.exceptions.%s 里写明原因",
					l.hint, name, l.path)
			}

			// 方向三:例外写了但其实已经补上了 → 过期的例外要清掉,
			// 否则例外表会越积越多,失去「这里有缺口」的信号价值
			for name, reason := range exceptions {
				if present[name] {
					t.Errorf("deployment_coverage.exceptions.%s 里的 %q 已经补上了(理由:%s),"+
						"请删除这条过期例外", l.path, name, reason)
				}
				if _, ok := m.Services[name]; !ok {
					t.Errorf("deployment_coverage.exceptions.%s 里的 %q 不是 matrix 里的服务",
						l.path, name)
				}
			}
		})
	}
}
