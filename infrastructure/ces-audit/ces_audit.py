#!/usr/bin/env python3
"""Audit CiliumEndpoint and CiliumEndpointSlice IP consistency."""

from __future__ import annotations

import argparse
import json
import os
import ssl
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

CEP_API_PATH = "/apis/cilium.io/v2/ciliumendpoints"
CES_API_PATH = "/apis/cilium.io/v2alpha1/ciliumendpointslices"
SERVICE_ACCOUNT_DIR = Path("/var/run/secrets/kubernetes.io/serviceaccount")


@dataclass(frozen=True, order=True)
class AuditIssue:
    kind: str
    slice_name: str = "-"
    namespace: str = "-"
    endpoint_name: str = "-"
    pod_uid: str = "-"
    cep_ips: str = "-"
    ces_ips: str = "-"

    def render(self) -> str:
        fields = (
            ("kind", self.kind),
            ("slice", self.slice_name),
            ("namespace", self.namespace),
            ("endpoint", self.endpoint_name),
            ("pod_uid", self.pod_uid),
            ("cep_ips", self.cep_ips),
            ("ces_ips", self.ces_ips),
        )
        return " ".join(f"{key}={value}" for key, value in fields)


def _addresses(value: dict[str, Any], networking_key: str) -> tuple[str, ...]:
    networking = value.get(networking_key, {}).get("addressing", []) or []
    addresses = {
        address[family]
        for address in networking
        for family in ("ipv4", "ipv6")
        if address.get(family)
    }
    return tuple(sorted(addresses))


def _pod_uid(cep: dict[str, Any]) -> str | None:
    for owner in cep.get("metadata", {}).get("ownerReferences", []) or []:
        if owner.get("kind") == "Pod" and owner.get("uid"):
            return str(owner["uid"])
    return None


def audit(cep_list: dict[str, Any], ces_list: dict[str, Any]) -> list[AuditIssue]:
    issues: list[AuditIssue] = []
    cep_by_uid: dict[str, dict[str, Any]] = {}

    for cep in cep_list.get("items", []) or []:
        metadata = cep.get("metadata", {})
        namespace = str(metadata.get("namespace", "-"))
        name = str(metadata.get("name", "-"))
        uid = _pod_uid(cep)
        ips = _addresses(cep.get("status", {}), "networking")
        if not uid:
            issues.append(
                AuditIssue(
                    kind="cep_missing_pod_uid",
                    namespace=namespace,
                    endpoint_name=name,
                    cep_ips=",".join(ips) or "-",
                )
            )
            continue
        if uid in cep_by_uid:
            previous = cep_by_uid[uid].get("metadata", {})
            issues.append(
                AuditIssue(
                    kind="duplicate_cep_pod_uid",
                    namespace=namespace,
                    endpoint_name=name,
                    pod_uid=uid,
                    cep_ips=",".join(ips) or "-",
                    ces_ips=f"first={previous.get('namespace', '-')}/{previous.get('name', '-')}",
                )
            )
            continue
        cep_by_uid[uid] = cep

    seen_ces_uids: set[str] = set()
    for ces in ces_list.get("items", []) or []:
        slice_name = str(ces.get("metadata", {}).get("name", "-"))
        for endpoint in ces.get("endpoints", []) or []:
            endpoint_name = str(endpoint.get("name", "-"))
            uid = endpoint.get("pod-uid")
            ces_ips = _addresses(endpoint, "networking")
            if not uid:
                issues.append(
                    AuditIssue(
                        kind="ces_missing_pod_uid",
                        slice_name=slice_name,
                        endpoint_name=endpoint_name,
                        ces_ips=",".join(ces_ips) or "-",
                    )
                )
                continue
            uid = str(uid)
            if uid in seen_ces_uids:
                issues.append(
                    AuditIssue(
                        kind="duplicate_ces_endpoint",
                        slice_name=slice_name,
                        endpoint_name=endpoint_name,
                        pod_uid=uid,
                        ces_ips=",".join(ces_ips) or "-",
                    )
                )
                continue
            seen_ces_uids.add(uid)

            cep = cep_by_uid.get(uid)
            if cep is None:
                issues.append(
                    AuditIssue(
                        kind="orphan_ces_endpoint",
                        slice_name=slice_name,
                        endpoint_name=endpoint_name,
                        pod_uid=uid,
                        ces_ips=",".join(ces_ips) or "-",
                    )
                )
                continue

            metadata = cep.get("metadata", {})
            cep_ips = _addresses(cep.get("status", {}), "networking")
            if cep_ips != ces_ips:
                issues.append(
                    AuditIssue(
                        kind="ip_mismatch",
                        slice_name=slice_name,
                        namespace=str(metadata.get("namespace", "-")),
                        endpoint_name=str(metadata.get("name", endpoint_name)),
                        pod_uid=uid,
                        cep_ips=",".join(cep_ips) or "-",
                        ces_ips=",".join(ces_ips) or "-",
                    )
                )

    for uid, cep in cep_by_uid.items():
        if uid in seen_ces_uids:
            continue
        metadata = cep.get("metadata", {})
        cep_ips = _addresses(cep.get("status", {}), "networking")
        issues.append(
            AuditIssue(
                kind="missing_ces_endpoint",
                namespace=str(metadata.get("namespace", "-")),
                endpoint_name=str(metadata.get("name", "-")),
                pod_uid=uid,
                cep_ips=",".join(cep_ips) or "-",
            )
        )

    return sorted(issues)


def _load_json_file(path: str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as source:
        return json.load(source)


def _kubectl_list(resource: str) -> dict[str, Any]:
    command = ["kubectl", "get", resource]
    if resource == "ciliumendpoints":
        command.append("-A")
    command.extend(("-o", "json"))
    result = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"kubectl get {resource} failed")
    return json.loads(result.stdout)


def _kubernetes_api_list(path: str, timeout: float) -> dict[str, Any]:
    host = os.environ["KUBERNETES_SERVICE_HOST"]
    port = os.environ.get("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    token = (SERVICE_ACCOUNT_DIR / "token").read_text(encoding="utf-8").strip()
    context = ssl.create_default_context(cafile=str(SERVICE_ACCOUNT_DIR / "ca.crt"))
    request = urllib.request.Request(
        f"https://{host}:{port}{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
        return json.load(response)


def load_inputs(args: argparse.Namespace) -> tuple[dict[str, Any], dict[str, Any]]:
    if bool(args.cep_json) != bool(args.ces_json):
        raise ValueError("--cep-json and --ces-json must be provided together")
    if args.cep_json:
        return _load_json_file(args.cep_json), _load_json_file(args.ces_json)
    if os.environ.get("KUBERNETES_SERVICE_HOST"):
        return (
            _kubernetes_api_list(CEP_API_PATH, args.timeout),
            _kubernetes_api_list(CES_API_PATH, args.timeout),
        )
    return _kubectl_list("ciliumendpoints"), _kubectl_list("ciliumendpointslices")


def _label_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')


def push_metrics(
    url: str,
    cluster: str,
    source: str,
    timestamp_ms: int,
    audit_success: int,
    stale_entries: int | None,
    timeout: float,
) -> None:
    labels = f'cluster="{_label_value(cluster)}",source="{_label_value(source)}"'
    lines = [
        f"ces_audit_success{{{labels}}} {audit_success} {timestamp_ms}",
        f"ces_audit_last_run_timestamp_seconds{{{labels}}} {timestamp_ms // 1000} {timestamp_ms}",
    ]
    if stale_entries is not None:
        lines.append(f"ces_stale_entries{{{labels}}} {stale_entries} {timestamp_ms}")
    request = urllib.request.Request(
        url,
        data=("\n".join(lines) + "\n").encode(),
        headers={"Content-Type": "text/plain; version=0.0.4"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status not in (200, 204):
            raise RuntimeError(f"metrics import returned HTTP {response.status}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cep-json", help="read CiliumEndpoint List JSON from this file")
    parser.add_argument("--ces-json", help="read CiliumEndpointSlice List JSON from this file")
    parser.add_argument("--metrics-url", default=os.environ.get("CES_METRICS_URL"))
    parser.add_argument("--cluster", default=os.environ.get("CLUSTER_NAME", "ecommerce-dev"))
    parser.add_argument("--source", default=os.environ.get("CES_AUDIT_SOURCE", "manual"))
    parser.add_argument("--timeout", type=float, default=10.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    timestamp_ms = int(time.time() * 1000)
    try:
        cep_list, ces_list = load_inputs(args)
        issues = audit(cep_list, ces_list)
    except Exception as error:  # Report collection errors without hiding the original reason.
        print(f"CES audit failed: {error}", file=sys.stderr)
        if args.metrics_url:
            try:
                push_metrics(
                    args.metrics_url,
                    args.cluster,
                    args.source,
                    timestamp_ms,
                    audit_success=0,
                    stale_entries=None,
                    timeout=args.timeout,
                )
            except Exception as push_error:
                print(f"metrics push failed: {push_error}", file=sys.stderr)
        return 2

    print(
        f"CEP entries={len(cep_list.get('items', []) or [])} "
        f"CES slices={len(ces_list.get('items', []) or [])} "
        f"CES endpoints={sum(len(item.get('endpoints', []) or []) for item in ces_list.get('items', []) or [])}"
    )
    if issues:
        print(f"CES audit STALE: stale_entries={len(issues)}")
        for issue in issues:
            print(issue.render())
    else:
        print("CES audit OK: stale_entries=0")

    if args.metrics_url:
        try:
            push_metrics(
                args.metrics_url,
                args.cluster,
                args.source,
                timestamp_ms,
                audit_success=1,
                stale_entries=len(issues),
                timeout=args.timeout,
            )
            print(f"metrics pushed: {args.metrics_url}")
        except Exception as error:
            print(f"metrics push failed: {error}", file=sys.stderr)
            return 2
    return 1 if issues else 0


if __name__ == "__main__":
    sys.exit(main())
