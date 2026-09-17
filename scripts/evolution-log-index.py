#!/usr/bin/env python3
"""evolution-log 索引生成与一致性检查。

evolution-log 按月分卷：context/harness-framework/evolution-log/YYYY-MM.md 存条目（每条 `### YYYY-MM-DD 标题`），
context/harness-framework/evolution-log.md 只保留「解决什么 / 写法」与一份**由本脚本生成**的索引——
每条一行，按日期倒序，链接到卷内标题。索引手写必漂移，所以只许生成、由门禁比对。

用法：
  scripts/evolution-log-index.py --write   重新生成索引段（改完卷文件后跑）
  scripts/evolution-log-index.py --check   索引段与卷标题不一致、或条目放错卷即退出码 1（verify-context.sh 调用）
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "context/harness-framework/evolution-log.md"
VOLUMES = ROOT / "context/harness-framework/evolution-log"
START = "<!-- evolog-index:start -->"
END = "<!-- evolog-index:end -->"
HEADING = re.compile(r"^### (20\d\d-\d\d-\d\d)\s*(.+?)\s*$")  # 日期后可无空格(存量有一条「2026-08-23（补记）」)


def slug(title: str) -> str:
    """GitHub 风格的标题锚点：小写、去标点、空格转连字符；CJK 原样保留。"""
    s = title.strip().lower()
    s = re.sub(r"[^\w\s\-\u4e00-\u9fff]", "", s)
    s = re.sub(r"\s+", "-", s)
    return s


def entries() -> list[tuple[str, str, str, str]]:
    """返回 (date, title, volume_relpath, error) 列表；error 非空表示条目放错卷。"""
    out = []
    for vol in sorted(VOLUMES.glob("*.md")):
        month = vol.stem
        for line in vol.read_text(encoding="utf-8").splitlines():
            m = HEADING.match(line)
            if not m:
                continue
            date, title = m.group(1), m.group(2)
            err = "" if date.startswith(month) else f"条目 {date} 放在 {vol.name} 卷里(应在 {date[:7]}.md)"
            out.append((date, title, f"evolution-log/{vol.name}", err))
    out.sort(key=lambda e: e[0], reverse=True)
    return out


def render(es) -> str:
    lines = [START, ""]
    for date, title, rel, _ in es:
        lines.append(f"- {date} [{title}]({rel}#{slug(f'{date} {title}')})")
    lines += ["", END]
    return "\n".join(lines)


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "--check"
    if not VOLUMES.is_dir():
        print(f"evolution-log-index: 卷目录不存在 {VOLUMES}", file=sys.stderr)
        return 1
    es = entries()
    bad = [e[3] for e in es if e[3]]
    for b in bad:
        print(f"evolution-log-index: {b}", file=sys.stderr)
    text = INDEX.read_text(encoding="utf-8")
    if START not in text or END not in text:
        print(f"evolution-log-index: {INDEX.name} 缺索引标记 {START} / {END}", file=sys.stderr)
        return 1
    head, rest = text.split(START, 1)
    _, tail = rest.split(END, 1)
    new_text = head + render(es) + tail
    if mode == "--write":
        if new_text != text:
            INDEX.write_text(new_text, encoding="utf-8")
            print(f"evolution-log-index: 已重写索引({len(es)} 条)")
        else:
            print(f"evolution-log-index: 索引已是最新({len(es)} 条)")
        return 1 if bad else 0
    if mode == "--check":
        if new_text != text:
            print("evolution-log-index: 索引段与卷标题不一致——跑 scripts/evolution-log-index.py --write", file=sys.stderr)
            return 1
        return 1 if bad else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
