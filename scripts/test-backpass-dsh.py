#!/usr/bin/env python3
"""Fixture tests; never reads the user's history."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('reader', Path(__file__).with_name('backpass-dsh.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
REPO = '/Users/lens/lens077/ecommerce'


def message(seq, text='hello', source=None):
    return {'seq': seq, 'type': 'user/message', 'data': {'role': 'user',
            'source': source or {'kind': 'user'}, 'content': [{'type': 'text', 'text': text}]}}


class ReaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def log(self, version=2, events=None, cwd=REPO, seeded=False, name='s', compressed=False):
        folder = self.root / 'project' / name
        folder.mkdir(parents=True, exist_ok=True)
        header = {'type': 'session', 'version': version, 'id': name, 'cwd': cwd}
        if version == 2:
            header['isSeeded'] = seeded
        elif seeded:
            header['seedLength'] = 2
        raw = ''.join(json.dumps(x) + '\n' for x in [header] + (events or [])).encode()
        if compressed:
            try:
                raw = subprocess.check_output(['node', '-e', "const z=require('zlib');let b=[];process.stdin.on('data',x=>b.push(x));process.stdin.on('end',()=>process.stdout.write(z.zstdCompressSync(Buffer.concat(b))))"], input=raw, stderr=subprocess.DEVNULL)
            except (OSError, subprocess.CalledProcessError):
                self.skipTest('Node built-in zstd unavailable')
        path = folder / ('session' + ('.v'+str(version) if version else '') + '.jsonl' + ('.zstd' if compressed else ''))
        path.write_bytes(raw)
        return path

    def collect(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            rows = r.collect(self.root, REPO, 14)
        return rows, err.getvalue()

    def test_v2_human_only_and_blocks(self):
        self.log(events=[message(0), message(1, 'secret instructions', {'kind':'agent-instructions'}),
                         message(2, 'skill', {'kind':'skill'}), message(3, 'context', {'kind':'runtime-context'}),
                         {'type':'tool/result','data':{'text':'not human'}}])
        self.assertEqual(self.collect()[0], ['DSH:s\thello'])

    def test_last_inherited_marker_not_restore_marker(self):
        marker = lambda n: {'seq':n,'type':'session/end-seed','data':{'inherited':True}}
        self.log(seeded=True, events=[message(0,'ancestor'),marker(1),message(2,'parent'),marker(3),
                                    message(4,'own'), {'seq':5,'type':'session/end-seed','data':{}},message(6,'later')])
        self.assertEqual(self.collect()[0], ['DSH:s\town','DSH:s\tlater'])

    def test_historical_and_current_generations(self):
        for v in (0,1):
            self.log(v, [message(0,'seed'),message(2,'old')], seeded=True)
        self.log(2,[message(0,'current')],compressed=True)
        self.assertEqual(self.collect()[0],['DSH:s\tcurrent'])

    def test_historical_seed(self):
        for v in (0,1):
            self.log(v,[message(0,'seed'),message(2,'own')],seeded=True,name=str(v),compressed=True)
        self.assertEqual(len(self.collect()[0]),2)
        self.assertTrue(all(x.endswith('\town') for x in self.collect()[0]))

    def test_scope_alias_not_basename_or_substring(self):
        for i,cwd in enumerate([REPO, '/Users/sumery/lens077/ecommerce', '/else/ecommerce', REPO+'-other', REPO+'/frontend']):
            self.log(cwd=cwd,events=[message(0)],name=str(i))
        self.assertEqual(len(self.collect()[0]),2)

    def test_unsupported_highest_never_falls_back(self):
        self.log(2,[message(0)])
        self.log(3,[message(0)])
        rows, errors = self.collect()
        self.assertEqual(rows,[])
        self.assertIn('unsupported generation',errors)

    def test_malformed_tail_preserves_committed_prefix(self):
        p=self.log(events=[message(0)])
        p.write_bytes(p.read_bytes()+b'{"private unfinished')
        rows,errors=self.collect()
        self.assertEqual(rows,['DSH:s\thello'])
        self.assertIn('tail ignored',errors)
        self.assertNotIn('private',errors)

    def test_bad_committed_line_rejects_artifact(self):
        p=self.log(events=[message(0)])
        p.write_bytes(p.read_bytes()+b'{secret invalid}\n')
        rows,errors=self.collect()
        self.assertEqual(rows,[])
        self.assertIn('invalid JSON',errors)
        self.assertNotIn('secret',errors)

    def test_missing_decoder_and_corrupt_frame_diagnosed(self):
        p=self.log(compressed=True,events=[message(0)])
        with patch.object(r.shutil,'which',return_value=None):
            self.assertIn('decoder',self.collect()[1])
        p.write_bytes(b'bad compressed bytes')
        self.assertEqual(self.collect()[0],[])
        self.assertIn('corrupt',self.collect()[1])

    def test_seeded_without_boundary_and_dual_encoding_rejected(self):
        self.log(seeded=True,events=[message(0)])
        self.assertIn('boundary',self.collect()[1])
        self.log(compressed=True,events=[message(0)])
        self.assertIn('ambiguous',self.collect()[1])

    def test_concatenated_frames_and_corrupt_suffix(self):
        for count in (1, 3):
            with self.subTest(event_frames=count):
                p = self.log(events=[message(i, 'frame'+str(i)) for i in range(count)])
                raw = p.read_bytes()
                compressed = subprocess.check_output(['node', '-e', "const z=require('zlib');let b=[];process.stdin.on('data',x=>b.push(x));process.stdin.on('end',()=>{const lines=Buffer.concat(b).toString().trimEnd().split('\\n');process.stdout.write(Buffer.concat(lines.map(l=>z.zstdCompressSync(Buffer.from(l+'\\n')))))})"], input=raw)
                target = p.with_suffix('.jsonl.zstd')
                target.write_bytes(compressed)
                self.assertEqual(len(r.extract(target, 2, REPO)), count)
                target.write_bytes(compressed + b'broken later frame')
                with self.assertRaisesRegex(ValueError, 'corrupt'):
                    r.extract(target, 2, REPO)
                target.write_bytes(compressed[:-2])
                with self.assertRaisesRegex(ValueError, 'corrupt'):
                    r.extract(target, 2, REPO)
                target.unlink()

    def test_empty_root(self):
        self.assertEqual(self.collect(),([],''))

    def test_shell_outputs_with_empty_injection_list(self):
        import os
        self.log(events=[message(0, '不要重复'), message(1, 'normal')], compressed=True)
        home = self.root / 'home'
        (home / '.claude/projects').mkdir(parents=True)
        (home / '.codex/sessions').mkdir(parents=True)
        out = self.root / 'output with spaces'
        # DSH_HOME controls its root independently of the other two source homes.
        dsh_home = self.root / 'dsh'
        dsh_home.mkdir()
        (dsh_home / 'sessions').symlink_to(self.root / 'project', target_is_directory=True)
        env = dict(os.environ, HOME=str(home), DSH_HOME=str(dsh_home))
        result = subprocess.run(['bash', str(Path(__file__).with_name('backpass-distill.sh')),
                                 REPO, '14', str(out)], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((out / 'injected.txt').read_text(), '')
        self.assertEqual(len((out / 'human.tsv').read_text().splitlines()), 2)
        self.assertEqual(len((out / 'markers.txt').read_text().splitlines()), 1)
        self.assertIn('DSH:s', (out / 'human.tsv').read_text())
        self.assertEqual(out.stat().st_mode & 0o077, 0)
        self.assertEqual((out / 'human.tsv').stat().st_mode & 0o077, 0)


if __name__ == '__main__':
    unittest.main()
