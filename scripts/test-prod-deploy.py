#!/usr/bin/env python3
"""Test production entry guards and dry-run propagation with no cluster access."""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FAKE_KUBECTL = '''#!/usr/bin/env python3
import json, os, sys
with open(os.environ['KUBECTL_CALLS'], 'a') as f:
    f.write(json.dumps(sys.argv[1:]) + '\\n')
if 'apply' in sys.argv or 'delete' in sys.argv:
    if '--dry-run=server' not in sys.argv:
        sys.exit('write escaped dry-run')
    if '-f' in sys.argv and sys.argv[sys.argv.index('-f')+1] == '-':
        sys.stdin.read()
if 'get' in sys.argv and 'secret' in sys.argv:
    print('cG9zdGdyZXNxbDovL2V4YW1wbGU=')
if 'create' in sys.argv:
    if '-f' in sys.argv and sys.argv[sys.argv.index('-f')+1] == '-':
        sys.stdin.read()
    if '--dry-run=client' not in sys.argv and '--dry-run=server' not in sys.argv:
        sys.exit('create escaped dry-run')
    print('apiVersion: v1\\nkind: Namespace\\nmetadata:\\n  name: ecommerce')
'''


class ProdDeployTests(unittest.TestCase):
    def test_explicit_context_and_server_dry_run_on_both_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake = root / 'kubectl'
            fake.write_text(FAKE_KUBECTL)
            fake.chmod(0o755)
            calls = root / 'calls'
            env = {**os.environ, 'PATH': str(root) + os.pathsep + os.environ['PATH'],
                   'KUBECTL_CALLS': str(calls), 'KUBE_CONTEXT': '', 'DEPLOY_ENV': 'prod',
                   'DEPLOY_MODE': 'helm', 'DEPLOY_ACTION': 'apply',
                   'DRY_RUN': '1', 'POSTGRES_EGRESS_CIDR': '203.0.113.1/32',
                   'PG_CA_FILE': str(root / 'missing-ca')}
            env.pop('SERVICES', None)
            shell = ['/bin/bash', 'scripts/deploy-k8s.sh']
            raw = ['make', '-C', 'backend', 'k8s-prod-all', 'KUBECTL_ARGS=--dry-run=server']
            for command in (shell, raw):
                result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('explicit KUBE_CONTEXT', result.stderr)
                self.assertFalse(calls.exists())
            env['KUBE_CONTEXT'] = 'test-production'
            for command in (shell, raw):
                result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            recorded = [json.loads(line) for line in calls.read_text().splitlines()]
            self.assertTrue(recorded)
            for args in recorded:
                self.assertEqual(args[:2], ['--context', 'test-production'])
                if 'apply' in args:
                    self.assertIn('--dry-run=server', args)
            overlays = [a[a.index('-k')+1] for a in recorded if '-k' in a]
            self.assertEqual(len(overlays), 12)
            self.assertTrue(all(p.endswith('/overlays/prod') for p in overlays))


if __name__ == '__main__':
    unittest.main()
