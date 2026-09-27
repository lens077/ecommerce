#!/usr/bin/env python3
"""Exercise the real gate against disposable Git history, never the user's index."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "scripts/verify-doc-sync.py"
DOC = "docs/TECH.md"
BODY = "---\nname: tech\ndoc-sync: required\naffects:\n  - src\n---\n# Contract\nRequests must be validated.\n"


class DocSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="doc-sync-", dir=ROOT / ".scratch")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q")
        self.write(DOC, BODY)
        self.write("src/api.go", "old\n")
        self.write("src/keep.go", "unchanged\n")
        self.write("docs/other.md", "unrelated\n")
        self.commit("baseline")
        self.base = self.git("rev-parse", "HEAD").strip()

    def write(self, path, value):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value)

    def git(self, *args, input=None):
        environment = {**os.environ, "GIT_AUTHOR_NAME": "Fixture", "GIT_AUTHOR_EMAIL": "fixture@example.invalid",
                       "GIT_COMMITTER_NAME": "Fixture", "GIT_COMMITTER_EMAIL": "fixture@example.invalid"}
        # Alternate-index verification of the outer repository must not leak into fixtures.
        environment.pop("GIT_INDEX_FILE", None)
        return subprocess.run(["git", *args], cwd=self.root, input=input, env=environment,
                              text=True, capture_output=True, check=True).stdout

    def commit(self, message):
        # commit-tree builds only fixture history; no project commit/hooks/network.
        self.git("add", ".")
        tree = self.git("write-tree").strip()
        previous = getattr(self, "tip", None)
        args = ["commit-tree", tree] + (["-p", previous] if previous else [])
        self.tip = self.git(*args, input=message + "\n").strip()
        self.git("update-ref", "HEAD", self.tip)

    def gate(self, expected, *args, env=None):
        environment = {key: value for key, value in os.environ.items()
                       if not key.startswith(("CI_", "DOC_SYNC_"))}
        environment.update(env or {})
        environment.pop("GIT_INDEX_FILE", None)
        result = subprocess.run([sys.executable, str(GATE), *args], cwd=self.root, env=environment,
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return result.stdout + result.stderr

    def test_source_change_requires_matching_document_not_any_markdown(self):
        self.write("src/api.go", "changed\n")
        self.write("docs/other.md", "unrelated update\n")
        self.assertIn(DOC, self.gate(1))
        self.write(DOC, BODY + "New validation behavior.\n")
        self.gate(0)

    def test_whitespace_comment_or_mapping_deletion_is_not_documentation_sync(self):
        self.write("src/api.go", "changed\n")
        for value in (BODY + "\n   \n", BODY + "<!-- reviewed -->\n", BODY.replace("doc-sync: required\n", "")):
            with self.subTest(value=value):
                self.write(DOC, value)
                self.gate(1)

    def test_unstaged_doc_cannot_satisfy_staged_source(self):
        self.write("src/api.go", "changed\n")
        self.git("add", "src/api.go")
        self.write(DOC, BODY + "Actual contract change.\n")
        self.gate(1, "--staged")
        self.git("add", DOC)
        self.gate(0, "--staged")

    def test_exact_reasoned_trailer_satisfies_commit_message_scope(self):
        self.write("src/api.go", "internal rename\n")
        self.git("add", "src/api.go")
        self.write("message", "refactor: rename\n\nDoc-Impact: none docs/other.md | Internal rename; externally visible behavior is unchanged.\n")
        self.gate(1, "--staged", "--message-file", "message")
        self.write("message", "refactor: rename\n\nDoc-Impact: none docs/TECH.md | Internal rename; externally visible behavior is unchanged.\n")
        self.gate(0, "--staged", "--message-file", "message")

    def test_split_code_and_doc_commits_pass_as_one_range(self):
        self.write("src/api.go", "changed\n")
        self.commit("feat: change behavior")
        self.write(DOC, BODY + "Behavior documented.\n")
        self.commit("docs: describe behavior")
        self.gate(0, "--base", self.base)

    def test_old_waiver_cannot_cover_later_source_change(self):
        self.write("src/api.go", "rename\n")
        self.commit("refactor: rename\n\nDoc-Impact: none docs/TECH.md | Internal rename; externally visible behavior is unchanged.")
        self.gate(0, "--base", self.base)
        self.write("src/api.go", "behavior changed\n")
        self.commit("feat: behavior change")
        self.gate(1, "--base", self.base)

    def test_missing_base_and_conflicting_options_fail_closed(self):
        self.gate(2, "--base", "missing-ref")
        self.gate(2, "--staged", "--base", self.base)
        self.gate(2, "--head", self.base)

    def test_untracked_source_matches_a_registered_directory(self):
        self.write("src/new name.go", "new interface\n")
        self.gate(1)

    def test_source_deletion_and_renaming_still_require_review(self):
        self.git("mv", "src/api.go", "elsewhere.go")
        self.gate(1, "--staged")

    def test_ci_uses_entire_push_not_only_last_commit(self):
        self.write("src/api.go", "behavior changed\n")
        self.commit("feat: behavior change")
        self.write("docs/other.md", "unrelated last commit\n")
        self.commit("docs: unrelated")
        self.gate(1, "--ci", env={"CI_COMMIT_BEFORE_SHA": self.base, "CI_COMMIT_SHA": self.tip})
        self.gate(2, "--ci")
        self.gate(2, "--ci", env={"CI_COMMIT_BEFORE_SHA": "0" * 40, "CI_DEFAULT_BRANCH": "absent"})

    def test_fixed_head_ignores_uncommitted_document_changes(self):
        self.write("src/api.go", "changed\n")
        self.commit("feat: change")
        self.write(DOC, BODY + "Uncommitted documentation must not count.\n")
        self.gate(1, "--base", self.base, "--head", self.tip)

    def test_unregistered_changes_do_not_force_unrelated_docs(self):
        self.write("unregistered/file.py", "print(1)\n")
        self.gate(0)

    def test_merge_base_excludes_changes_only_on_target_branch(self):
        self.write("src/api.go", "target-only change\n")
        self.commit("target branch change")
        target = self.tip
        self.git("reset", "--hard", self.base)
        self.tip = self.base
        self.write("docs/other.md", "feature documentation\n")
        self.commit("docs: feature")
        self.gate(0, "--base", target, "--merge-base")

    def test_release_image_changes_do_not_require_tech_rewriting(self):
        # Exercise the real initial TECH registration against a tag-only update.
        tech = (ROOT / DOC).read_text().split("---", 2)[1]
        owned = []
        in_affects = False
        for line in tech.splitlines():
            if line == "affects:":
                in_affects = True
            elif in_affects and line.startswith("  - "):
                owned.append(line[4:])
            elif in_affects:
                in_affects = False
        self.assertNotIn("backend/services", owned)
        for path in ("backend/services/cart/deploy/base/deployment.yaml", "helm/values.yaml", "helm/values-prod.yaml"):
            self.assertFalse(any(path == owner or path.startswith(owner + "/") for owner in owned), path)


if __name__ == "__main__":
    unittest.main()
