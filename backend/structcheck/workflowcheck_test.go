package structcheck

import (
	"os"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestTrivySarifTargetsDefaultBranch(t *testing.T) {
	t.Parallel()

	data, err := os.ReadFile("../../.github/workflows/service-ci.yml")
	if err != nil {
		t.Fatalf("读取 service-ci.yml: %v", err)
	}

	var workflow struct {
		Jobs map[string]struct {
			Steps []struct {
				Name string         `yaml:"name"`
				With map[string]any `yaml:"with"`
			} `yaml:"steps"`
		} `yaml:"jobs"`
	}
	if err := yaml.Unmarshal(data, &workflow); err != nil {
		t.Fatalf("解析 service-ci.yml: %v", err)
	}

	steps := workflow.Jobs["build"].Steps
	for _, step := range steps {
		if step.Name != "Upload Trivy SARIF" {
			continue
		}
		if got := step.With["ref"]; got != "refs/heads/main" {
			t.Fatalf("Trivy SARIF 必须上传到 main 才会生成可见 alert，当前 ref=%v", got)
		}
		if got := step.With["sha"]; got != "${{ github.sha }}" {
			t.Fatalf("Trivy SARIF 的 sha 必须与发布 tag 指向同一提交，当前 sha=%v", got)
		}
		return
	}

	t.Fatal("service-ci.yml 缺少 Upload Trivy SARIF 步骤")
}
