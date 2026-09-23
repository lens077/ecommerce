#!/usr/bin/env bash
# verify-repowise.sh — build a local Repowise index and ratchet doc drift.
#
# This is a read-only, no-LLM gate. It complements verify-context, structcheck,
# deployment parity, and live Kubernetes diff; it does not replace them.
set -euo pipefail

root=$(git rev-parse --show-toplevel) || {
  echo "verify-repowise: not inside a git repository" >&2
  exit 2
}
cd "$root"

repo_bin=${REPOWISE_BIN:-repowise}
expected_version=${REPOWISE_VERSION:-0.52.0}
baseline=${REPOWISE_DRIFT_BASELINE:-scripts/repowise-doc-drift-baseline.json}
mode=${REPOWISE_MODE:-fast}
workdir=$(mktemp -d "${TMPDIR:-/tmp}/verify-repowise.XXXXXX")
trap 'rm -rf "$workdir"' EXIT

command -v "$repo_bin" >/dev/null 2>&1 || {
  echo "verify-repowise: missing $repo_bin; install with: uv tool install repowise==$expected_version" >&2
  exit 2
}

actual_version=$("$repo_bin" --version | sed -n 's/.*version //p')
[ "$actual_version" = "$expected_version" ] || {
  echo "verify-repowise: expected repowise $expected_version, found $actual_version" >&2
  exit 1
}

# Keep indexing local and deterministic: no prose, provider, embedder, telemetry,
# editor wiring, hooks, or project-local agent files.
export DO_NOT_TRACK=1
export REPOWISE_TELEMETRY_DISABLED=1
export REPOWISE_SKIP_EDITOR_SETUP=1
export REPOWISE_NO_SAVE_KEY=1
export REPOWISE_PARSE_WORKERS="${REPOWISE_PARSE_WORKERS:-1}"

# Repowise 0.52.0 loads every declared grammar at startup. Its optional COBOL
# grammar is fetched from GitHub on demand, even when the repo has no COBOL.
# Mask only that unused optional package; a COBOL file makes the gate use the
# real package and fail loudly if the grammar cannot be installed.
if ! git ls-files --cached --others --exclude-standard -- '*.cbl' '*.cob' '*.cobol' '*.cpy' | grep -q .; then
  shim_dir="$workdir/python-shims/tree_sitter_language_pack"
  mkdir -p "$shim_dir"
  printf '%s\n' 'raise ImportError("unused COBOL grammar disabled by verify-repowise")' >"$shim_dir/__init__.py"
  export PYTHONPATH="$workdir/python-shims${PYTHONPATH:+:$PYTHONPATH}"
fi

# --no-seed: inside a linked git worktree, Repowise auto-seeds from the base
# checkout's .repowise and only re-indexes files it believes changed. On
# 2026-09-23 that made the same commit report 4, then 1, then 0 drift findings,
# because the base checkout carried another session's uncommitted edits. The
# gate must judge only the checked-out content, so always index from scratch.
"$repo_bin" init \
  --mode "$mode" \
  --no-seed \
  --no-prose \
  --provider mock \
  --embedder mock \
  --exclude .scratch/ \
  --no-editor-setup \
  --no-hook \
  --no-claude-md \
  --no-agents \
  --no-codex \
  --no-distill-hook \
  --no-onboarding \
  --no-workspace \
  --no-cost-tracking \
  --yes

"$repo_bin" doctor --no-workspace --format json >"$workdir/doctor.json"
"$repo_bin" status --no-workspace --format json >"$workdir/status.json"
"$repo_bin" doc-drift --no-workspace --min-confidence 0.90 --format json >"$workdir/doc-drift.json"

REPOWISE_EXPECTED_VERSION="$expected_version" python3 - "$workdir/doctor.json" "$workdir/status.json" "$workdir/doc-drift.json" "$baseline" <<'PY'
import json
import os
import sys
from collections import Counter


def load(path: str) -> dict:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


doctor_path, status_path, drift_path, baseline_path = sys.argv[1:]
doctor = load(doctor_path)
status = load(status_path)
drift = load(drift_path)
baseline = load(baseline_path)

if not doctor.get("ok"):
    print("verify-repowise: doctor failed", file=sys.stderr)
    for check in doctor.get("checks", []):
        if not check.get("ok"):
            print(f"  - {check.get('name')}: {check.get('detail')}", file=sys.stderr)
    raise SystemExit(1)

expected_commit = __import__("subprocess").check_output(
    ["git", "rev-parse", "HEAD"], text=True
).strip()
indexed_commit = status.get("state", {}).get("last_sync_commit")
if indexed_commit != expected_commit:
    print(
        "verify-repowise: index commit does not match HEAD "
        f"({indexed_commit or 'missing'} != {expected_commit})",
        file=sys.stderr,
    )
    raise SystemExit(1)

if baseline.get("version") != 1:
    print("verify-repowise: unsupported baseline version", file=sys.stderr)
    raise SystemExit(1)


def key(row: dict) -> tuple[str, str, str]:
    return (row["file_path"], row["kind"], row["target"])


ignored_prefixes = tuple(baseline.get("excluded_prefixes", []))
current = Counter(
    key(row)
    for row in drift.get("findings", [])
    if not row["file_path"].startswith(ignored_prefixes)
)
expected = Counter()
for row in baseline.get("findings", []):
    expected[(row["file_path"], row["kind"], row["target"])] = row.get("count", 1)

new_findings = []
for item, count in sorted(current.items()):
    if count > expected.get(item, 0):
        new_findings.append((item, count - expected.get(item, 0)))

stale_baseline = []
for item, count in sorted(expected.items()):
    if current.get(item, 0) < count:
        stale_baseline.append((item, count - current.get(item, 0)))

if new_findings or stale_baseline:
    print("verify-repowise: drift baseline changed", file=sys.stderr)
    if new_findings:
        print("new findings:", file=sys.stderr)
        for (path, kind, target), count in new_findings:
            print(f"  +{count} {path} [{kind}] {target}", file=sys.stderr)
    if stale_baseline:
        print("fixed baseline entries (remove them from the baseline):", file=sys.stderr)
        for (path, kind, target), count in stale_baseline:
            print(f"  -{count} {path} [{kind}] {target}", file=sys.stderr)
    raise SystemExit(1)

ignored = sum(
    1
    for row in drift.get("findings", [])
    if row["file_path"].startswith(ignored_prefixes)
)
print(
    "verify-repowise: green "
    f"version={os.environ['REPOWISE_EXPECTED_VERSION']} mode={status.get('index_scope', {}).get('run_mode')} "
    f"commit={expected_commit[:12]} drift={sum(current.values())} "
    f"baseline={sum(expected.values())} ignored={ignored}"
)
PY
