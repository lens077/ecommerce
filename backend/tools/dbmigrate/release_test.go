package main

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

// A Secret key can exist but be empty. A release must not silently select the
// local developer DSN (or baseline an unexpected database) in that situation.
func TestReleaseRequiresExplicitDSN(t *testing.T) {
	if os.Getenv("DBMIGRATE_TEST_CHILD") == "1" {
		os.Args = []string{"dbmigrate", "-require-dsn", "-base=../../services", "up"}
		main()
		return
	}
	cmd := exec.Command(os.Args[0], "-test.run=^TestReleaseRequiresExplicitDSN$")
	cmd.Env = append(os.Environ(), "DBMIGRATE_TEST_CHILD=1", "DB_URI=", "DB_SOURCE=")
	out, err := cmd.CombinedOutput()
	if err == nil || !strings.Contains(string(out), "release requires an explicit DSN") {
		t.Fatalf("expected explicit DSN rejection, err=%v output=%s", err, out)
	}
}
