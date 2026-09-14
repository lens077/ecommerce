#!/usr/bin/env python3
"""Execute embedded release shell against a fake registry; never publishes images."""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = json.loads(subprocess.check_output(['yq', '-o=json', '.', str(ROOT / '.github/workflows/frontend-release.yml')]))
FAKE_DOCKER = '''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
with open(os.environ['DOCKER_CALLS'], 'a') as f:
    f.write(json.dumps(args) + '\\n')
if 'create' in args:
    sys.exit(0)
ref = args[args.index('inspect') + 1]
if '--raw' in args:
    print(json.dumps({'manifests': [{'platform': {'os': 'linux', 'architecture': a}}
                      for a in ['amd64', 'arm64']]}))
elif '.Image' in args[-1]:
    print(json.dumps({'os': 'linux', 'architecture': 'arm64' if ref.endswith('b' * 64) else 'amd64'}))
elif args[-1] == '{{.Manifest.Digest}}':
    scenario = os.environ.get('REGISTRY_SCENARIO', 'missing')
    if ':release-' in ref or scenario == 'same':
        print('sha256:' + 'c' * 64)
    elif scenario == 'collision':
        print('sha256:' + 'd' * 64)
    else:
        # Real TCR wording observed 2026-09-14: "ERROR: <ref>: not found"
        print(f'ERROR: {ref}: not found' if scenario == 'missing' else '401 Unauthorized', file=sys.stderr)
        sys.exit(1)
else:
    print('unsupported Buildx format', file=sys.stderr)
    sys.exit(1)
'''


def step(job, name):
    return next(s for s in WORKFLOW['jobs'][job]['steps'] if s.get('name') == name)['run']


class FrontendReleaseTests(unittest.TestCase):
    def test_shell_syntax(self):
        for job in WORKFLOW['jobs'].values():
            for s in job.get('steps', []):
                if 'run' in s:
                    subprocess.run(['bash', '-n'], input=s['run'], text=True, check=True)

    def test_semver_validation_accepts_release_and_rejects_invalid_values(self):
        for version in ['1.6.4', '0.1.0', '01.6.4', 'sha-98ba5d1', '1x6x4']:
            for job in ['build', 'merge']:
                result = subprocess.run(['bash', '-c', step(job, 'Validate canonical semver')],
                                        env={**os.environ, 'VERSION': version})
                self.assertEqual(result.returncode == 0, version in ['1.6.4', '0.1.0'])

    def test_actual_shell_handles_platform_metadata_and_tag_collisions(self):
        for scenario in ['missing', 'same', 'collision', 'unauthorized']:
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                docker = root / 'docker'
                docker.write_text(FAKE_DOCKER)
                docker.chmod(0o755)
                calls = root / 'calls'
                env = {**os.environ, 'PATH': str(root) + os.pathsep + os.environ['PATH'],
                       'DOCKER_CALLS': str(calls), 'REGISTRY_SCENARIO': scenario,
                       'VERSION': '1.6.4', 'SHA': 'e' * 40, 'GITHUB_RUN_ID': '42',
                       'GITHUB_RUN_ATTEMPT': '1', 'REGISTRY': 'example.invalid', 'NAMESPACE': 'test'}
                for app in ['consumer', 'consumer-next']:
                    for arch, digit in [('amd64', 'a'), ('arm64', 'b')]:
                        artifact = root / f'digests/frontend-digest-{app}-{arch}'
                        artifact.mkdir(parents=True)
                        (artifact / f'{arch}.digest').write_text('sha256:' + digit * 64)
                        subprocess.run(['bash', '-c', step('build', 'Verify platform digest and write artifact')],
                                       cwd=root, env={**env, 'IMAGE': 'example.invalid/test/app',
                                       'DIGEST': 'sha256:' + digit * 64, 'ARCH': arch, 'APP': app}, check=True)
                result = subprocess.run(['bash', '-c', step('merge', 'Verify and publish immutable tags')],
                                        cwd=root, env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, scenario in ['missing', 'same'], result.stderr)
                recorded = [json.loads(line) for line in calls.read_text().splitlines()]
                final_pushes = [a for a in recorded if 'create' in a and ':release-' not in a[a.index('--tag') + 1]]
                self.assertEqual(len(final_pushes), 4 if scenario == 'missing' else 0)


if __name__ == '__main__':
    unittest.main()
