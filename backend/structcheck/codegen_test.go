package structcheck

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestRootAPIGenerationIsScopedAndReproducible(t *testing.T) {
	t.Parallel()

	makefile, err := os.ReadFile("../Makefile")
	if err != nil {
		t.Fatalf("读取 backend/Makefile: %v", err)
	}
	text := string(makefile)
	for _, command := range []string{
		"buf generate --template buf.gen.yaml --path api",
		"buf generate --template buf.gen.ts.yaml --path api",
	} {
		if !strings.Contains(text, command) {
			t.Fatalf("make api 必须只生成公开 API，缺少命令 %q", command)
		}
	}
	if !strings.Contains(text, `PATH="$(PROTOC_GEN_ES_DIR):$$PATH"`) {
		t.Fatal("make api 必须从仓库内 frontend workspace 解析 protoc-gen-es")
	}

	packageJSON, err := os.ReadFile("../../frontend/package.json")
	if err != nil {
		t.Fatalf("读取 frontend/package.json: %v", err)
	}
	var manifest struct {
		DevDependencies map[string]string `json:"devDependencies"`
	}
	if err := json.Unmarshal(packageJSON, &manifest); err != nil {
		t.Fatalf("解析 frontend/package.json: %v", err)
	}
	if got := manifest.DevDependencies["@bufbuild/protoc-gen-es"]; got != "catalog:" {
		t.Fatalf("frontend 根 workspace 必须固定 protoc-gen-es，当前值 %q", got)
	}
}
