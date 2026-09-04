package structcheck

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/lens077/go-connect-kit/configschema"
)

const bootstrapDefinition = "conf.v1.Bootstrap.schema.json"

type bootstrapSchemaBundle struct {
	Definitions map[string]json.RawMessage `json:"$defs"`
}

type bootstrapDefinitionSchema struct {
	AdditionalProperties *bool                      `json:"additionalProperties"`
	Properties           map[string]json.RawMessage `json:"properties"`
}

func TestBootstrapSchemasAreStrictAndServiceScoped(t *testing.T) {
	services := configServices(t)
	for _, service := range services {
		service := service
		t.Run(service, func(t *testing.T) {
			schemaPath := filepath.Join(servicesDir, service, "configs", "bootstrap.schema.json")
			schemaData, err := os.ReadFile(schemaPath)
			if err != nil {
				t.Fatalf("读取 %s: %v", schemaPath, err)
			}

			var bundle bootstrapSchemaBundle
			if err := json.Unmarshal(schemaData, &bundle); err != nil {
				t.Fatalf("解析 %s: %v", schemaPath, err)
			}
			var bootstrap bootstrapDefinitionSchema
			if err := json.Unmarshal(bundle.Definitions[bootstrapDefinition], &bootstrap); err != nil {
				t.Fatalf("解析 %s 的 Bootstrap 定义: %v", schemaPath, err)
			}
			if bootstrap.AdditionalProperties == nil || *bootstrap.AdditionalProperties {
				t.Fatalf("%s: Bootstrap 必须设置 additionalProperties=false", schemaPath)
			}
			_, permitsSearch := bootstrap.Properties["search"]
			if permitsSearch != (service == "search") {
				t.Fatalf("%s: 顶层 search 只允许 search 服务持有", schemaPath)
			}
		})
	}
}

func TestBootstrapConfigsMatchSchemas(t *testing.T) {
	services := configServices(t)
	for _, service := range services {
		schemaPath := filepath.Join(servicesDir, service, "configs", "bootstrap.schema.json")
		schemaData, err := os.ReadFile(schemaPath)
		if err != nil {
			t.Fatalf("读取 %s: %v", schemaPath, err)
		}
		for _, name := range []string{"config.yaml.example", "dev.yml", "pre.yml"} {
			configPath := filepath.Join(servicesDir, service, "configs", name)
			configData, err := os.ReadFile(configPath)
			if os.IsNotExist(err) {
				continue
			}
			if err != nil {
				t.Fatalf("读取 %s: %v", configPath, err)
			}
			t.Run(service+"/"+name, func(t *testing.T) {
				if err := configschema.Validate(schemaData, configData); err != nil {
					t.Fatalf("%s: %s", configPath, configschema.RedactedError(err))
				}
			})
		}
	}
}

func configServices(t *testing.T) []string {
	t.Helper()
	entries, err := os.ReadDir(servicesDir)
	if err != nil {
		t.Fatalf("读取 services 目录: %v", err)
	}
	var services []string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if _, err := os.Stat(filepath.Join(servicesDir, entry.Name(), "configs", "bootstrap.schema.json")); err == nil {
			services = append(services, entry.Name())
		}
	}
	sort.Strings(services)
	return services
}
