#!/usr/bin/env python3
"""Prove migrations block deploys, preserve context, and honor dry-run (no cluster)."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
FAKE = '''#!/usr/bin/env python3
import json, os, sys
args=sys.argv[1:]
body=sys.stdin.read() if '-f' in args and args[args.index('-f')+1]=='-' else ''
with open(os.environ['CALLS'],'a') as f: f.write(json.dumps({'args':args,'body':body})+'\\n')
if 'get' in args and 'secret' in args:
    print('cG9zdGdyZXNxbDovL2V4YW1wbGU=')
elif 'create' in args and '-f' in args:
    print('ecommerce-db-migrate-test')
elif 'get' in args and 'job' in args:
    print(json.dumps({'status': {'conditions':[{'type':os.environ.get('JOB_STATE','Complete'),'status':'True'}]}}))
'''


class MigrationTests(unittest.TestCase):
    def run_script(self, state='Complete', dry='', env='pre', command=None):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name)
        (path / 'kubectl').write_text(FAKE)
        (path / 'kubectl').chmod(0o755)
        calls = path / 'calls'
        values = {**os.environ, 'PATH': str(path) + os.pathsep + os.environ['PATH'],
                  'CALLS': str(calls), 'JOB_STATE': state, 'KUBE_CONTEXT': 'explicit-context',
                  'DEPLOY_ENV': env, 'NAMESPACE': 'acceptance', 'DRY_RUN': dry,
                  'POSTGRES_EGRESS_CIDR': '203.0.113.1/32'}
        result = subprocess.run(command or ['/bin/bash', 'scripts/deploy-db-migrations.sh'], cwd=ROOT,
                                env=values, text=True, capture_output=True)
        recorded = [json.loads(line) for line in calls.read_text().splitlines()] if calls.exists() else []
        return result, recorded

    def test_success_failed_and_deadline_are_distinct(self):
        for state, expected in [('Complete', 0), ('Failed', 1), ('FailureTarget', 1)]:
            with self.subTest(state=state):
                result, calls = self.run_script(state)
                self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
                self.assertTrue(calls)
                self.assertTrue(all(c['args'][:2] == ['--context', 'explicit-context'] for c in calls))
                created = [json.loads(c['body']) for c in calls if 'create' in c['args'] and c['body']]
                self.assertEqual(len(created), 1)
                job = created[0]
                self.assertEqual(job['metadata']['namespace'], 'acceptance')
                self.assertIn('generateName', job['metadata'])
                container = job['spec']['template']['spec']['containers'][0]
                self.assertRegex(container['image'], r'@sha256:[0-9a-f]{64}$')
                self.assertEqual(container['args'][-1], 'up')
                self.assertIn('-require-dsn', container['args'])
                self.assertEqual(job['spec']['backoffLimit'], 0)
                self.assertTrue(job['spec']['template']['spec']['imagePullSecrets'])

    def test_dry_run_never_waits_or_writes(self):
        result, calls = self.run_script(dry='1')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for c in calls:
            if 'apply' in c['args'] or 'create' in c['args']:
                self.assertIn('--dry-run=server', c['args'])
        self.assertFalse(any('get' in c['args'] and 'job' in c['args'] for c in calls))

    def test_both_real_deploy_entrypoints_stop_before_workloads(self):
        for command in (['/bin/bash', 'scripts/deploy-k8s.sh'],
                        ['make', '-C', 'backend', 'k8s-pre-all', 'NAMESPACE=ecommerce']):
            result, calls = self.run_script(state='Failed', command=command)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('workloads NOT released', result.stderr)
            self.assertFalse(any('-k' in c['args'] for c in calls))
            self.assertFalse(any('kind: Deployment' in c['body'] or 'kind: "Deployment"' in c['body']
                                 for c in calls))

    def test_raw_dry_run_variants_cannot_execute_migration(self):
        for args in ('--dry-run=client', '--dry-run=server', '--dry-run server', '--dry-run=false'):
            with self.subTest(args=args):
                result, calls = self.run_script(command=[
                    'make', '-C', 'backend', 'k8s-pre-all', 'NAMESPACE=ecommerce', 'KUBECTL_ARGS='+args])
                # Unsupported variants may fail closed before doing anything.
                for c in calls:
                    if 'create' in c['args']:
                        self.assertIn('--dry-run=server', c['args'])
                self.assertFalse(any('get' in c['args'] and 'job' in c['args'] for c in calls))
                if args == '--dry-run=false':
                    self.assertNotEqual(result.returncode, 0)
                    self.assertFalse(calls)

    def test_unknown_environment_fails_before_kubernetes(self):
        result, calls = self.run_script(env='typo')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])


if __name__ == '__main__':
    unittest.main()
