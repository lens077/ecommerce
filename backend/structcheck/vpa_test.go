package structcheck

import (
	"io"
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

type vpaDocument struct {
	APIVersion string `yaml:"apiVersion"`
	Kind       string `yaml:"kind"`
	Metadata   struct {
		Name      string            `yaml:"name"`
		Namespace string            `yaml:"namespace"`
		Labels    map[string]string `yaml:"labels"`
	} `yaml:"metadata"`
	Spec struct {
		TargetRef struct {
			APIVersion string `yaml:"apiVersion"`
			Kind       string `yaml:"kind"`
			Name       string `yaml:"name"`
		} `yaml:"targetRef"`
		UpdatePolicy struct {
			UpdateMode string `yaml:"updateMode"`
		} `yaml:"updatePolicy"`
		ResourcePolicy struct {
			ContainerPolicies []struct {
				ContainerName       string         `yaml:"containerName"`
				ControlledResources []string       `yaml:"controlledResources"`
				ControlledValues    string         `yaml:"controlledValues"`
				MinAllowed          map[string]any `yaml:"minAllowed"`
				MaxAllowed          map[string]any `yaml:"maxAllowed"`
			} `yaml:"containerPolicies"`
		} `yaml:"resourcePolicy"`
	} `yaml:"spec"`
}

type vpaTarget struct {
	VPAName       string
	ContainerName string
}

var ecommerceVPATargets = map[string]vpaTarget{
	// control-tower-gateway 的 VPA 不在本仓:那是 control-tower 仓的工作负载,本仓曾多放一份并与
	// 它们已 apply 的版本打架(containerName / min-max 都不同),2026-09-06 移除。
	"consumer-next":              {VPAName: "consumer-next-vpa", ContainerName: "consumer-next"},
	"ecommerce-address-deploy":   {VPAName: "ecommerce-address-vpa", ContainerName: "ecommerce-address"},
	"ecommerce-behavior-deploy":  {VPAName: "ecommerce-behavior-vpa", ContainerName: "ecommerce-behavior"},
	"ecommerce-cart-deploy":      {VPAName: "ecommerce-cart-vpa", ContainerName: "ecommerce-cart"},
	"ecommerce-frontend-deploy":  {VPAName: "ecommerce-frontend-vpa", ContainerName: "ecommerce-frontend"},
	"ecommerce-inventory-deploy": {VPAName: "ecommerce-inventory-vpa", ContainerName: "ecommerce-inventory"},
	"ecommerce-merchant-deploy":  {VPAName: "ecommerce-merchant-vpa", ContainerName: "ecommerce-merchant"},
	"ecommerce-order-deploy":     {VPAName: "ecommerce-order-vpa", ContainerName: "ecommerce-order"},
	"ecommerce-payment-deploy":   {VPAName: "ecommerce-payment-vpa", ContainerName: "ecommerce-payment"},
	"ecommerce-product-deploy":   {VPAName: "ecommerce-product-vpa", ContainerName: "ecommerce-product"},
	"ecommerce-search-deploy":    {VPAName: "ecommerce-search-vpa", ContainerName: "ecommerce-search"},
	"ecommerce-user-deploy":      {VPAName: "ecommerce-user-vpa", ContainerName: "ecommerce-user"},
}

func TestEcommerceVPARecommendationsCoverManagedDeployments(t *testing.T) {
	path := "../../application-vpa.yml"
	documents := readVPADocuments(t, path)
	if len(documents) != len(ecommerceVPATargets) {
		t.Fatalf("%s must define %d VPAs, got %d", path, len(ecommerceVPATargets), len(documents))
	}

	seenTargets := make(map[string]bool, len(documents))
	for _, document := range documents {
		assertRecommendationOnlyVPA(t, path, document)
		targetName := document.Spec.TargetRef.Name
		expected, ok := ecommerceVPATargets[targetName]
		if !ok {
			t.Errorf("%s contains unexpected VPA target %q", path, targetName)
			continue
		}
		if seenTargets[targetName] {
			t.Errorf("%s contains duplicate VPA target %q", path, targetName)
		}
		seenTargets[targetName] = true
		if document.Metadata.Name != expected.VPAName {
			t.Errorf("%s target %s VPA name = %q, want %q", path, targetName, document.Metadata.Name, expected.VPAName)
		}
		if len(document.Spec.ResourcePolicy.ContainerPolicies) == 1 &&
			document.Spec.ResourcePolicy.ContainerPolicies[0].ContainerName != expected.ContainerName {
			t.Errorf("%s target %s container = %q, want %q", path, targetName,
				document.Spec.ResourcePolicy.ContainerPolicies[0].ContainerName, expected.ContainerName)
		}
	}

	for targetName := range ecommerceVPATargets {
		if !seenTargets[targetName] {
			t.Errorf("%s is missing VPA target %q", path, targetName)
		}
	}
}

// 各服务目录下曾各有一份 vpa.yml(只 cart/behavior/order 三个,与 application-vpa.yml 同名条目
// 逐字段重复)。2026-09-06 起只保留 application-vpa.yml 一份,这里断言它们不会再长回来。
func TestNoServiceDirectoryVPAs(t *testing.T) {
	paths, err := filepath.Glob("../services/*/deploy/*/vpa.y*ml")
	if err != nil {
		t.Fatalf("glob service VPA files: %v", err)
	}
	for _, path := range paths {
		t.Errorf("%s: VPA 只在 application-vpa.yml(裸侧)与 helm 子 chart 的 vpa 模板里各一份,不要在服务目录再放一份", path)
	}
}

func readVPADocuments(t *testing.T, path string) []vpaDocument {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatalf("open %s: %v", path, err)
	}
	defer file.Close()

	decoder := yaml.NewDecoder(file)
	var documents []vpaDocument
	for {
		var document vpaDocument
		if err := decoder.Decode(&document); err != nil {
			if err == io.EOF {
				break
			}
			t.Fatalf("parse %s: %v", path, err)
		}
		if document.Kind == "" {
			continue
		}
		if document.Kind != "VerticalPodAutoscaler" {
			t.Fatalf("%s contains unexpected kind %q", path, document.Kind)
		}
		documents = append(documents, document)
	}
	return documents
}

func assertRecommendationOnlyVPA(t *testing.T, path string, document vpaDocument) {
	t.Helper()
	if document.APIVersion != "autoscaling.k8s.io/v1" {
		t.Errorf("%s %s apiVersion = %q", path, document.Metadata.Name, document.APIVersion)
	}
	if document.Metadata.Namespace != "ecommerce" {
		t.Errorf("%s %s namespace = %q, want ecommerce", path, document.Metadata.Name, document.Metadata.Namespace)
	}
	if document.Metadata.Labels["app.kubernetes.io/part-of"] != "ecommerce" {
		t.Errorf("%s %s must label app.kubernetes.io/part-of=ecommerce", path, document.Metadata.Name)
	}
	if document.Spec.TargetRef.APIVersion != "apps/v1" || document.Spec.TargetRef.Kind != "Deployment" {
		t.Errorf("%s %s must target an apps/v1 Deployment", path, document.Metadata.Name)
	}
	if document.Spec.UpdatePolicy.UpdateMode != "Off" {
		t.Errorf("%s %s updateMode = %q, want Off", path, document.Metadata.Name, document.Spec.UpdatePolicy.UpdateMode)
	}
	if len(document.Spec.ResourcePolicy.ContainerPolicies) != 1 {
		t.Errorf("%s %s must define exactly one container policy", path, document.Metadata.Name)
		return
	}
	policy := document.Spec.ResourcePolicy.ContainerPolicies[0]
	if policy.ControlledValues != "RequestsOnly" {
		t.Errorf("%s %s controlledValues = %q, want RequestsOnly", path, document.Metadata.Name, policy.ControlledValues)
	}
	resources := make(map[string]bool, len(policy.ControlledResources))
	for _, resource := range policy.ControlledResources {
		resources[resource] = true
	}
	if len(resources) != 2 || !resources["cpu"] || !resources["memory"] {
		t.Errorf("%s %s controlledResources = %v, want cpu and memory", path, document.Metadata.Name, policy.ControlledResources)
	}
	if len(policy.MinAllowed) != 0 || len(policy.MaxAllowed) != 0 {
		t.Errorf("%s %s observation policy must not cap recommendations with minAllowed/maxAllowed", path, document.Metadata.Name)
	}
}
