package structcheck

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/lens077/ecommerce/backend/pkg/meta"
)

const buildVersionLDFlag = "-X github.com/lens077/ecommerce/backend/pkg/meta.Version=$VERSION"

// The Go linker silently ignores a missing -X target, so compilation alone
// cannot prove that image version injection still works.
func TestBuildVersionInjection(t *testing.T) {
	// Taking a *string keeps this an addressable string variable, which -X requires.
	// Changing it to a const would still compile consumers but make injection silent.
	requireStringVariable := func(*string) {}
	requireStringVariable(&meta.Version)
	if meta.Version == "" {
		t.Fatal("pkg/meta.Version must have a non-empty local-build fallback")
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

func TestEnvAndMetaUseSharedPackages(t *testing.T) {
	for service := range loadMatrix(t).Services {
		for _, packageName := range []string{"env", "meta"} {
			path := filepath.Join(servicesDir, service, "internal", "pkg", packageName)
			if _, err := os.Stat(path); err == nil {
				t.Errorf("%s still has duplicated internal/pkg/%s; use backend/pkg/%s", service, packageName, packageName)
			} else if !os.IsNotExist(err) {
				t.Fatalf("stat %s: %v", path, err)
			}
		}
	}
}
