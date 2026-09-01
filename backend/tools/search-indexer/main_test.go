package main

import "testing"

func TestResolveOptionPrefersFlagOverEnvironment(t *testing.T) {
	t.Setenv("ELASTICSEARCH_API_KEY", "environment-key")

	if got := resolveOption("flag-key", "ELASTICSEARCH_API_KEY"); got != "flag-key" {
		t.Fatalf("explicit value = %q, want flag-key", got)
	}
	if got := resolveOption("", "ELASTICSEARCH_API_KEY"); got != "environment-key" {
		t.Fatalf("environment value = %q, want environment-key", got)
	}
}
