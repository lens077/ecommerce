#!/usr/bin/env python3
"""path-refs.py — 文档正文里反引号写的仓库路径必须存在。

verify-context.sh 的 [DEAD-LINK] 只查 Markdown 链接 `[x](y)`，查不到正文里的
`backend/pkg/types/decimal.go` 这种写法。2026-09-22 Repowise 首轮扫出 50 条失效引用，
47 条正是这一类：文件早已删除，文档还在教人去改它，而 [DEAD-LINK] 全程是绿的。
Repowise 只为这一项检查就要背约 130 个 Python 依赖，故把判定搬回这里（决策见
context/decisions/implemented/2026-09-24-path-refs-in-verify-context.md）。

判定刻意保守，宁可漏报不可误报（误报会让人删断言）：
  - 只看含 `/` 的 token，且首段必须是仓库根下真实存在的目录；
    `services/cart/...`（相对 backend/）、`../control-tower/...`（同级仓）一律不看
  - 含 glob/占位符（* ? < > { } [ ] $ ~ , ...）的不看
  - 行尾 `:行号` 与 `#锚点` 先剥掉
  - 被 .gitignore 覆盖的路径放行：它们是「只在本机」的文件（如 configs/dev.yml），
    文档提到它们是在说明本地约定，CI 的 fresh clone 里本来就不存在
  - 同一行写明「已删除 / 已退役 / 不再有 / 不新建」等的放行：那是历史或否定陈述，
    逼人删掉只会丢失踩坑记录（与 [RETIRED] 的横幅放行同一思路）
  - 路径前紧挨「X 仓」「repo」「原」的放行：说的是同级仓或搬家前的旧位置
  - `pkg/searchindex.Doc` 这种「包.符号」写法，包目录存在即放行
存在性按 **git 索引**判定（被跟踪的文件及其父目录），不按磁盘：2026-09-24 首版按磁盘判，
本机生成、未被 gitignore 的 `frontend/.vite-hooks/_` 让本机绿、fresh clone 红——而
verify-context 是 main 上唯一必需的 CI 检查。本机生成的目录要写进 .gitignore，由上一条放行。
索引为空时（canary 沙箱只 git init 不 add）退回按磁盘判定。
扫描范围与 [DEAD-LINK] 相同；docs/progress-archive/ 是不可变归档，历史引用不改写，跳过。
存量违规登记在 scripts/context-pathref-baseline.txt（反向棘轮，由 verify-context.sh 执行）。

用法：
  scripts/path-refs.py check   # 每条违规输出 `<文件>\t<路径>`，退出码恒为 0（由调用方计数）
  scripts/path-refs.py list    # 输出所有候选路径（去重），供 canary 在沙箱里放桩
"""
import os
import re
import subprocess
import sys

ROOT_FILES = ["AGENTS.md", "README.md", "STACK.md", "TODO.md"]
SCAN_DIRS = ["context", "docs"]
SKIP_PREFIXES = ("docs/progress-archive/",)
CODE_SPAN = re.compile(r"`([^`\n]+)`")
TOKEN_OK = re.compile(r"^[A-Za-z0-9_.@+\-/]+$")
SUFFIX_LINE = re.compile(r":\d+(-\d+)?$")
PLACEHOLDERS = ("...", "xxx", "YYYY", "XXXX")
HISTORY_WORDS = (
    "已删除", "已删", "删除", "删掉", "退役", "移除", "不再", "不新建", "已迁",
    "removed", "deleted", "retired",
)
QUALIFIER = re.compile(r"(仓|repo|原)\s*$")


def scan_files():
    files = [f for f in ROOT_FILES if os.path.isfile(f)]
    for d in SCAN_DIRS:
        for dirpath, _, names in os.walk(d):
            for n in names:
                if n.endswith(".md"):
                    p = os.path.join(dirpath, n)
                    if not p.startswith(SKIP_PREFIXES):
                        files.append(p)
    return sorted(files)


def strip_fences(lines):
    """与 verify-context.sh 的 _strip_fences 同一判定：按围栏长度配对。"""
    fence = 0
    for line in lines:
        m = re.match(r"^[ \t]*(`+)", line)
        if m and len(m.group(1)) >= 3:
            n = len(m.group(1))
            if fence == 0:
                fence = n
                continue
            if n >= fence:
                fence = 0
                continue
        if fence == 0:
            yield line


def normalize(token, top_dirs):
    t = token.strip()
    if t.startswith("./"):
        t = t[2:]
    t = t.split("#", 1)[0]
    t = SUFFIX_LINE.sub("", t)
    if "/" not in t or not TOKEN_OK.match(t):
        return None
    if any(p in t for p in PLACEHOLDERS) or "//" in t:
        return None
    parts = t.rstrip("/").split("/")
    if ".." in parts or parts[0] not in top_dirs:
        return None
    return t.rstrip("/")


def candidates():
    """产出 (文件, 路径, 是否豁免)。"""
    top_dirs = {e for e in os.listdir(".") if os.path.isdir(e) and e != ".git"}
    for f in scan_files():
        with open(f, encoding="utf-8", errors="ignore") as fh:
            body = strip_fences(fh.read().split("\n"))
        for line in body:
            historical = any(w in line for w in HISTORY_WORDS)
            for m in CODE_SPAN.finditer(line):
                p = normalize(m.group(1), top_dirs)
                if not p:
                    continue
                qualified = bool(QUALIFIER.search(line[max(0, m.start() - 12):m.start()]))
                yield f, p, historical or qualified


def tracked_paths():
    """git 索引里的文件与其全部父目录；索引为空时返回 None（调用方退回按磁盘判定）。"""
    r = subprocess.run(["git", "ls-files", "-z"], capture_output=True, text=True)
    files = [f for f in r.stdout.split("\0") if f]
    if not files:
        return None
    known = set(files)
    for f in files:
        parts = f.split("/")
        for i in range(1, len(parts)):
            known.add("/".join(parts[:i]))
    return known


def make_exists():
    known = tracked_paths()
    present = (lambda p: os.path.exists(p)) if known is None else (lambda p: p in known)

    def exists(p):
        if present(p):
            return True
        head, _, tail = p.rpartition("/")
        return "." in tail and present(os.path.join(head, tail.split(".", 1)[0]))

    return exists


def ignored(paths):
    """批量问 git 哪些路径被 .gitignore 覆盖（路径不存在也能判定）。

    每个路径同时带上 `路径/` 一起问：`tools/repowise/.venv/` 这种只匹配目录的模式，
    在路径不存在时 git 不知道它是目录，不带斜杠就判不中（fresh clone 里实测）。
    """
    if not paths:
        return set()
    r = subprocess.run(
        ["git", "check-ignore", "--no-index", "--stdin"],
        input="\n".join(q for p in paths for q in (p, p + "/")),
        capture_output=True, text=True,
    )
    return {line.rstrip("/") for line in r.stdout.split("\n") if line}


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    triples = sorted(set(candidates()))
    if mode == "list":
        for p in sorted({p for _, p, _ in triples}):
            print(p)
        return
    exists = make_exists()
    missing = sorted({(f, p) for f, p, exempt in triples if not exempt and not exists(p)})
    skip = ignored(sorted({p for _, p in missing}))
    for f, p in missing:
        if p not in skip:
            print(f"{f}\t{p}")


if __name__ == "__main__":
    main()
