// config-seed audits Config Center Bootstrap entries and performs the one-time
// pre-environment migration from a local Consul export. It never prints values.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"connectrpc.com/connect"
	configv1 "github.com/lens077/control-tower/api/config/v1"
	"github.com/lens077/control-tower/api/config/v1/configv1connect"
	"github.com/lens077/control-tower/sdk/configsource"
	"gopkg.in/yaml.v3"
)

const configKey = "bootstrap.yaml"

var services = []string{
	"address", "behavior", "cart", "inventory", "merchant",
	"order", "payment", "product", "search", "user",
}

// Only sections used by the current service graph survive the migration.
var topLevelSections = map[string]map[string]bool{
	"address":   set("server", "data", "observability", "discovery", "search", "log", "auth"),
	"behavior":  set("server", "data", "recommend", "observability", "discovery", "log", "auth"),
	"cart":      set("server", "data", "store", "observability", "discovery", "log"),
	"inventory": set("server", "data", "observability", "discovery", "log"),
	"merchant":  set("server", "data", "observability", "discovery", "log", "auth"),
	"order":     set("server", "data", "observability", "discovery", "log"),
	"payment":   set("server", "data", "pay", "observability", "discovery", "log"),
	"product":   set("server", "data", "recommend", "observability", "discovery", "log"),
	"search":    set("server", "data", "observability", "discovery", "search", "log", "auth"),
	"user":      set("server", "data", "observability", "discovery", "log", "auth"),
}

type consulExportEntry struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type audit struct {
	service  string
	version  int32
	contents []byte
	sections []string
	data     []string
}

func main() {
	selector := flag.String("selector", "services/cart/configs/source.dev.yaml", "local config_center selector used for address and service token")
	environment := flag.String("environment", "pre", "Config Center environment")
	snapshot := flag.String("snapshot", "", "optional local Consul JSON export used as migration input")
	write := flag.Bool("write", false, "write cropped snapshot entries to Config Center")
	timeout := flag.Duration("timeout", 30*time.Second, "overall timeout")
	flag.Parse()

	cfg, err := configsource.LoadSourceConfig(*selector)
	if err != nil {
		fail("load selector: %v", err)
	}
	if cfg.Type != configsource.TypeConfigCenter {
		fail("selector must use config_center, got %q", cfg.Type)
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()

	machine := configv1connect.NewConfigServiceClient(http.DefaultClient, cfg.ConfigCenter.Address)
	if !*write {
		if *snapshot == "" {
			auditRemote(ctx, machine, cfg.ConfigCenter.ServiceToken, *environment)
			return
		}
		dryRunSnapshot(*snapshot, *environment)
		return
	}

	if *snapshot == "" {
		fail("-write requires -snapshot")
	}
	adminToken := strings.TrimSpace(os.Getenv("CONFIG_CENTER_ADMIN_TOKEN"))
	if adminToken == "" {
		fail("-write requires CONFIG_CENTER_ADMIN_TOKEN")
	}
	admin := configv1connect.NewConfigServiceClient(newAdminHTTPClient(adminToken), cfg.ConfigCenter.Address)
	writeSnapshot(ctx, admin, machine, cfg.ConfigCenter.ServiceToken, *snapshot, *environment)
}

func auditRemote(ctx context.Context, client configv1connect.ConfigServiceClient, token, environment string) {
	for _, service := range services {
		a, err := getAudit(ctx, client, token, service, environment)
		if err != nil {
			fail("audit %s/%s/%s: %v", service, environment, configKey, err)
		}
		printAudit("REMOTE", a)
	}
}

func dryRunSnapshot(path, environment string) {
	entries, err := loadSnapshot(path)
	if err != nil {
		fail("load snapshot: %v", err)
	}
	for _, service := range services {
		contents, err := snapshotBootstrap(entries, service, environment)
		if err != nil {
			fail("snapshot %s/%s: %v", service, environment, err)
		}
		cropped, err := cropBootstrap(service, contents)
		if err != nil {
			fail("crop %s/%s: %v", service, environment, err)
		}
		a, err := inspect(service, 0, cropped)
		if err != nil {
			fail("inspect %s/%s: %v", service, environment, err)
		}
		printAudit("DRYRUN", a)
	}
}

func writeSnapshot(
	ctx context.Context,
	admin, machine configv1connect.ConfigServiceClient,
	machineToken, path, environment string,
) {
	entries, err := loadSnapshot(path)
	if err != nil {
		fail("load snapshot: %v", err)
	}

	for _, service := range services {
		contents, err := snapshotBootstrap(entries, service, environment)
		if err != nil {
			fail("snapshot %s/%s: %v", service, environment, err)
		}
		cropped, err := cropBootstrap(service, contents)
		if err != nil {
			fail("crop %s/%s: %v", service, environment, err)
		}

		_, err = admin.PutKey(ctx, connect.NewRequest(&configv1.PutKeyRequest{
			Namespace:   service,
			Environment: environment,
			Key:         configKey,
			Format:      configv1.ConfigFormat_CONFIG_FORMAT_YAML,
			Value:       string(cropped),
			Comment:     "retire Consul KV Bootstrap source",
			Description: "service Bootstrap; Config Center is the sole source",
		}))
		if err != nil {
			fail("write %s/%s/%s: %v", service, environment, configKey, err)
		}

		got, err := getAudit(ctx, machine, machineToken, service, environment)
		if err != nil {
			fail("read back %s/%s/%s: %v", service, environment, configKey, err)
		}
		if sha256.Sum256(got.contents) != sha256.Sum256(cropped) {
			fail("read back mismatch for %s/%s/%s", service, environment, configKey)
		}
		printAudit("WRITTEN", got)
	}
}

func getAudit(
	ctx context.Context,
	client configv1connect.ConfigServiceClient,
	token, service, environment string,
) (audit, error) {
	req := connect.NewRequest(&configv1.GetKeyRequest{
		Namespace: service, Environment: environment, Key: configKey,
	})
	if token != "" {
		req.Header().Set("x-config-center-service-token", token)
	}
	resp, err := client.GetKey(ctx, req)
	if err != nil {
		return audit{}, err
	}
	entry := resp.Msg.GetEntry()
	if entry.GetValue() == "" {
		return audit{}, errors.New("entry is empty")
	}
	return inspect(service, entry.GetVersion(), []byte(entry.GetValue()))
}

func inspect(service string, version int32, contents []byte) (audit, error) {
	var document map[string]any
	if err := yaml.Unmarshal(contents, &document); err != nil {
		return audit{}, err
	}
	sections := sortedKeys(document)
	data := []string(nil)
	if rawData, ok := document["data"].(map[string]any); ok {
		data = sortedKeys(rawData)
	}
	return audit{service: service, version: version, contents: contents, sections: sections, data: data}, nil
}

func printAudit(prefix string, a audit) {
	sum := sha256.Sum256(a.contents)
	fmt.Printf("%-7s %-10s v%-4d bytes=%-5d sha256=%s sections=%s data=%s\n",
		prefix, a.service, a.version, len(a.contents), hex.EncodeToString(sum[:8]),
		strings.Join(a.sections, ","), strings.Join(a.data, ","))
}

func loadSnapshot(path string) (map[string]string, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var raw []consulExportEntry
	if err := json.Unmarshal(contents, &raw); err != nil {
		return nil, err
	}
	entries := make(map[string]string, len(raw))
	for _, entry := range raw {
		entries[entry.Key] = entry.Value
	}
	return entries, nil
}

func snapshotBootstrap(entries map[string]string, service, environment string) ([]byte, error) {
	key := fmt.Sprintf("ecommerce/%s/%s.yml", service, environment)
	encoded, ok := entries[key]
	if !ok {
		return nil, fmt.Errorf("missing %s", key)
	}
	contents, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("decode %s: %w", key, err)
	}
	return contents, nil
}

func cropBootstrap(service string, contents []byte) ([]byte, error) {
	var document yaml.Node
	if err := yaml.Unmarshal(contents, &document); err != nil {
		return nil, err
	}
	allowed, ok := topLevelSections[service]
	if !ok {
		return nil, fmt.Errorf("unknown service %q", service)
	}
	if len(document.Content) != 1 || document.Content[0].Kind != yaml.MappingNode {
		return nil, errors.New("Bootstrap must be a YAML mapping")
	}
	root := document.Content[0]
	retainMappingKeys(root, allowed)
	if service == "payment" {
		if data := mappingValue(root, "data"); data != nil && data.Kind == yaml.MappingNode {
			retainMappingKeys(data, set("database"))
		}
	}
	return yaml.Marshal(&document)
}

func retainMappingKeys(mapping *yaml.Node, allowed map[string]bool) {
	kept := make([]*yaml.Node, 0, len(mapping.Content))
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if allowed[mapping.Content[i].Value] {
			kept = append(kept, mapping.Content[i], mapping.Content[i+1])
		}
	}
	mapping.Content = kept
}

func mappingValue(mapping *yaml.Node, key string) *yaml.Node {
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if mapping.Content[i].Value == key {
			return mapping.Content[i+1]
		}
	}
	return nil
}

type bearerTokenTransport struct {
	base  http.RoundTripper
	token string
}

func (t bearerTokenTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	clone.Header = req.Header.Clone()
	clone.Header.Set("Authorization", "Bearer "+t.token)
	return t.base.RoundTrip(clone)
}

func newAdminHTTPClient(token string) *http.Client {
	return &http.Client{Transport: bearerTokenTransport{base: http.DefaultTransport, token: token}}
}

func sortedKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func set(values ...string) map[string]bool {
	result := make(map[string]bool, len(values))
	for _, value := range values {
		result[value] = true
	}
	return result
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
