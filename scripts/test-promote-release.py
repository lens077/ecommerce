#!/usr/bin/env python3
"""Regression checks for architecture validation and paired release edits (offline)."""
import importlib.util
import shutil
import subprocess
import tempfile
import re
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('promote', Path(__file__).with_name('promote-release.py'))
promote = importlib.util.module_from_spec(spec)
spec.loader.exec_module(promote)


class ReleaseTests(unittest.TestCase):
    def test_single_arch_emergency_image_is_rejected(self):
        for raw in ({'config': {}}, {'manifests': [{'platform': {'os': 'linux', 'architecture': 'amd64'}}]}):
            with self.assertRaises(ValueError):
                promote.require_platforms(raw)
        promote.require_platforms({'manifests': [
            {'platform': {'os': 'linux', 'architecture': arch}} for arch in ('amd64', 'arm64', 'unknown')]})

    def test_canonical_versions_only(self):
        self.assertTrue(promote.SEMVER.fullmatch('1.6.4'))
        for version in ('sha-98ba5d1', '1.06.4', 'v1.6.4', '1.6.4\n', 'latest'):
            self.assertFalse(promote.SEMVER.fullmatch(version))

    def test_proto_breaking_baseline_uses_last_promoted_release(self):
        workflow = (promote.ROOT / '.github/workflows/service-ci.yml').read_text()
        self.assertIn("yq -r '.cart.image.tag | split(\"@\")[0]' ../helm/values-prod.yaml", workflow)
        self.assertNotIn("grep -vx \"${GITHUB_REF_NAME}\"", workflow)

    def test_release_workflow_does_not_recreate_deleted_progress_archive(self):
        workflow = (promote.ROOT / '.github/workflows/backend.yml').read_text()
        self.assertNotIn('>> docs/progress-archive/', workflow)
        self.assertNotIn('git add docs/progress-archive/', workflow)

    def test_both_environments_plan_all_twelve_images_without_writing(self):
        services = promote.inventory()
        charts = [*services, 'frontend', 'consumer-next']
        digests = {chart: 'sha256:' + 'a' * 64 for chart in charts}
        for environment in ('pre', 'prod'):
            with self.subTest(environment=environment):
                changes = promote.plan_changes(promote.ROOT, services, environment, '1.6.4', digests)
                self.assertEqual(len(changes), 13)
                values = next(text for path, text in changes.items() if path.parent.name == 'helm')
                self.assertEqual(values.count('1.6.4@sha256:' + 'a' * 64), 12)
                for path, text in changes.items():
                    self.assertNotEqual(path.read_text(), text)
                    if path.parent.name != 'helm':
                        self.assertIn('1.6.4', text)
                        self.assertIn('sha256:' + 'a' * 64, text)
                        self.assertNotIn('sha-98ba5d1', text)

    def test_promoted_manifests_render_equally_and_prod_drift_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            services = promote.inventory()
            for folder in ['helm', 'frontend/apps/consumer/deploy',
                           'frontend/apps/consumer-next/deploy',
                           *[f'backend/services/{s}/deploy' for s in services]]:
                shutil.copytree(promote.ROOT / folder, root / folder)
            (root / 'scripts').mkdir()
            shutil.copy2(promote.ROOT / 'scripts/verify-deploy-parity.sh', root / 'scripts/verify-deploy-parity.sh')
            shutil.copy2(promote.ROOT / 'application-vpa.yml', root / 'application-vpa.yml')
            digests = {s: 'sha256:' + 'a' * 64 for s in [*services, 'frontend', 'consumer-next']}
            for env in ('pre', 'prod'):
                for path, text in promote.plan_changes(root, services, env, '1.6.4', digests).items():
                    path.write_text(text)
            result = subprocess.run(['bash', 'scripts/verify-deploy-parity.sh'], cwd=root,
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            path = root / 'helm/values-prod.yaml'
            # values 是 KYAML；frontend 已有 replicaCount，直接改值才能制造可观察的渲染漂移。
            path.write_text(path.read_text().replace(
                '    replicaCount: 1,\n', '    replicaCount: 7,\n', 1))
            result = subprocess.run(['bash', 'scripts/verify-deploy-parity.sh', 'prod'], cwd=root,
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            self.assertIn('replicas', result.stdout)

    def test_every_image_line_of_a_manifest_moves_together(self):
        """consumer-next 的 init 容器与主容器共用同一镜像(2026-09-15 起两处 image:),
        pre 回写必须把每一处都换成同一个 version@digest;1.7.6 CI 曾因 replace_once 只认一处而红。"""
        services = promote.inventory()
        digests = {chart: 'sha256:' + 'b' * 64 for chart in [*services, 'frontend', 'consumer-next']}
        changes = promote.plan_changes(promote.ROOT, services, 'pre', '1.6.4', digests)
        text = next(text for path, text in changes.items() if path.name == 'consumer-next.yaml')
        # KYAML:image 的值带双引号、行尾带逗号
        image_lines = re.findall(
            r'^\s+image: "ccr\.ccs\.tencentyun\.com/sumery/consumer-next:([^"]+)",$', text, flags=re.M)
        self.assertGreaterEqual(len(image_lines), 2)
        self.assertEqual(set(image_lines), {'1.6.4@sha256:' + 'b' * 64})

    def test_missing_or_duplicate_match_aborts_plan(self):
        for text in ('', 'tag: x\ntag: y\n'):
            with self.assertRaises(ValueError):
                promote.replace_once(text, r'^tag: .+$', lambda _: 'tag: new')


if __name__ == '__main__':
    unittest.main()
