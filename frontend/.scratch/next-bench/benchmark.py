#!/usr/bin/env python3
"""Measure prepared sibling directories named stable/ and canary.

Each directory must contain the same consumer-next source and an installed
dependency tree; only the Next.js version may differ.
"""

import gzip
import json
import shutil
import statistics
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ROUNDS = 6
results = {"rounds": ROUNDS, "runs": []}


def directory_bytes(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file()) if path.exists() else 0


def run(kind: str, phase: str, round_number: int) -> None:
    directory = ROOT / kind
    if phase == "cold":
        shutil.rmtree(directory / ".next", ignore_errors=True)
    command = [shutil.which("node"), "node_modules/next/dist/bin/next", "build"]
    started = time.perf_counter()
    process = subprocess.run(
        command,
        cwd=directory,
        env={**__import__("os").environ, "NEXT_TELEMETRY_DISABLED": "1"},
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    elapsed = time.perf_counter() - started
    item = {
        "kind": kind,
        "phase": phase,
        "round": round_number,
        "rc": process.returncode,
        "wall_seconds": elapsed,
    }
    results["runs"].append(item)
    (ROOT / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    (ROOT / f"{phase}-{round_number}-{kind}.stdout.log").write_text(process.stdout)
    (ROOT / f"{phase}-{round_number}-{kind}.stderr.log").write_text(process.stderr)
    print(f"{phase}-{round_number}-{kind}: rc={process.returncode} wall={elapsed:.3f}s", flush=True)
    if process.returncode:
        print("\n".join((process.stdout + process.stderr).splitlines()[-100:]), flush=True)
        raise SystemExit(process.returncode)


for round_number in range(1, ROUNDS + 1):
    order = ["stable", "canary"] if round_number % 2 else ["canary", "stable"]
    for kind in order:
        run(kind, "cold", round_number)
        run(kind, "warm", round_number)

summary = {}
for kind in ["stable", "canary"]:
    summary[kind] = {}
    for phase in ["cold", "warm"]:
        selected = [run for run in results["runs"] if run["kind"] == kind and run["phase"] == phase]
        summary[kind][phase] = {
            "wall_seconds": [run["wall_seconds"] for run in selected],
            "wall_median": statistics.median(run["wall_seconds"] for run in selected),
        }
    directory = ROOT / kind / ".next"
    chunks = list((directory / "static/chunks").rglob("*.js"))
    summary[kind]["artifacts"] = {
        "client_js_raw_bytes": sum(path.stat().st_size for path in chunks),
        "client_js_gzip_bytes": sum(len(gzip.compress(path.read_bytes(), compresslevel=9)) for path in chunks),
        "client_js_files": len(chunks),
        "cache_bytes": directory_bytes(directory / "cache"),
        "standalone_bytes": directory_bytes(directory / "standalone"),
        "total_next_bytes": directory_bytes(directory),
    }
results["summary"] = summary
(ROOT / "results.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps(summary, indent=2), flush=True)
