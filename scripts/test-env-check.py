#!/usr/bin/env python3
"""Offline regression tests: environment observations must never become silent success."""
import importlib.util
import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("env_check", Path(__file__).with_name("env-check.py"))
env = importlib.util.module_from_spec(spec)
spec.loader.exec_module(env)


class EnvironmentTests(unittest.TestCase):
    def test_required_versions_are_a_checked_projection_not_handwritten_inventory(self):
        block = env.requirements_block(env.ROOT)
        self.assertIn('"packageManager": "pnpm@', block)
        self.assertEqual(env.check_document(block, block), [])
        self.assertTrue(env.check_document(block.replace('pnpm@', 'npm@'), block))
        self.assertTrue(env.check_document("missing block", block))
        self.assertTrue(env.check_document(block + block, block))

    def test_failed_probe_does_not_echo_credentials_or_claim_absence(self):
        response = subprocess.CompletedProcess([], 1, "secret-value", "Bearer secret-value")
        with patch.object(env.subprocess, "run", return_value=response):
            result = env.probe(["kubectl", "get", "nodes"], lambda raw: raw)
        self.assertEqual(result["status"], "unknown")
        self.assertNotIn("secret-value", json.dumps(result))
        self.assertNotIn("data", result)

    def test_timeout_and_missing_tool_are_unknown(self):
        for failure in (subprocess.TimeoutExpired("kubectl", 8), FileNotFoundError()):
            with self.subTest(failure=type(failure).__name__):
                with patch.object(env.subprocess, "run", side_effect=failure):
                    self.assertEqual(env.probe(["kubectl"], lambda raw: raw)["status"], "unknown")

    def test_empty_success_differs_from_malformed_response(self):
        for raw, status in ((json.dumps({"items": []}), "observed"), ("not-json", "unknown"), ('{}', "unknown")):
            with patch.object(env.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, raw, "")):
                result = env.probe(["kubectl"], env.workloads)
            self.assertEqual(result["status"], status)

    def test_whitelist_omits_env_images_addresses_and_annotations(self):
        raw = json.dumps({"items": [{"kind": "Deployment", "metadata": {
            "name": "cart", "namespace": "ecommerce", "annotations": {"secret": "secret-value"}},
            "spec": {"replicas": 2, "template": {"spec": {"containers": [{"env": [{"value": "secret-value"}]}]}}},
            "status": {"readyReplicas": 1}}]})
        rows = env.workloads(raw)
        self.assertEqual(rows[0]["desired"], 2)
        self.assertEqual(rows[0]["ready"], 1)
        self.assertNotIn("secret-value", json.dumps(rows))

    def test_stale_generation_does_not_report_workload_healthy(self):
        raw = json.dumps({"items": [{"kind": "Deployment", "metadata": {"name": "cart", "generation": 3},
            "spec": {"replicas": 1}, "status": {"readyReplicas": 1, "observedGeneration": 2}}]})
        self.assertFalse(env.workloads(raw)[0]["reconciled"])

    def test_local_section_never_invokes_kubectl_or_network_clients(self):
        seen = []
        def run(command, **kwargs):
            seen.append((command, kwargs))
            return subprocess.CompletedProcess(command, 0, "version", "")
        with patch.object(env.subprocess, "run", side_effect=run):
            result = env.collect("local", "", "ecommerce")
        self.assertTrue(result)
        self.assertTrue(all(cmd[0] in ("go", "node", "pnpm", "git") for cmd, _ in seen))
        for _, kwargs in seen:
            self.assertEqual(kwargs.get("env", {}).get("GOTOOLCHAIN"), "local")
            self.assertEqual(kwargs.get("env", {}).get("COREPACK_ENABLE_NETWORK"), "0")

    def test_gitops_explicit_disabled_is_not_reported_as_automated(self):
        for automated, expected in (({}, True), ({"enabled": False}, False), (None, False)):
            raw = json.dumps({"items": [{"kind": "Application", "metadata": {"name": "app"},
                              "spec": {"syncPolicy": {"automated": automated}}}]})
            with self.subTest(automated=automated):
                self.assertEqual(env.gitops(raw)[0]["automated"], expected)


if __name__ == "__main__":
    unittest.main()
