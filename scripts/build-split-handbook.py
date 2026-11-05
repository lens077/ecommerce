#!/usr/bin/env python3
"""Sync the Markdown documents embedded in ecommerce-software-engineering-split-demo.html.

Regenerates the JSON block between the DOC-EMBED markers from the actual repo
files, so the self-contained (Plan A) right-pane reader never drifts from the
repo. Run after editing any embedded document:

    python3 scripts/build-split-handbook.py

The script fails (exit 1) if an embedded file is missing or the rewritten
content would not round-trip byte-identically through JSON.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "ecommerce-software-engineering-split-demo.html"

# Keep in sync with the doc-pane links in the HTML sources section.
EMBEDDED_DOCS = [
    "AGENTS.md",
    "STACK.md",
    "TODO.md",
    "README.md",
    "docs/TECH.md",
    "docs/SCAFFOLD.md",
    "docs/DEVOPS.md",
    "docs/TESTING.md",
    "docs/OKTETO.md",
    "frontend/README.md",
    "context/INDEX.md",
    "docs/design/README.md",
]

START = "<!--DOC-EMBED:START-->"
END = "<!--DOC-EMBED:END-->"


def main() -> int:
    docs: dict[str, str] = {}
    for rel in EMBEDDED_DOCS:
        path = ROOT / rel
        if not path.is_file():
            print(f"FAIL: embedded doc missing: {rel}", file=sys.stderr)
            return 1
        docs[rel] = path.read_text(encoding="utf-8")

    payload = json.dumps(docs, ensure_ascii=False).replace("</", "<\\/")

    html = HTML.read_text(encoding="utf-8")
    if START not in html or END not in html:
        print("FAIL: DOC-EMBED markers not found in HTML", file=sys.stderr)
        return 1
    head, _, rest = html.partition(START)
    _, _, tail = rest.partition(END)
    updated = head + START + "\n" + payload + "\n" + END + tail

    # Round-trip check: the JSON inside the script tag must parse back to the
    # exact file contents, including any "</" we escaped for script safety.
    marker_start = updated.index(START) + len(START)
    marker_end = updated.index(END)
    raw = updated[marker_start:marker_end].strip()
    round_trip = json.loads(raw.replace("<\\/", "</"))
    for rel, text in docs.items():
        if round_trip.get(rel) != text:
            print(f"FAIL: round-trip mismatch for {rel}", file=sys.stderr)
            return 1

    HTML.write_text(updated, encoding="utf-8")
    print(f"OK: embedded {len(docs)} docs, {sum(len(v) for v in docs.values())} bytes -> {HTML.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
