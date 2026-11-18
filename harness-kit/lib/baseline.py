#!/usr/bin/env python3
"""基线引擎：只降不升 + 陈旧行清理（反向棘轮）。

为什么需要基线：存量违规不能一夜清零，但也不能让它成为永久豁免。
基线文件每行一条 `<文件>\t<违规内容>`（# 开头是注释）。语义：

- filter：只报告「不在基线里」的违规 → 新增违规必红。
- stale：基线里「本轮已不再违规」的行 → 必须删掉，否则豁免会永久腐烂。

用法：
  python3 lib/baseline.py filter --baseline B --hits H   # 输出未登记的违规行
  python3 lib/baseline.py stale  --baseline B --hits H   # 输出已失效的基线条目
  python3 lib/baseline.py init   --baseline B --hits H   # 首次登记（文件已存在时不覆盖）

H 是「每行一条违规」的临时文件；B 不存在时视为空基线（第一次跑就是全红，符合预期）。
"""
import argparse
import os
import sys

KEEP_HEADER = "# 基线：只登记存量违规，修好后必须删行（反向棘轮）。每行 <文件>\\t<违规内容>。"


def read_lines(path):
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            out.append(line)
    return out


def read_hits(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        return [ln.rstrip("\n") for ln in fh if ln.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["filter", "stale", "init"])
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--hits", required=True)
    args = ap.parse_args()

    hits = read_hits(args.hits)
    base = read_lines(args.baseline)

    if args.cmd == "filter":
        base_set = set(base)
        for h in hits:
            if h not in base_set:
                print(h)
        return 0

    if args.cmd == "stale":
        hit_set = set(hits)
        for b in base:
            if b not in hit_set:
                print(b)
        return 0

    # init：只写一次；已存在的基线不覆盖，避免把新违规顺手登记成存量。
    if os.path.exists(args.baseline):
        print("baseline: 已存在，未覆盖", file=sys.stderr)
        return 0
    os.makedirs(os.path.dirname(args.baseline) or ".", exist_ok=True)
    with open(args.baseline, "w", encoding="utf-8") as fh:
        fh.write(KEEP_HEADER + "\n")
        for h in sorted(set(hits)):
            fh.write(h + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
