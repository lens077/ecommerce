#!/usr/bin/env python3
"""Reject globally routable IP literals in the worktree, index, or Git history."""

from __future__ import annotations

import argparse
import ipaddress
import re
import subprocess
import sys
from pathlib import Path

IPV4 = re.compile(r"(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])")
IPV6 = re.compile(
    r"(?<![0-9A-Za-z])(?:[0-9A-Fa-f]{0,4}:){2,}[0-9A-Fa-f:]{0,4}(?![0-9A-Za-z])"
)


def git(*args: str, input_data: bytes | None = None) -> bytes:
    return subprocess.run(
        ["git", *args], input=input_data, stdout=subprocess.PIPE, check=True
    ).stdout


def is_version_literal(line: str, literal: str) -> bool:
    """Do not confuse four-component product versions with IPv4 addresses."""
    version = re.compile(
        rf"\b(?:version|fileversion|productversion)\s*[:=]\s*[\"']?{re.escape(literal)}\b",
        re.IGNORECASE,
    )
    return version.search(line) is not None


def findings(label: str, data: bytes) -> list[tuple[str, int, str]]:
    if b"\0" in data[:8192]:
        return []
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return []

    result: list[tuple[str, int, str]] = []
    for line_number, line in enumerate(text.splitlines(), 1):
        candidates = [(raw, 4) for raw in IPV4.findall(line)]
        candidates.extend((raw, 6) for raw in IPV6.findall(line))
        for raw, version in candidates:
            try:
                address = ipaddress.ip_address(raw)
            except ValueError:
                continue
            if not address.is_global:
                continue
            if version == 4 and is_version_literal(line, raw):
                continue
            result.append((label, line_number, f"public-ipv{version}"))
    return result


def worktree_files() -> list[tuple[str, bytes]]:
    names = git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
    result: list[tuple[str, bytes]] = []
    for raw in names.split(b"\0"):
        if not raw:
            continue
        name = raw.decode("utf-8", errors="surrogateescape")
        path = Path(name)
        if not path.is_file():
            continue
        try:
            result.append((name, path.read_bytes()))
        except OSError:
            continue
    return result


def staged_files() -> list[tuple[str, bytes]]:
    names = git(
        "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"
    )
    result: list[tuple[str, bytes]] = []
    for raw in names.split(b"\0"):
        if not raw:
            continue
        name = raw.decode("utf-8", errors="surrogateescape")
        blob = subprocess.run(
            ["git", "show", f":{name}"], stdout=subprocess.PIPE, check=True
        ).stdout
        result.append((name, blob))
    return result


def history_objects() -> list[tuple[str, bytes]]:
    objects: dict[str, str] = {}
    for raw in git("rev-list", "--objects", "--all").decode(
        "utf-8", errors="replace"
    ).splitlines():
        object_id, _, path = raw.partition(" ")
        objects.setdefault(object_id, path or f"object:{object_id[:12]}")

    process = subprocess.Popen(
        ["git", "cat-file", "--batch"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
    )
    assert process.stdin is not None and process.stdout is not None
    result: list[tuple[str, bytes]] = []
    for object_id, label in objects.items():
        process.stdin.write(f"{object_id}\n".encode())
        process.stdin.flush()
        header = process.stdout.readline().split()
        if len(header) != 3:
            raise RuntimeError(f"unexpected git cat-file response for {object_id}")
        size = int(header[2])
        data = process.stdout.read(size)
        if process.stdout.read(1) != b"\n":
            raise RuntimeError(f"truncated git object {object_id}")
        result.append((f"{label}@{object_id[:12]}", data))
    process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError("git cat-file failed")
    return result


def self_test() -> None:
    public_v4 = "93.184." + "216.34"
    public_v6 = "2606:4700:" + ":1111"
    if not findings("synthetic", f"host={public_v4}\n".encode()):
        raise AssertionError("scanner missed a synthetic public IPv4 address")
    if not findings("synthetic", f"host={public_v6}\n".encode()):
        raise AssertionError("scanner missed a synthetic public IPv6 address")
    version = "6.0." + "0.0"
    allowed = f'host=192.0.2.1\nhost=2001:db8::1\nversion="{version}"\n'.encode()
    if findings("synthetic", allowed):
        raise AssertionError("scanner rejected documentation ranges or a version")


def main() -> int:
    parser = argparse.ArgumentParser()
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--staged", action="store_true")
    scope.add_argument("--history", action="store_true")
    args = parser.parse_args()

    self_test()
    if args.staged:
        inputs = staged_files()
        scope_name = "staged files"
    elif args.history:
        inputs = history_objects()
        scope_name = "reachable Git history"
    else:
        inputs = worktree_files()
        scope_name = "tracked and unignored worktree files"

    matches: list[tuple[str, int, str]] = []
    for label, data in inputs:
        matches.extend(findings(label, data))
    if not matches:
        print(f"verify-public-ips: OK ({scope_name})")
        return 0

    print(
        f"verify-public-ips: globally routable IP literals found in {scope_name}:",
        file=sys.stderr,
    )
    for label, line, kind in matches:
        print(f"  {label}:{line}:{kind}", file=sys.stderr)
    print(
        "Values are redacted. Use SSH inventory aliases in prose and inject runtime addresses.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
