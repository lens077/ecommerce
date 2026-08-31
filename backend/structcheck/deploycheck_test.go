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
	"archive/tar"
	"bufio"
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
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

type deploymentTopologySpreadConvention struct {
	LabelKey           string `yaml:"label_key"`
	LabelValue         string `yaml:"label_value"`
	TopologyKey        string `yaml:"topology_key"`
	MaxSkew            int    `yaml:"max_skew"`
	WhenUnsatisfiable  string `yaml:"when_unsatisfiable"`
	NodeAffinityPolicy string `yaml:"node_affinity_policy"`
	NodeTaintsPolicy   string `yaml:"node_taints_policy"`
}

type coverageMatrix struct {
	Services           map[string]yaml.Node `yaml:"services"`
	DeploymentCoverage deploymentCoverage   `yaml:"deployment_coverage"`
	Conventions        struct {
		ConfigSourceSecret     string                             `yaml:"config_source_secret"`
		ConfigSourceProjection string                             `yaml:"config_source_projection"`
		PodTopologySpread      deploymentTopologySpreadConvention `yaml:"pod_topology_spread"`
	} `yaml:"conventions"`
}

type deploymentEnv struct {
	Name  string `yaml:"name"`
	Value string `yaml:"value"`
}

type deploymentVolumeMount struct {
	Name      string `yaml:"name"`
	MountPath string `yaml:"mountPath"`
	ReadOnly  bool   `yaml:"readOnly"`
}

type deploymentVolume struct {
	Name   string `yaml:"name"`
	Secret struct {
		SecretName  string `yaml:"secretName"`
		DefaultMode int    `yaml:"defaultMode"`
		Items       []struct {
			Key  string `yaml:"key"`
			Path string `yaml:"path"`
		} `yaml:"items"`
	} `yaml:"secret"`
}

type deploymentSecurityContext struct {
	RunAsNonRoot        bool   `yaml:"runAsNonRoot"`
	RunAsUser           int64  `yaml:"runAsUser"`
	RunAsGroup          int64  `yaml:"runAsGroup"`
	FSGroup             int64  `yaml:"fsGroup"`
	FSGroupChangePolicy string `yaml:"fsGroupChangePolicy"`
}

type deploymentTopologySpreadConstraint struct {
	MaxSkew            int    `yaml:"maxSkew"`
	TopologyKey        string `yaml:"topologyKey"`
	WhenUnsatisfiable  string `yaml:"whenUnsatisfiable"`
	NodeAffinityPolicy string `yaml:"nodeAffinityPolicy"`
	NodeTaintsPolicy   string `yaml:"nodeTaintsPolicy"`
	LabelSelector      struct {
		MatchLabels map[string]string `yaml:"matchLabels"`
	} `yaml:"labelSelector"`
}

type deploymentRollingStrategy struct {
	Type          string `yaml:"type"`
	RollingUpdate struct {
		MaxUnavailable int `yaml:"maxUnavailable"`
		MaxSurge       int `yaml:"maxSurge"`
	} `yaml:"rollingUpdate"`
}

type deploymentPodAntiAffinityTerm struct {
	TopologyKey   string `yaml:"topologyKey"`
	LabelSelector struct {
		MatchLabels map[string]string `yaml:"matchLabels"`
	} `yaml:"labelSelector"`
}

type deploymentDocument struct {
	Kind string `yaml:"kind"`
	Spec struct {
		Selector struct {
			MatchLabels map[string]string `yaml:"matchLabels"`
		} `yaml:"selector"`
		Template struct {
			Metadata struct {
				Labels map[string]string `yaml:"labels"`
			} `yaml:"metadata"`
			Spec struct {
				ServiceAccountName           string                               `yaml:"serviceAccountName"`
				AutomountServiceAccountToken *bool                                `yaml:"automountServiceAccountToken"`
				EnableServiceLinks           *bool                                `yaml:"enableServiceLinks"`
				SecurityContext              deploymentSecurityContext            `yaml:"securityContext"`
				TopologySpreadConstraints    []deploymentTopologySpreadConstraint `yaml:"topologySpreadConstraints"`
				Containers                   []struct {
					Env          []deploymentEnv         `yaml:"env"`
					VolumeMounts []deploymentVolumeMount `yaml:"volumeMounts"`
				} `yaml:"containers"`
				Volumes []deploymentVolume `yaml:"volumes"`
			} `yaml:"spec"`
		} `yaml:"template"`
	} `yaml:"spec"`
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

// Config Center is the only Bootstrap source. Keep every committed deployment
// entrypoint on the selector-file contract so Consul cannot return as a silent
// fallback in one environment.
func TestDeploymentsUseConfigCenterSelector(t *testing.T) {
	m := loadCoverageMatrix(t)
	if m.Conventions.ConfigSourceSecret == "" {
		t.Fatal(".service-matrix.yaml conventions.config_source_secret is empty")
	}

	t.Run("helm", func(t *testing.T) {
		data, err := os.ReadFile(helmValuesPath)
		if err != nil {
			t.Fatalf("read helm values: %v", err)
		}
		var values struct {
			Global struct {
				ConfigSource struct {
					Enabled    bool   `yaml:"enabled"`
					SecretName string `yaml:"secretName"`
					MountPath  string `yaml:"mountPath"`
					RunAsUser  int64  `yaml:"runAsUser"`
					RunAsGroup int64  `yaml:"runAsGroup"`
					FSGroup    int64  `yaml:"fsGroup"`
				} `yaml:"configSource"`
			} `yaml:"global"`
			Services map[string]yaml.Node `yaml:",inline"`
		}
		if err := yaml.Unmarshal(data, &values); err != nil {
			t.Fatalf("parse helm values: %v", err)
		}
		if !values.Global.ConfigSource.Enabled {
			t.Error("helm global.configSource.enabled must be true")
		}
		wantSecret := strings.ReplaceAll(m.Conventions.ConfigSourceSecret, "{env}", "pre")
		if values.Global.ConfigSource.SecretName != wantSecret {
			t.Errorf("helm selector Secret = %q, want %q", values.Global.ConfigSource.SecretName, wantSecret)
		}
		if values.Global.ConfigSource.MountPath != "/etc/ecommerce/config-source" {
			t.Errorf("helm selector mountPath = %q", values.Global.ConfigSource.MountPath)
		}
		if values.Global.ConfigSource.RunAsUser != 1000 ||
			values.Global.ConfigSource.RunAsGroup != 1000 ||
			values.Global.ConfigSource.FSGroup != 1000 {
			t.Errorf("helm selector security IDs must all be 1000: %+v", values.Global.ConfigSource)
		}

		for service := range m.Services {
			node, ok := values.Services[service]
			if !ok {
				t.Errorf("helm values missing service %q", service)
				continue
			}
			var serviceValues struct {
				Env []deploymentEnv `yaml:"env"`
			}
			if err := node.Decode(&serviceValues); err != nil {
				t.Errorf("decode helm values for %s: %v", service, err)
				continue
			}
			assertSelectorEnv(t, "helm "+service, serviceValues.Env, service)
		}
	})

	for service := range m.Services {
		service := service
		for _, environment := range []string{"dev", "prod"} {
			environment := environment
			t.Run("manifest/"+service+"/"+environment, func(t *testing.T) {
				path := filepath.Join(servicesDir, service, "deploy", environment, "deployment.yaml")
				data, err := os.ReadFile(path)
				if err != nil {
					t.Fatalf("read %s: %v", path, err)
				}
				var deployment deploymentDocument
				if err := yaml.Unmarshal(data, &deployment); err != nil {
					t.Fatalf("parse %s: %v", path, err)
				}
				if deployment.Kind != "Deployment" || len(deployment.Spec.Template.Spec.Containers) != 1 {
					t.Fatalf("%s must contain one Deployment container", path)
				}
				podSpec := deployment.Spec.Template.Spec
				container := podSpec.Containers[0]
				assertWorkloadIdentity(t, path, "ecommerce-"+service, podSpec.ServiceAccountName,
					podSpec.AutomountServiceAccountToken, podSpec.EnableServiceLinks)
				assertEcommerceNodeSpread(t, path, m.Conventions.PodTopologySpread,
					deployment.Spec.Selector.MatchLabels, deployment.Spec.Template.Metadata.Labels,
					podSpec.TopologySpreadConstraints)
				assertSelectorEnv(t, path, container.Env, service)
				assertSelectorSecurityContext(t, path, podSpec.SecurityContext)
				assertSelectorMount(t, path, container.VolumeMounts, deployment.Spec.Template.Spec.Volumes,
					strings.ReplaceAll(m.Conventions.ConfigSourceSecret, "{env}", environment),
					strings.ReplaceAll(m.Conventions.ConfigSourceProjection, "{service}", service))
			})
		}
	}
}

func TestWorkloadIdentityBaseline(t *testing.T) {
	m := loadCoverageMatrix(t)

	// The canonical manifest is shared by Helm and the emergency raw path.
	f, err := os.Open("../../helm/files/zero-trust.yaml")
	if err != nil {
		t.Fatalf("open zero-trust manifest: %v", err)
	}
	defer f.Close()

	serviceAccounts := map[string]bool{}
	var cnpCount int
	decoder := yaml.NewDecoder(f)
	for {
		var doc struct {
			Kind     string `yaml:"kind"`
			Metadata struct {
				Name string `yaml:"name"`
			} `yaml:"metadata"`
		}
		if err := decoder.Decode(&doc); err != nil {
			if err == io.EOF {
				break
			}
			t.Fatalf("parse zero-trust manifest: %v", err)
		}
		switch doc.Kind {
		case "ServiceAccount":
			serviceAccounts[doc.Metadata.Name] = true
		case "CiliumNetworkPolicy":
			cnpCount++
		case "Role", "RoleBinding", "ClusterRole", "ClusterRoleBinding":
			t.Errorf("zero-trust manifest grants RBAC via %s/%s; workloads currently need zero Kubernetes API permissions",
				doc.Kind, doc.Metadata.Name)
		}
	}
	for service := range m.Services {
		name := "ecommerce-" + service
		if !serviceAccounts[name] {
			t.Errorf("zero-trust manifest missing ServiceAccount %q", name)
		}
	}
	for _, name := range []string{"ecommerce-frontend", "ecommerce-outbox-relay", "ecommerce-search-indexer"} {
		if !serviceAccounts[name] {
			t.Errorf("zero-trust manifest missing ServiceAccount %q", name)
		}
	}
	if cnpCount != 1 {
		t.Errorf("zero-trust manifest has %d CiliumNetworkPolicy resources, want 1 canonical multi-rule policy", cnpCount)
	}

	extraDeployments := map[string]string{
		"../tools/outbox-relay/deploy/dev/deployment.yaml":        "ecommerce-outbox-relay",
		"../tools/search-indexer/deploy/dev/deployment.yaml":      "ecommerce-search-indexer",
		"../../frontend/apps/consumer/deploy/deployment.yaml":     "ecommerce-frontend",
		"../../frontend/apps/consumer/deploy/pre/deployment.yaml": "ecommerce-frontend",
	}
	for path, wantSA := range extraDeployments {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Errorf("read %s: %v", path, err)
			continue
		}
		var deployment deploymentDocument
		if err := yaml.Unmarshal(data, &deployment); err != nil {
			t.Errorf("parse %s: %v", path, err)
			continue
		}
		podSpec := deployment.Spec.Template.Spec
		assertWorkloadIdentity(t, path, wantSA, podSpec.ServiceAccountName,
			podSpec.AutomountServiceAccountToken, podSpec.EnableServiceLinks)
		assertEcommerceNodeSpread(t, path, m.Conventions.PodTopologySpread,
			deployment.Spec.Selector.MatchLabels, deployment.Spec.Template.Metadata.Labels,
			podSpec.TopologySpreadConstraints)
	}

	jobPath := "../tools/search-indexer/deploy/dev/reindex-job.yaml"
	data, err := os.ReadFile(jobPath)
	if err != nil {
		t.Fatalf("read %s: %v", jobPath, err)
	}
	var job struct {
		Kind string `yaml:"kind"`
		Spec struct {
			Template struct {
				Spec struct {
					ServiceAccountName           string `yaml:"serviceAccountName"`
					AutomountServiceAccountToken *bool  `yaml:"automountServiceAccountToken"`
					EnableServiceLinks           *bool  `yaml:"enableServiceLinks"`
				} `yaml:"spec"`
			} `yaml:"template"`
		} `yaml:"spec"`
	}
	if err := yaml.Unmarshal(data, &job); err != nil {
		t.Fatalf("parse %s: %v", jobPath, err)
	}
	if job.Kind != "Job" {
		t.Fatalf("%s first document must be a Job", jobPath)
	}
	podSpec := job.Spec.Template.Spec
	assertWorkloadIdentity(t, jobPath, "ecommerce-search-indexer", podSpec.ServiceAccountName,
		podSpec.AutomountServiceAccountToken, podSpec.EnableServiceLinks)

	nextPath := "../../frontend/apps/consumer-next/deploy/dev.yaml"
	f, err = os.Open(nextPath)
	if err != nil {
		t.Fatalf("open %s: %v", nextPath, err)
	}
	defer f.Close()
	decoder = yaml.NewDecoder(f)
	var foundNextSA, foundNextDeployment bool
	for {
		var doc struct {
			Kind     string `yaml:"kind"`
			Metadata struct {
				Name string `yaml:"name"`
			} `yaml:"metadata"`
			AutomountServiceAccountToken *bool `yaml:"automountServiceAccountToken"`
			Spec                         struct {
				Strategy deploymentRollingStrategy `yaml:"strategy"`
				Selector struct {
					MatchLabels map[string]string `yaml:"matchLabels"`
				} `yaml:"selector"`
				Template struct {
					Metadata struct {
						Labels map[string]string `yaml:"labels"`
					} `yaml:"metadata"`
					Spec struct {
						Affinity struct {
							PodAntiAffinity struct {
								Required []deploymentPodAntiAffinityTerm `yaml:"requiredDuringSchedulingIgnoredDuringExecution"`
							} `yaml:"podAntiAffinity"`
						} `yaml:"affinity"`
						ServiceAccountName           string                               `yaml:"serviceAccountName"`
						AutomountServiceAccountToken *bool                                `yaml:"automountServiceAccountToken"`
						EnableServiceLinks           *bool                                `yaml:"enableServiceLinks"`
						TopologySpreadConstraints    []deploymentTopologySpreadConstraint `yaml:"topologySpreadConstraints"`
					} `yaml:"spec"`
				} `yaml:"template"`
			} `yaml:"spec"`
		}
		if err := decoder.Decode(&doc); err != nil {
			if err == io.EOF {
				break
			}
			t.Fatalf("parse %s: %v", nextPath, err)
		}
		switch doc.Kind {
		case "ServiceAccount":
			if doc.Metadata.Name == "ecommerce-consumer-next" {
				foundNextSA = true
				if doc.AutomountServiceAccountToken == nil || *doc.AutomountServiceAccountToken {
					t.Errorf("%s ServiceAccount must disable token automount", nextPath)
				}
			}
		case "Deployment":
			if doc.Metadata.Name == "consumer-next" {
				foundNextDeployment = true
				podSpec := doc.Spec.Template.Spec
				assertWorkloadIdentity(t, nextPath, "ecommerce-consumer-next", podSpec.ServiceAccountName,
					podSpec.AutomountServiceAccountToken, podSpec.EnableServiceLinks)
				assertEcommerceNodeSpread(t, nextPath, m.Conventions.PodTopologySpread,
					doc.Spec.Selector.MatchLabels, doc.Spec.Template.Metadata.Labels,
					podSpec.TopologySpreadConstraints)
				assertRequiredPodAntiAffinity(t, nextPath, podSpec.Affinity.PodAntiAffinity.Required,
					"app", "consumer-next")
				assertNoSurgeReplicatedRollout(t, nextPath, doc.Spec.Strategy)
			}
		}
	}
	if !foundNextSA || !foundNextDeployment {
		t.Errorf("%s must contain ecommerce-consumer-next ServiceAccount and consumer-next Deployment", nextPath)
	}
}

func TestHelmLibraryArchivesUseEcommerceNodeSpread(t *testing.T) {
	m := loadCoverageMatrix(t)
	sourcePath := "../../helm/library/templates/_deployment.tpl"
	source, err := os.ReadFile(sourcePath)
	if err != nil {
		t.Fatalf("read %s: %v", sourcePath, err)
	}
	services := make([]string, 0, len(m.Services))
	for service := range m.Services {
		services = append(services, service)
	}
	sort.Strings(services)

	spread := m.Conventions.PodTopologySpread
	const entry = "library/templates/_deployment.tpl"
	for _, service := range services {
		path := filepath.Join("../../helm/charts", service, "charts/library-0.1.0.tgz")
		template := readTarGzEntry(t, path, entry)
		if !bytes.Equal(template, source) {
			t.Errorf("%s %s differs from %s; rebuild the vendored dependency", path, entry, sourcePath)
		}
		for _, required := range []string{
			fmt.Sprintf("%s: %s", spread.LabelKey, spread.LabelValue),
			"topologySpreadConstraints:",
			fmt.Sprintf("maxSkew: %d", spread.MaxSkew),
			fmt.Sprintf("topologyKey: %s", spread.TopologyKey),
			fmt.Sprintf("whenUnsatisfiable: %s", spread.WhenUnsatisfiable),
			fmt.Sprintf("nodeAffinityPolicy: %s", spread.NodeAffinityPolicy),
			fmt.Sprintf("nodeTaintsPolicy: %s", spread.NodeTaintsPolicy),
			"items:",
			"- key: {{ .serviceName }}.yaml",
			"path: {{ .serviceName }}.yaml",
		} {
			if !strings.Contains(string(template), required) {
				t.Errorf("%s %s missing %q", path, entry, required)
			}
		}
	}
}

func readTarGzEntry(t *testing.T, path, entry string) []byte {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatalf("open %s: %v", path, err)
	}
	defer file.Close()

	gz, err := gzip.NewReader(file)
	if err != nil {
		t.Fatalf("read gzip %s: %v", path, err)
	}
	defer gz.Close()

	archive := tar.NewReader(gz)
	for {
		header, err := archive.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("read tar %s: %v", path, err)
		}
		if header.Name != entry {
			continue
		}
		data, err := io.ReadAll(archive)
		if err != nil {
			t.Fatalf("read %s from %s: %v", entry, path, err)
		}
		return data
	}
	t.Fatalf("%s missing %s", path, entry)
	return nil
}

func assertWorkloadIdentity(
	t *testing.T,
	source string,
	wantServiceAccount string,
	serviceAccount string,
	automount *bool,
	serviceLinks *bool,
) {
	t.Helper()
	if serviceAccount != wantServiceAccount {
		t.Errorf("%s serviceAccountName = %q, want %q", source, serviceAccount, wantServiceAccount)
	}
	if automount == nil || *automount {
		t.Errorf("%s must explicitly set automountServiceAccountToken: false", source)
	}
	if serviceLinks == nil || *serviceLinks {
		t.Errorf("%s must explicitly set enableServiceLinks: false", source)
	}
}

func assertEcommerceNodeSpread(
	t *testing.T,
	source string,
	want deploymentTopologySpreadConvention,
	selectorLabels map[string]string,
	podLabels map[string]string,
	constraints []deploymentTopologySpreadConstraint,
) {
	t.Helper()
	if want.LabelKey == "" || want.LabelValue == "" || want.TopologyKey == "" || want.MaxSkew < 1 {
		t.Fatalf("%s has incomplete pod_topology_spread convention: %+v", matrixPath, want)
	}
	if podLabels[want.LabelKey] != want.LabelValue {
		t.Errorf("%s pod template must label %s=%s", source, want.LabelKey, want.LabelValue)
	}
	if _, ok := selectorLabels[want.LabelKey]; ok {
		t.Errorf("%s must not add %s to the immutable Deployment selector", source, want.LabelKey)
	}

	matched := 0
	for _, constraint := range constraints {
		if constraint.LabelSelector.MatchLabels[want.LabelKey] != want.LabelValue {
			continue
		}
		matched++
		if constraint.MaxSkew != want.MaxSkew || constraint.TopologyKey != want.TopologyKey ||
			constraint.WhenUnsatisfiable != want.WhenUnsatisfiable ||
			constraint.NodeAffinityPolicy != want.NodeAffinityPolicy ||
			constraint.NodeTaintsPolicy != want.NodeTaintsPolicy || len(constraint.LabelSelector.MatchLabels) != 1 {
			t.Errorf("%s has invalid ecommerce node spread constraint: %+v; want %+v", source, constraint, want)
		}
	}
	if matched != 1 {
		t.Errorf("%s has %d suite-wide ecommerce node spread constraints, want 1", source, matched)
	}
}

func assertNoSurgeReplicatedRollout(t *testing.T, source string, strategy deploymentRollingStrategy) {
	t.Helper()
	if strategy.Type != "RollingUpdate" || strategy.RollingUpdate.MaxUnavailable != 1 ||
		strategy.RollingUpdate.MaxSurge != 0 {
		t.Errorf("%s must roll replicated hard-spread workloads with maxUnavailable=1 and maxSurge=0", source)
	}
}

func assertRequiredPodAntiAffinity(
	t *testing.T,
	source string,
	terms []deploymentPodAntiAffinityTerm,
	labelKey string,
	labelValue string,
) {
	t.Helper()
	for _, term := range terms {
		if term.TopologyKey == "kubernetes.io/hostname" &&
			term.LabelSelector.MatchLabels[labelKey] == labelValue {
			return
		}
	}
	t.Errorf("%s must require pod anti-affinity for %s=%s on kubernetes.io/hostname", source, labelKey, labelValue)
}

func assertSelectorSecurityContext(t *testing.T, source string, security deploymentSecurityContext) {
	t.Helper()
	if !security.RunAsNonRoot || security.RunAsUser != 1000 || security.RunAsGroup != 1000 ||
		security.FSGroup != 1000 || security.FSGroupChangePolicy != "OnRootMismatch" {
		t.Errorf("%s has invalid selector securityContext: %+v", source, security)
	}
}

func assertSelectorEnv(t *testing.T, source string, env []deploymentEnv, service string) {
	t.Helper()
	values := make(map[string]string, len(env))
	for _, item := range env {
		values[item.Name] = item.Value
	}
	want := "/etc/ecommerce/config-source/" + service + ".yaml"
	if values["CONFIG_SOURCE_FILE"] != want {
		t.Errorf("%s CONFIG_SOURCE_FILE = %q, want %q", source, values["CONFIG_SOURCE_FILE"], want)
	}
	for _, retired := range []string{"CONFIG_SOURCE", "CONSUL_PATH"} {
		if _, ok := values[retired]; ok {
			t.Errorf("%s still declares retired %s", source, retired)
		}
	}
}

func assertSelectorMount(
	t *testing.T,
	source string,
	mounts []deploymentVolumeMount,
	volumes []deploymentVolume,
	wantSecret string,
	wantProjection string,
) {
	t.Helper()
	var foundMount bool
	for _, mount := range mounts {
		if mount.Name == "config-source" {
			foundMount = true
			if mount.MountPath != "/etc/ecommerce/config-source" || !mount.ReadOnly {
				t.Errorf("%s has invalid config-source mount: %+v", source, mount)
			}
		}
	}
	if !foundMount {
		t.Errorf("%s is missing config-source volumeMount", source)
	}

	var foundVolume bool
	for _, volume := range volumes {
		if volume.Name == "config-source" {
			foundVolume = true
			if volume.Secret.SecretName != wantSecret || volume.Secret.DefaultMode != 0o400 {
				t.Errorf("%s has invalid config-source Secret volume: %+v", source, volume.Secret)
			}
			if len(volume.Secret.Items) != 1 || volume.Secret.Items[0].Key != wantProjection ||
				volume.Secret.Items[0].Path != wantProjection {
				t.Errorf("%s must project only %q from config-source Secret: %+v",
					source, wantProjection, volume.Secret.Items)
			}
		}
	}
	if !foundVolume {
		t.Errorf("%s is missing config-source Secret volume", source)
	}
}

// 禁止把 Secret/ConfigMap 卷挂到 /etc/ssl/certs 根目录。
//
// K8s 的卷挂载会**替换**挂载点的整个目录内容。挂到 /etc/ssl/certs 之后,容器里只剩
// 卷里那几个文件,**发行版自带的 CA bundle 全部不可见** —— 任何从容器发起的公网
// HTTPS 调用都会以 `x509: certificate signed by unknown authority` 失败。
//
// 触发事故(2026-08-29):helm/ 下 20 处(values.yaml 10 + 各 chart values*.yaml 10)
// 把 db-ca-cert 挂到 /etc/ssl/certs。它当时没炸,只因为 GitOps 是断的、这套 chart
// 没被 apply;`backend/services/*/deploy/` 那条真正在跑的路径用的是 /etc/postgresql/ca。
// 一旦接回 ArgoCD,payment→支付宝、user→Casdoor 的 HTTPS 出站会同时失效,
// 且失败信息指向证书而非挂载,极难归因。
//
// 附带结论:那个卷本身也是多余的 —— 数据库 CA 实际由配置里的 Tls.CaPem(PEM 字符串)
// 加载,没有任何 Go 代码读这个挂载文件。保留断言是为了防止有人再挂回来。
//
// 要挂单个证书文件时用 subPath(只替换一个文件而非整个目录),或换一个专用目录
// 如 /etc/postgresql/ca 并让应用显式指向它。
func TestNoSecretVolumeShadowsSystemCABundle(t *testing.T) {
	// 匹配 mountPath 指向 /etc/ssl/certs 本身(带不带引号、有无尾斜杠都算)。
	// 挂到它**下面**的具体文件(如 /etc/ssl/certs/foo.crt)不在此列 —— 那是 subPath 式
	// 单文件挂载,不会替换整个目录。
	re := regexp.MustCompile(`mountPath:\s*["']?/etc/ssl/certs/?["']?\s*$`)

	var hits []string
	roots := []string{
		filepath.Join(repoRoot, "helm"),
		filepath.Join(repoRoot, "backend", "services"),
		filepath.Join(repoRoot, "backend", "tools"),
	}
	for _, root := range roots {
		if _, err := os.Stat(root); os.IsNotExist(err) {
			continue
		}
		err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil //nolint:nilerr // 单文件异常不中断遍历
			}
			if ext := filepath.Ext(p); ext != ".yaml" && ext != ".yml" {
				return nil
			}
			f, openErr := os.Open(p)
			if openErr != nil {
				return nil
			}
			defer f.Close()
			sc := bufio.NewScanner(f)
			sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
			for line := 1; sc.Scan(); line++ {
				if re.MatchString(sc.Text()) {
					hits = append(hits, fmt.Sprintf("%s:%d", p, line))
				}
			}
			return nil
		})
		if err != nil {
			t.Fatalf("遍历 %s: %v", root, err)
		}
	}

	if len(hits) > 0 {
		sort.Strings(hits)
		t.Errorf("以下 %d 处把卷挂到 /etc/ssl/certs 根目录,会遮蔽发行版 CA bundle,"+
			"导致容器内所有公网 HTTPS 调用验不过证书:\n  %s\n"+
			"改法:换用专用目录(如 /etc/postgresql/ca),或用 subPath 只挂单个文件。",
			len(hits), strings.Join(hits, "\n  "))
	}
}
