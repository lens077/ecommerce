package main

import "testing"

func TestResolveMeiliKey(t *testing.T) {
	t.Setenv("MEILI_API_KEY", "scoped-key")
	t.Setenv("MEILI_MASTER_KEY", "legacy-master-key")

	if got := resolveMeiliKey("flag-key"); got != "flag-key" {
		t.Fatalf("explicit key = %q, want flag-key", got)
	}
	if got := resolveMeiliKey(""); got != "scoped-key" {
		t.Fatalf("MEILI_API_KEY = %q, want scoped-key", got)
	}

	t.Setenv("MEILI_API_KEY", "")
	if got := resolveMeiliKey(""); got != "legacy-master-key" {
		t.Fatalf("legacy key = %q, want legacy-master-key", got)
	}
}
