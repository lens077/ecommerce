"""Behavioral regression checks for the standalone Claude PreToolUse hook."""

import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "e3-overread-guard.py"


class E3GuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="e3-hook-test-")
        self.addCleanup(self.temp.cleanup)
        self.env = dict(os.environ, TMPDIR=self.temp.name, TMP=self.temp.name, TEMP=self.temp.name)

    def call(self, path="/repo/f", session="session", tool="Read", **args):
        payload = {
            "hook_event_name": "PreToolUse", "session_id": session,
            "cwd": "/repo", "tool_name": tool,
            "tool_input": dict(file_path=path, **args),
        }
        return subprocess.run(
            [sys.executable, str(SCRIPT)], input=json.dumps(payload), text=True,
            capture_output=True, env=self.env, timeout=10,
        )

    def state_path(self, session="session"):
        digest = hashlib.sha256(session.encode()).hexdigest()
        return Path(self.temp.name) / ("e3-guard-" + digest + ".json")

    def test_sixth_distinct_full_read_interrupts_once_and_retry_passes(self):
        for index in range(5):
            self.assertEqual(self.call("/repo/f%d" % index).returncode, 0)
        blocked = self.call("/repo/f5")
        self.assertEqual(blocked.returncode, 2)
        self.assertEqual(blocked.stdout, "")
        self.assertIn("retry this Read", blocked.stderr)
        self.assertEqual(self.call("/repo/f5").returncode, 0)
        self.assertEqual(self.call("/repo/f6").returncode, 0)

    def test_repeated_and_normalized_paths_count_once(self):
        for path in ["f", "/repo/f", "/repo/child/../f"] * 4:
            self.assertEqual(self.call(path).returncode, 0)
        state = json.loads(self.state_path().read_text())
        self.assertEqual(state["reads"], ["/repo/f"])

    def test_bounded_and_later_page_reads_do_not_count(self):
        for index in range(8):
            self.assertEqual(self.call("/repo/b%d" % index, limit=200).returncode, 0)
            self.assertEqual(self.call("/repo/o%d" % index, offset=2).returncode, 0)
        self.assertFalse(self.state_path().exists())
        for index in range(5):
            self.assertEqual(self.call("/repo/f%d" % index, offset=1).returncode, 0)
        self.assertEqual(self.call("/repo/f5", offset=1).returncode, 2)

    def test_each_edit_tool_stops_the_pre_edit_reminder(self):
        for tool in ["Edit", "Write", "MultiEdit", "NotebookEdit"]:
            self.assertEqual(self.call(session=tool, tool=tool).returncode, 0)
            for index in range(8):
                self.assertEqual(self.call("/repo/f%d" % index, session=tool).returncode, 0)

    def test_sessions_are_isolated_and_ids_cannot_escape_temp(self):
        for index in range(6):
            result = self.call("/repo/f%d" % index, session="../../escaped")
        self.assertEqual(result.returncode, 2)
        self.assertTrue(self.state_path("../../escaped").is_file())
        self.assertEqual(self.call("/repo/f6", session="other").returncode, 0)
        self.assertEqual(len(list(Path(self.temp.name).iterdir())), 2)

    def test_parallel_reads_produce_only_one_interruption(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda i: self.call("/repo/f%d" % i), range(8)))
        self.assertEqual(sorted(result.returncode for result in results), [0] * 7 + [2])
        self.assertEqual(self.state_path().stat().st_mode & 0o777, 0o600)

    def test_bad_input_or_state_is_visible_but_does_not_block(self):
        invalid = subprocess.run(
            [sys.executable, str(SCRIPT)], input="{broken", text=True,
            capture_output=True, env=self.env, timeout=10,
        )
        self.assertEqual(invalid.returncode, 0)
        self.assertIn("unavailable", invalid.stderr)
        self.state_path().write_text("{broken")
        failed = self.call()
        self.assertEqual(failed.returncode, 0)
        self.assertIn("unavailable", failed.stderr)
        self.assertEqual(self.state_path().read_text(), "{broken")

    def test_symlink_state_is_not_followed(self):
        target = Path(self.temp.name) / "unrelated.json"
        target.write_text("do not change")
        self.state_path().symlink_to(target)
        result = self.call()
        self.assertEqual(result.returncode, 0)
        self.assertIn("unavailable", result.stderr)
        self.assertEqual(target.read_text(), "do not change")

    def test_other_tools_do_not_create_state(self):
        self.assertEqual(self.call(tool="Bash").returncode, 0)
        self.assertFalse(self.state_path().exists())


if __name__ == "__main__":
    unittest.main()
