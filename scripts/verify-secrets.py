#!/usr/bin/env python3
"""Fast working-tree credential tripwire for commit-time verification.

This intentionally scans configuration-like files only. It complements, but does
not replace, a history-aware scanner such as gitleaks in CI.
"""

from __future__ import annotations

import math
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

SCANNED_SUFFIXES = {
    ".conf",
    ".env",
    ".ini",
    ".json",
    ".properties",
    ".toml",
    ".yaml",
    ".yml",
}
SKIPPED_NAMES = {"package-lock.json", "pnpm-lock.yaml"}
SKIPPED_PARTS = {".git", "node_modules", "vendor"}
SKIPPED_PREFIXES = {"frontend/packages/i18n/src/locales/"}

ASSIGNMENT = re.compile(
    r"^\s*[\"']?([A-Za-z0-9_.-]*(?:password|passwd|pwd|token|api[_-]?key|client[_-]?secret|service[_-]?token|private[_-]?key))[\"']?\s*[:=]\s*(.*?)\s*$",
    re.IGNORECASE,
)
JWT = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")
PRIVATE_KEY = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")
KNOWN_TOKEN = re.compile(
    r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_(?:live|test)_[A-Za-z0-9]{12,})\b"
)

PLACEHOLDERS = {
    "changeme",
    "client_secret",
    "dummy",
    "example",
    "password",
    "placeholder",
    "postgres",
    "secret",
    "token",
    "username",
    "xxx",
}


def candidate_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        check=True,
        stdout=subprocess.PIPE,
    )
    paths: list[Path] = []
    for raw in result.stdout.split(b"\0"):
        if not raw:
            continue
        path = Path(raw.decode("utf-8", errors="surrogateescape"))
        if path.name in SKIPPED_NAMES or any(part in SKIPPED_PARTS for part in path.parts):
            continue
        if any(path.as_posix().startswith(prefix) for prefix in SKIPPED_PREFIXES):
            continue
        if path.suffix.lower() not in SCANNED_SUFFIXES:
            continue
        paths.append(path)
    return paths


def normalized_value(raw: str) -> str:
    value = raw.strip().rstrip(",;").strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1].strip()
    return value


def is_placeholder(key: str, value: str) -> bool:
    lower = value.lower()
    leaf = re.split(r"[_.-]", key.lower())[-1]
    if not value or lower in PLACEHOLDERS or lower == key.lower() or lower == leaf:
        return True
    if lower in {"null", "none", "true", "false"} or lower.isdigit():
        return True
    if value.startswith(("${", "$(", "{{", "<")) or value.endswith("}}"):
        return True
    if lower.startswith(("env:", "file:", "secret:", "vault:")):
        return True
    if any(marker in lower for marker in ("secretkeyref", "valuefrom", "replace-me", "your-", "-here")):
        return True
    return False


def entropy(value: str) -> float:
    counts = Counter(value)
    length = len(value)
    return -sum((count / length) * math.log2(count / length) for count in counts.values())


def suspicious_assignment(key: str, value: str) -> bool:
    if is_placeholder(key, value):
        return False
    lower_key = key.lower()
    if any(word in lower_key for word in ("password", "passwd", "pwd")):
        return len(value) >= 4
    return len(value) >= 12 and entropy(value) >= 3.0


def scan(path: Path) -> list[tuple[int, str]]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []

    findings: list[tuple[int, str]] = []
    for line_number, line in enumerate(text.splitlines(), 1):
        if PRIVATE_KEY.search(line):
            findings.append((line_number, "private-key"))
            continue
        if JWT.search(line):
            findings.append((line_number, "jwt"))
            continue
        if KNOWN_TOKEN.search(line):
            findings.append((line_number, "known-token"))
            continue
        if line.lstrip().startswith(("#", "//")):
            continue
        match = ASSIGNMENT.match(line)
        if not match:
            continue
        key, raw_value = match.groups()
        value = normalized_value(raw_value)
        if suspicious_assignment(key, value):
            findings.append((line_number, key))
    return findings


def self_test() -> None:
    blocked = {
        "password": "weak-pass",
        "database.password": "abcdef",
        "api_key": "sk_live_0123456789abcdef",
        "token": "A9sK2mP4qR7vX1zB",
    }
    allowed = {
        "password": "password",
        "client_secret": "client_secret",
        "token": "${VAULT_TOKEN}",
        "database.password": "${env:DB_PASSWORD}",
        "api_key": "",
    }
    for key, value in blocked.items():
        if not suspicious_assignment(key, value):
            raise AssertionError(f"scanner missed synthetic {key}")
    for key, value in allowed.items():
        if suspicious_assignment(key, value):
            raise AssertionError(f"scanner rejected placeholder {key}")


def main() -> int:
    self_test()
    findings: list[tuple[Path, int, str]] = []
    for path in candidate_files():
        findings.extend((path, line, kind) for line, kind in scan(path))
    if not findings:
        print("verify-secrets: OK (tracked/unignored config files)")
        return 0

    print("verify-secrets: plaintext credential candidates found:", file=sys.stderr)
    for path, line, kind in findings:
        print(f"  {path}:{line}:{kind}", file=sys.stderr)
    print("Values are redacted. Move credentials to a secret store or local ignored config.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
