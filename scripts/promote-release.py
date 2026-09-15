#!/usr/bin/env python3
"""Verify a complete multiarch release and update both deployment representations.

This only edits repository files: it never pushes Git or changes a cluster.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEMVER = re.compile(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\Z")


def replace_once(text, pattern, replacement):
    result, count = re.subn(pattern, lambda m: replacement(m), text, flags=re.MULTILINE)
    if count != 1:
        raise ValueError(f"expected one match, got {count}: {pattern}")
    return result


def replace_all_at_least_once(text, pattern, replacement):
    """Same image may legitimately appear more than once in one manifest (e.g. an init container
    that seeds a volume from the app image, consumer-next since 2026-09-15); every occurrence
    must move to the same version@digest together."""
    result, count = re.subn(pattern, lambda m: replacement(m), text, flags=re.MULTILINE)
    if count < 1:
        raise ValueError(f"expected at least one match, got 0: {pattern}")
    return result


def require_platforms(index):
    platforms = {(m.get('platform', {}).get('os'), m.get('platform', {}).get('architecture'))
                 for m in index.get('manifests', [])}
    if not {('linux', 'amd64'), ('linux', 'arm64')} <= platforms:
        raise ValueError('release index must include linux/amd64 and linux/arm64')


def inventory():
    return json.loads(subprocess.check_output(
        ['yq', '-o=json', '.services | keys', str(ROOT / '.service-matrix.yaml')]))


def plan_changes(root, services, environment, version, digests):
    """Plan all changes before writing, preserving hand-written YAML formatting."""
    changes = {}
    values_path = root / 'helm' / ('values.yaml' if environment == 'dev' else 'values-prod.yaml')
    values = values_path.read_text()
    for chart in [*services, 'frontend', 'consumer-next']:
        repo = 'ecommerce-frontend' if chart == 'frontend' else chart
        image = f'ccr.ccs.tencentyun.com/sumery/{repo}'
        pin = version + '@' + digests[chart]
        if environment == 'prod' and chart in services:
            values = replace_once(values, rf'^({re.escape(chart)}:.*?tag: ")[^"]+(".*)$',
                                  lambda m: m[1] + pin + m[2])
        else:
            values = replace_once(values, rf'(^\s+repository: {re.escape(image)}\n\s+tag: )[^\n]+',
                                  lambda m: m[1] + pin) if environment == 'dev' else replace_once(
                values, r'(^' + re.escape(chart) + r':\n  image:\n    tag: ")[^"]+(".*)$',
                lambda m: m[1] + pin + m[2])
        if environment == 'prod':
            if chart in services:
                path = root / f'backend/services/{chart}/deploy/overlays/prod/kustomization.yaml'
            else:
                app = 'consumer' if chart == 'frontend' else 'consumer-next'
                path = root / f'frontend/apps/{app}/deploy/overlays/prod/kustomization.yaml'
            text = path.read_text()
            text = replace_once(text, r'^(    newTag: ).+$', lambda m: m[1] + json.dumps(version))
            if re.search(r'^    digest:', text, flags=re.MULTILINE):
                text = replace_once(text, r'^(    digest: ).+$', lambda m: m[1] + digests[chart])
            else:
                text = replace_once(text, r'^(    newTag: .+)$', lambda m: m[1] + '\n    digest: ' + digests[chart])
        else:
            if chart in services:
                path = root / f'backend/services/{chart}/deploy/base/deployment.yaml'
            elif chart == 'frontend':
                path = root / 'frontend/apps/consumer/deploy/pre/deployment.yaml'
            else:
                path = root / 'frontend/apps/consumer-next/deploy/base/dev.yaml'
            text = replace_all_at_least_once(path.read_text(), rf'^(\s+image: ){re.escape(image)}:[^\n]+',
                                             lambda m: m[1] + image + ':' + pin)
        changes[path] = text
    changes[values_path] = values
    return changes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--environment', choices=['dev', 'prod'], required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--check', action='store_true', help='verify registry and edit plan without writing')
    args = parser.parse_args()
    if not SEMVER.fullmatch(args.version):
        parser.error('version must be canonical X.Y.Z; sha/emergency tags cannot be promoted')
    services = inventory()
    digests = {}
    for chart in [*services, 'frontend', 'consumer-next']:
        repo = 'ecommerce-frontend' if chart == 'frontend' else chart
        ref = f'ccr.ccs.tencentyun.com/sumery/{repo}:{args.version}'
        # Resolve once, then inspect by digest so the pin matches the checked content.
        descriptor = json.loads(subprocess.check_output([
            'docker', 'buildx', 'imagetools', 'inspect', ref, '--format', '{{json .Manifest}}']))
        digest = descriptor['digest']
        if not re.fullmatch(r'sha256:[0-9a-f]{64}', digest):
            raise ValueError(f'invalid registry digest for {ref}')
        raw = subprocess.check_output(['docker', 'buildx', 'imagetools', 'inspect',
                                       ref.split(':')[0] + '@' + digest, '--raw'])
        require_platforms(json.loads(raw))
        digests[chart] = digest
        print(f'verified {ref}@{digest}')
    changes = plan_changes(ROOT, services, args.environment, args.version, digests)
    if args.check:
        print(f'check passed: {len(changes)} files would change; nothing written')
        return
    # All registry lookups and replacement assertions have succeeded before the first write.
    originals = {p: p.read_text() for p in changes}
    try:
        for path, text in changes.items():
            path.write_text(text)
        subprocess.run(['bash', str(ROOT / 'scripts/verify-deploy-parity.sh')], check=True, cwd=ROOT)
    except BaseException:
        for path, text in originals.items():
            path.write_text(text)
        raise
    print('Both manifests updated and parity verified; review the diff before commit/deploy.')


if __name__ == '__main__':
    main()
