#!/usr/bin/env python3
"""Read-only extraction of direct human messages from released DSH v0-v2 logs."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

NAME = re.compile(r"session(?:\.v([1-9][0-9]*))?\.jsonl(\.zstd)?$")
ALIASES = {"/Users/lens/lens077/ecommerce": "/Users/sumery/lens077/ecommerce"}


def diagnostic(path, message):
    # Never include parser exceptions: those can contain conversation text.
    print("backpass-dsh: {}: {}".format(path, message), file=sys.stderr)


def cwd_matches(cwd, repo):
    if not isinstance(cwd, str):
        return False
    repo = os.path.normpath(os.path.abspath(repo))
    return os.path.normpath(cwd) in {repo, ALIASES.get(repo, repo)}


def read_bytes(path):
    if not str(path).endswith('.zstd'):
        return path.read_bytes()
    if shutil.which('node'):
        # Node decodes ONE frame per call. bytesWritten is the consumed input;
        # buffer all frames before publishing so a corrupt suffix leaks no prefix.
        script = "const f=require('fs'),z=require('zlib');try{const b=f.readFileSync(process.argv[1]),out=[];let offset=0;while(offset<b.length){const r=z.zstdDecompressSync(b.subarray(offset),{info:true});const n=r.engine.bytesWritten;if(!Number.isSafeInteger(n)||n<=0||n>b.length-offset)throw Error();out.push(r.buffer);offset+=n;}process.stdout.write(Buffer.concat(out))}catch(e){process.exit(2)}"
        result = subprocess.run(['node', '-e', script, str(path)], stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE)
        if result.returncode == 0:
            return result.stdout
    if shutil.which('zstd'):
        result = subprocess.run(['zstd', '-dcq', str(path)], stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE)
        if result.returncode == 0:
            return result.stdout
    raise ValueError('compressed log corrupt/truncated or no working Node zstd/zstd CLI decoder; skipped')


def extract(path, version, repo):
    if version not in (0, 1, 2):
        raise ValueError('unsupported generation v{}; no predecessor fallback'.format(version))
    raw = read_bytes(path)
    lines = raw.splitlines(keepends=True)
    rows = []
    for i, line in enumerate(lines):
        if not line.endswith(b'\n'):
            diagnostic(path, 'unterminated tail ignored')
            break
        try:
            row = json.loads(line)
        except (ValueError, UnicodeError):
            raise ValueError('invalid JSON at line {}; artifact skipped'.format(i + 1)) from None
        if not isinstance(row, dict):
            raise ValueError('non-object row; artifact skipped')
        rows.append(row)
    if not rows:
        raise ValueError('missing header')
    header = rows[0]
    if header.get('type') != 'session' or header.get('version') != version or not isinstance(header.get('id'), str):
        raise ValueError('header does not match canonical generation')
    if not cwd_matches(header.get('cwd'), repo):
        return []
    events = rows[1:]
    if version == 2:
        if not isinstance(header.get('isSeeded'), bool):
            raise ValueError('missing v2 isSeeded flag')
        cuts = [i for i, r in enumerate(events) if r.get('type') == 'session/end-seed'
                and isinstance(r.get('data'), dict) and r['data'].get('inherited') is True]
        if header['isSeeded'] and not cuts:
            # Empty lazy fork headers contain no user data; otherwise fail closed.
            if events:
                raise ValueError('seeded v2 log lacks inherited boundary')
            return []
        events = events[cuts[-1] + 1:] if header['isSeeded'] else events
    else:
        cut = header.get('seedLength', 0)
        if type(cut) is not int or cut < 0:
            raise ValueError('invalid historical seedLength')
        # Historical assistant chunks can occupy multiple logical seqs per row.
        events = [r for r in events if type(r.get('seq')) is int and r['seq'] >= cut]
    output = []
    for event in events:
        data = event.get('data')
        if event.get('type') != 'user/message' or not isinstance(data, dict):
            continue
        if data.get('source') != {'kind': 'user'} or data.get('role') != 'user':
            continue
        blocks = data.get('content')
        if not isinstance(blocks, list):
            raise ValueError('invalid direct-user content')
        text = ' \u23ce '.join(b['text'] for b in blocks if isinstance(b, dict)
                              and b.get('type') == 'text' and isinstance(b.get('text'), str)).strip()
        if text:
            # Keep full session identity; short suffixes collide across sessions.
            sid = re.sub(r'[\t\r\n]', '_', header['id'])
            text = re.sub(r'[\t\r\n]', ' \u23ce ', text)[:500]
            output.append('DSH:{}\t{}'.format(sid, text))
    return output


def collect(root, repo, days):
    root = Path(root)
    if not root.exists():
        diagnostic(root, 'session root unavailable')
        return []
    groups = {}
    for path in root.rglob('session*.jsonl*'):
        match = NAME.fullmatch(path.name)
        if match and path.is_file():
            groups.setdefault(path.parent, []).append((int(match[1] or 0), path))
    output = []
    for parent, choices in sorted(groups.items()):
        version = max(v for v, _ in choices)
        selected = [p for v, p in choices if v == version]
        if len(selected) != 1:
            diagnostic(parent, 'ambiguous encoding for highest generation; skipped')
            continue
        path = selected[0]
        try:
            if path.stat().st_mtime < time.time() - days * 86400:
                continue
            output.extend(extract(path, version, repo))
        except (ValueError, OSError) as exc:
            diagnostic(path, str(exc) if isinstance(exc, ValueError) else 'file read unavailable')
    return output


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('usage: backpass-dsh.py REPO DAYS')
    try:
        days = int(sys.argv[2])
        if days <= 0:
            raise ValueError()
    except ValueError:
        sys.exit('DAYS must be a positive integer')
    for line in collect(Path(os.environ.get('DSH_HOME', str(Path.home() / '.dsh'))) / 'sessions', sys.argv[1], days):
        print(line)
