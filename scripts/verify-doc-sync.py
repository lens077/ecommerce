#!/usr/bin/env python3
"""Offline Git-scope gate for explicitly owned documentation (Python stdlib + Git).

2026-09-26: format/path gates were green while TECH/local-env contradicted code.
Reuse affects: rather than maintain another path map. Only doc-sync: required
opts a document into blocking. A changed unrelated README cannot satisfy it.
This checks review responsibility, NOT semantic equivalence of natural language.
"""
import argparse
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys


class GateError(Exception):
    pass


def git(*args):
    result = subprocess.run(["git", *args], capture_output=True, text=True)
    if result.returncode:
        raise GateError("Git failed: " + " ".join(args[:2]) + " (check refs/history/index)")
    return result.stdout


def reachable(rev):
    return subprocess.run(["git", "rev-parse", "--verify", rev + "^{commit}"],
                          capture_output=True, text=True).returncode == 0


def paths(*args):
    return {name for name in git(*args).split("\0") if name}


def tree_files(revision):
    if revision == "index":
        return paths("ls-files", "--cached", "-z")
    if revision == "worktree":
        return paths("ls-files", "--cached", "--others", "--exclude-standard", "-z")
    return paths("ls-tree", "-r", "--name-only", "-z", revision)


def read_at(path, revision, files):
    if path not in files:
        return ""
    if revision == "worktree":
        return Path(path).read_text() if Path(path).is_file() else ""
    return git("show", (":" if revision == "index" else revision + ":") + path)


def frontmatter(text):
    match = re.match(r"\A---\r?\n(.*?)\r?\n---(?:\r?\n|$)", text, re.S)
    return match[1] if match else ""


def mappings(documents):
    result = {}
    for name, text in documents.items():
        fm = frontmatter(text)
        marker = re.search(r"^doc-sync:\s*(.*?)\s*$", fm, re.M)
        if not marker:
            continue
        if marker[1] != "required":
            raise GateError(name + ": doc-sync must be required, or omit the key")
        block = re.search(r"^affects:[ \t]*\n((?:[ \t]+-[ \t]+[^\n]+\n?)+)", fm, re.M)
        if not block:
            raise GateError(name + ": doc-sync: required needs an affects: block list")
        entries = set()
        for line in block[1].splitlines():
            path = re.sub(r"^\s*-\s+", "", line).strip()
            parsed = PurePosixPath(path)
            if not path or parsed.is_absolute() or ".." in parsed.parts or re.search(r"[\s*?\[\]{}\\]", path) or path in (".", "/"):
                raise GateError(name + ": affects must use exact repository-relative paths")
            entries.add(path.rstrip("/"))
        result[name] = entries
    return result


def body(text):
    text = re.sub(r"\A---\r?\n.*?\r?\n---(?:\r?\n|$)", "", text, count=1, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    return re.sub(r"\s+", "", text)


def affected(changed, owned):
    # Tests and generated files are deliberately NOT silently exempted. Authors
    # can give a scoped reason; changing tests can change a documented contract.
    return {path for path in changed if not path.endswith(".md") and
            any(path == owner or path.startswith(owner + "/") for owner in owned)}


def waived(message, document):
    # Git trailer syntax; a bare "none" or an unrelated document never suffices.
    trailers = re.findall(r"^Doc-Impact: none ([^\s|]+) \| (.+)$", message, re.M)
    return any(path == document and len(reason.strip()) >= 12 and reason.strip().lower() not in
               ("no documentation change", "not applicable", "no impact") for path, reason in trailers)


def scope(args):
    if args.staged:
        base = git("rev-parse", "--verify", "HEAD^{commit}").strip()
        return base, "index", paths("diff", "--cached", "--no-renames", "--name-only", "-z", base)
    if args.base:
        base = git("rev-parse", "--verify", args.base + "^{commit}").strip()
        head = git("rev-parse", "--verify", (args.head or "HEAD") + "^{commit}").strip()
        if args.merge_base:
            bases = git("merge-base", "--all", base, head).splitlines()
            if len(bases) != 1:
                raise GateError("comparison requires exactly one merge-base")
            base = bases[0]
        return base, head, paths("diff", "--no-renames", "--name-only", "-z", base, head)
    base = git("rev-parse", "--verify", "HEAD^{commit}").strip()
    changed = paths("diff", "--no-renames", "--name-only", "-z", base)
    return base, "worktree", changed | paths("ls-files", "--others", "--exclude-standard", "-z")


def ci_args(parser, args):
    # CI supplies the event base, never silently HEAD~1 (which misses multi-commit pushes).
    if not args.ci:
        return
    if args.staged or args.base or args.message_file:
        parser.error("--ci cannot be combined with a manual scope")
    args.base = os.environ.get("DOC_SYNC_BASE") or os.environ.get("CI_MERGE_REQUEST_DIFF_BASE_SHA") or os.environ.get("CI_COMMIT_BEFORE_SHA")
    args.head = os.environ.get("DOC_SYNC_HEAD") or os.environ.get("CI_COMMIT_SHA") or "HEAD"
    # 2026-09-27 异构双审发现：零基准有回退，「基准存在但不可达」没有。force-push 后
    # GitHub 的 event.before 指向已被丢弃的提交，actions/checkout 不拉游离对象，门禁会以
    # 与文档责任无关的 rev-parse 文案让 main 上唯一必需的检查变红。退回默认分支的
    # merge-base；默认分支也解析不出时仍然 fail closed。手工 --base 不走这条回退。
    if not args.base or set(args.base) == {"0"} or not reachable(args.base):
        target = os.environ.get("CI_MERGE_REQUEST_TARGET_BRANCH_NAME") or os.environ.get("CI_DEFAULT_BRANCH") or os.environ.get("DOC_SYNC_DEFAULT_BRANCH")
        if not target:
            raise GateError("CI event has no comparison base/default branch; refusing a silent skip")
        args.base, args.merge_base = "origin/" + target, True
    if os.environ.get("DOC_SYNC_MERGE_BASE") == "1":
        args.merge_base = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    selectors = parser.add_mutually_exclusive_group()
    selectors.add_argument("--staged", action="store_true")
    selectors.add_argument("--base", help="explicit comparison base; direct tree diff unless --merge-base")
    selectors.add_argument("--ci", action="store_true", help="use CI event base; no network/fetch")
    parser.add_argument("--head", help="fixed head revision (default HEAD with --base)")
    parser.add_argument("--merge-base", action="store_true", help="compare merge-base (for PRs/new branches)")
    parser.add_argument("--message-file", help="commit-msg hook: permits exact reasoned Doc-Impact trailer")
    args = parser.parse_args()
    if args.head and not args.base:
        parser.error("--head requires --base; --ci takes its head from event variables")
    if args.message_file and not args.staged:
        parser.error("--message-file requires --staged")
    if args.merge_base and not (args.base or args.ci):
        parser.error("--merge-base requires --base or --ci")
    message = Path(args.message_file).read_text() if args.message_file else ""
    os.chdir(git("rev-parse", "--show-toplevel").strip())
    ci_args(parser, args)
    base, head, changed = scope(args)
    before_files, after_files = tree_files(base), tree_files(head)
    documents = lambda files, rev: {p: read_at(p, rev, files) for p in files
                                    if p.endswith(".md") and p.startswith(("context/", "docs/"))}
    before, after = documents(before_files, base), documents(after_files, head)
    old_map, new_map = mappings(before), mappings(after)
    # Old + new owners stop deleting the opt-in/mapping from bypassing the gate.
    owners = {doc: old_map.get(doc, set()) | new_map.get(doc, set()) for doc in old_map.keys() | new_map.keys()}
    for doc, entries in new_map.items():
        for path in entries:
            if not any(p == path or p.startswith(path + "/") for p in after_files):
                raise GateError(doc + ": missing affects path " + path)
    commits = None
    failures = []
    checked = 0
    for doc, owned in sorted(owners.items()):
        impacted = affected(changed, owned)
        if not impacted:
            continue
        checked += 1
        # Deletion is not synchronization: retire with a reason/replacement.
        if doc in changed and body(after.get(doc, "")) and body(before.get(doc, "")) != body(after.get(doc, "")):
            continue
        if args.message_file and waived(message, doc):
            print("doc-sync: reasoned exception " + doc)
            continue
        if head not in ("index", "worktree"):
            if commits is None:
                commits = []
                for commit in git("rev-list", base + ".." + head).splitlines():
                    files = paths("diff-tree", "--root", "--no-commit-id", "--name-only", "--no-renames", "-r", "-m", "-z", commit)
                    commits.append((files, git("show", "-s", "--format=%B", commit)))
            touching = [(files, msg) for files, msg in commits if affected(files, owned)]
            if touching and all(waived(msg, doc) for _, msg in touching):
                print("doc-sync: reasoned exceptions cover source commits for " + doc)
                continue
        failures.append(f"[DOC-SYNC] {doc}: review required for {', '.join(sorted(impacted)[:5])}")
    print(f"doc-sync: base={base} head={head}; {len(changed)} changed paths; {checked}/{len(owners)} registered documents affected")
    if failures:
        print("\n".join(failures))
        print("Update the owned document, or add a reviewed commit trailer: Doc-Impact: none <document> | <specific reason>")
    return int(bool(failures))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (GateError, OSError, UnicodeError) as error:
        print("doc-sync: " + str(error), file=sys.stderr)
        sys.exit(2)
