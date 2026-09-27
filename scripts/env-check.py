#!/usr/bin/env python3
"""Bounded, read-only environment evidence; --check verifies the offline toolchain projection.

Incident (2026-09-26): local-env described OTLP as both wired and unwired, and
TODO claimed an empty namespace while Deployments existed. Do not persist a
second inventory: defaults are local-only, live queries are explicit, and failed
queries are UNKNOWN, never absence. No Secret/config payload or raw stderr is emitted.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BEGIN = "<!-- env-check:toolchain -->"
END = "<!-- /env-check:toolchain -->"


def requirements(root):
    package = json.loads((root / "frontend/package.json").read_text())
    go = re.search(r"^go (\S+)$", (root / "backend/go.mod").read_text(), re.M)
    if not go:
        raise ValueError("backend/go.mod lacks a go directive")
    return {"go": go[1], "node": package["engines"]["node"], "packageManager": package["packageManager"]}


def requirements_block(root):
    return BEGIN + "\n```json\n" + json.dumps(requirements(root), indent=2, ensure_ascii=False) + "\n```\n" + END


def check_document(text, expected):
    if text.count(BEGIN) != 1 or text.count(END) != 1:
        return ["local-env.md must contain exactly one toolchain projection"]
    actual = text[text.index(BEGIN):text.index(END) + len(END)]
    return [] if actual == expected else ["local-env.md toolchain drift; regenerate with --print-contract"]


def probe(command, decode, environment=None):
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=10, cwd=ROOT, env=environment)
        if result.returncode:
            return {"status": "unknown", "reason": "command_failed", "exit_code": result.returncode}
        return {"status": "observed", "data": decode(result.stdout)}
    except subprocess.TimeoutExpired:
        return {"status": "unknown", "reason": "timeout"}
    except OSError:
        return {"status": "unknown", "reason": "tool_unavailable"}
    except (ValueError, KeyError, TypeError, AttributeError):
        return {"status": "unknown", "reason": "unrecognized_response"}


def items(raw):
    rows = json.loads(raw)["items"]
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise ValueError("expected a Kubernetes list")
    return rows


def identity(obj):
    meta = obj["metadata"]
    return {"kind": obj.get("kind", ""), "namespace": meta.get("namespace", ""), "name": meta["name"]}


def workloads(raw):
    result = []
    for obj in items(raw):
        spec, status = obj.get("spec", {}), obj.get("status", {})
        result.append({**identity(obj),
                       "desired": spec.get("replicas", status.get("desiredNumberScheduled")),
                       "ready": status.get("readyReplicas", status.get("numberReady", 0)),
                       "reconciled": (status.get("observedGeneration", -1) >= obj["metadata"].get("generation", 0))})
    return result


def nodes(raw):
    return [{**identity(obj), "architecture": obj["status"]["nodeInfo"]["architecture"],
             "os": obj["status"]["nodeInfo"]["osImage"], "kubelet": obj["status"]["nodeInfo"]["kubeletVersion"],
             "conditions": {c["type"]: c["status"] for c in obj["status"].get("conditions", [])
                            if c["type"] in ("Ready", "MemoryPressure", "DiskPressure", "PIDPressure")}}
            for obj in items(raw)]


def control_plane(raw):
    result = []
    for obj in items(raw):
        if not obj["metadata"]["name"].startswith(("kube-apiserver-", "kube-scheduler-", "kube-controller-manager-", "etcd-")):
            continue
        containers = obj.get("status", {}).get("containerStatuses", [])
        result.append({**identity(obj), "ready": bool(containers) and all(c.get("ready") for c in containers),
                       "restarts": sum(c.get("restartCount", 0) for c in containers)})
    return result


def gitops(raw):
    result = []
    for obj in items(raw):
        automated = obj.get("spec", {}).get("syncPolicy", {}).get("automated")
        # An empty automated map enables sync; explicit enabled:false disables it.
        result.append({**identity(obj), "sync": obj.get("status", {}).get("sync", {}).get("status"),
                       "health": obj.get("status", {}).get("health", {}).get("status"),
                       "automated": isinstance(automated, dict) and automated.get("enabled") is not False})
    return result


def routes(raw):
    return [{**identity(obj), "hostnames": obj.get("spec", {}).get("hostnames", []),
             "parent_conditions": [{c["type"]: c["status"] for c in parent.get("conditions", [])}
                                   for parent in obj.get("status", {}).get("parents", [])]}
            for obj in items(raw)]


def local():
    # Version wrappers may download toolchains; a read-only local probe must not.
    environment = {**os.environ, "GOTOOLCHAIN": "local", "COREPACK_ENABLE_NETWORK": "0",
                   "COREPACK_ENABLE_PROJECT_SPEC": "0"}
    return {"platform": {"status": "observed", "data": {"os": platform.system(), "release": platform.release(),
            "architecture": platform.machine(), "python": platform.python_version()}},
            "requirements": {"status": "observed", "data": requirements(ROOT)},
            **{tool: probe(command, lambda text: text.strip(), environment) for tool, command in (
                ("go", ["go", "version"]), ("node", ["node", "--version"]),
                ("pnpm", ["pnpm", "--version"]), ("revision", ["git", "rev-parse", "HEAD"]))}}


def collect(section, context, namespace):
    if section == "local":
        return local()
    # Resolve once, then bind every read to it; never mutate current-context.
    selected = {"status": "observed", "data": context} if context else probe(
        ["kubectl", "config", "current-context"], lambda text: text.strip())
    if selected["status"] != "observed" or not selected.get("data"):
        return {"context": {"status": "unknown", "reason": "no_context"}}
    prefix = ["kubectl", "--context", selected["data"], "--request-timeout=8s"]
    definitions = {
        "cluster": [("nodes", ["get", "nodes", "-o", "json"], nodes),
                    ("control_plane", ["get", "pods", "-n", "kube-system", "-o", "json"], control_plane),
                    ("workloads", ["get", "deployments,statefulsets,daemonsets", "-n", namespace, "-o", "json"], workloads)],
        "gitops": [("gitops", ["get", "applications,applicationsets", "-n", "argocd", "-o", "json"], gitops)],
        "observability": [("workloads", ["get", "deployments,statefulsets,daemonsets", "-A", "-o", "json"],
                           lambda raw: [row for row in workloads(raw) if row["namespace"] in
                                        ("logging", "observability", "victoriametrics", "opentelemetry", "ops")])],
        "routes": [("routes", ["get", "httproutes,tlsroutes,tcproutes", "-A", "-o", "json"], routes)],
    }
    return {"context": selected, **{name: probe(prefix + command, decode)
                                   for name, command, decode in definitions[section]}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--check", action="store_true", help="offline: verify local-env toolchain projection")
    modes.add_argument("--print-contract", action="store_true", help="print generated block, do not write files")
    parser.add_argument("--section", choices=("local", "cluster", "gitops", "observability", "routes"), default="local")
    parser.add_argument("--context", default="", help="exact kube context (default: resolve current once)")
    parser.add_argument("--namespace", default="ecommerce")
    args = parser.parse_args()
    if args.print_contract:
        print(requirements_block(ROOT))
        return 0
    if args.check:
        errors = check_document((ROOT / "context/team/local-env.md").read_text(), requirements_block(ROOT))
        print("\n".join(errors) if errors else "env-check: toolchain projection OK (offline; no live claims verified)")
        return int(bool(errors))
    report = {"schema_version": 1, "observed_at": datetime.now(timezone.utc).isoformat(),
              "section": args.section, "namespace": args.namespace, "cached": False,
              "meaning": "point-in-time evidence, not sustained health or business acceptance",
              "checks": collect(args.section, args.context, args.namespace)}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if any(check["status"] == "unknown" for check in report["checks"].values()) else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError) as error:
        print("env-check: invalid local contract (" + type(error).__name__ + ")", file=sys.stderr)
        sys.exit(2)
