#!/usr/bin/env python3
"""Compare two TypeScript CLIs against unchanged, real workspace sources."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import statistics
import subprocess
import time


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def source_snapshot(root):
    files = {root / name for name in ["pnpm-lock.yaml", "pnpm-workspace.yaml"]}
    for name in ["apps/consumer", "apps/merchant", "packages"]:
        for current, directories, names in os.walk(root / name):
            directories[:] = [
                value for value in directories
                if value not in {"node_modules", ".git", ".next", "dist", "coverage"}
            ]
            for filename in names:
                if Path(filename).suffix in {".ts", ".tsx", ".js", ".jsx", ".json", ".mjs"}:
                    files.add(Path(current) / filename)
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(files) if path.is_file()
    }


def describe(values):
    return {
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
        "stdev": statistics.stdev(values),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--stable", type=Path, required=True)
    parser.add_argument("--nightly", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--rounds", type=int, default=6)
    args = parser.parse_args()
    root = args.root.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    node = shutil.which("node")
    compilers = {"stable": args.stable.resolve(), "nightly": args.nightly.resolve()}
    environment = os.environ | {"NO_COLOR": "1", "TMPDIR": str(output)}
    before = source_snapshot(root)
    result = {
        "date": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "platform": platform.platform(),
        "node": subprocess.check_output([node, "--version"], text=True).strip(),
        "rounds": args.rounds,
        "source_snapshot": before,
        "compilers": {},
        "runs": [],
    }

    def save():
        (output / "results.json").write_text(json.dumps(result, indent=2) + "\n")

    for label, compiler in compilers.items():
        manifest = json.loads((compiler.parent.parent / "package.json").read_text())
        version = subprocess.run([node, str(compiler), "--version"], cwd=root,
                                 env=environment, text=True, capture_output=True)
        canary = subprocess.run([node, str(compiler), "--ecommerce-invalid-option"],
                                cwd=root, env=environment, text=True, capture_output=True)
        result["compilers"][label] = {
            "entry": str(compiler), "version": manifest["version"],
            "gitHead": manifest.get("gitHead"), "version_rc": version.returncode,
            "version_output": version.stdout.strip(), "invalid_option_rc": canary.returncode,
            "invalid_option_output": (canary.stdout + canary.stderr).strip(),
        }
        save()
        if version.returncode != 0 or manifest["version"] not in version.stdout or canary.returncode == 0:
            raise RuntimeError(f"CLI execution proof failed for {label}")

    def run(label, app, phase, round_number):
        command = [node, str(compilers[label]), "--project", str(root / "apps" / app / "tsconfig.json"),
                   "--noEmit", "--incremental", "false", "--pretty", "false"]
        started = time.perf_counter()
        process = subprocess.run(["/usr/bin/time", "-l", *command], cwd=root, env=environment,
                                 text=True, capture_output=True)
        elapsed = time.perf_counter() - started
        timing = re.search(r"^\s*[0-9.]+\s+real\s+[0-9.]+\s+user\s+[0-9.]+\s+sys.*$",
                           process.stderr, flags=re.MULTILINE)
        rss = re.search(r"^\s*(\d+)\s+maximum resident set size\s*$", process.stderr,
                        flags=re.MULTILINE)
        if not timing or not rss:
            raise RuntimeError(f"Unrecognized time output: {process.stderr}")
        diagnostics = (process.stdout + process.stderr[:timing.start()]).strip()
        run_id = f"{phase}-{round_number}-{label}-{app}"
        (output / f"{run_id}.stdout.txt").write_text(process.stdout)
        (output / f"{run_id}.stderr.txt").write_text(process.stderr)
        item = {
            "id": run_id, "phase": phase, "round": round_number, "compiler": label,
            "app": app, "command": command, "rc": process.returncode,
            "wall_seconds": elapsed, "max_rss_bytes": int(rss.group(1)),
            "diagnostics_sha256": digest(diagnostics), "diagnostics": diagnostics,
        }
        result["runs"].append(item)
        save()
        print(f"{run_id}: rc={item['rc']} wall={elapsed:.4f}s rss={item['max_rss_bytes']/2**20:.1f}MiB", flush=True)
        if process.returncode != 0 or diagnostics:
            raise RuntimeError(f"Typecheck failed; do not interpret failed-run timings: {diagnostics}")

    for label in compilers:
        for app in ["consumer", "merchant"]:
            run(label, app, "warmup", 0)

    for round_number in range(1, args.rounds + 1):
        order = ["stable", "nightly"] if round_number % 2 else ["nightly", "stable"]
        for label in order:
            for app in ["consumer", "merchant"]:
                run(label, app, "measured", round_number)

    result["source_unchanged"] = before == source_snapshot(root)
    result["diagnostics_identical"] = len({row["diagnostics_sha256"] for row in result["runs"]}) == 1
    summary = {}
    for app in ["consumer", "merchant"]:
        summary[app] = {}
        for label in compilers:
            selected = [row for row in result["runs"]
                        if row["phase"] == "measured" and row["app"] == app and row["compiler"] == label]
            summary[app][label] = {
                "wall_seconds": describe([row["wall_seconds"] for row in selected]),
                "rss_mib": describe([row["max_rss_bytes"] / 2**20 for row in selected]),
            }
    result["summary"] = summary
    save()
    if not result["source_unchanged"] or not result["diagnostics_identical"]:
        raise RuntimeError("Input snapshot or diagnostics changed during the experiment")
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
