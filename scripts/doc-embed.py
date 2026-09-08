#!/usr/bin/env python3
"""doc-embed.py — 文档里的代码片段从源生成，不再手抄。

参照 deepseek-harness 的 gen-config-catalog / gen-cordis-catalog：Markdown 里的代码块是
源码的**投影**，真相源是源码；人只改源，投影由本脚本重写，`--check` 在门禁里比对。

用法:
  scripts/doc-embed.py             # 重写所有受管代码块（改了源之后跑一次）
  scripts/doc-embed.py --check     # 只比对不改写；有漂移 → 列出并退出码 1（verify-context [EMBED]）
  scripts/doc-embed.py --list      # 列出所有指令及其解析结果

Markdown 写法（指令行 + 围栏块 + 结束行；围栏块内容整段由脚本生成，手改会被覆盖）:

  <!-- embed: backend/services/order/internal/data/migrations/00001_order.sql sql:table orders.order_item -->
  ```sql
  ...生成...
  ```
  <!-- /embed -->

指令语法: `<!-- embed: <仓库相对路径> [<选择器>] [lang=<围栏语言>] -->`
选择器（不支持行号——行号必漂移）:
  （无）                      整个文件
  sql:table <schema.name>     `CREATE TABLE [IF NOT EXISTS] <name>` 到分号为止
  sql:type <schema.name>      `CREATE TYPE <name>` 到分号为止
  proto:message <Name>        `message Name {` 到配对的 `}`（含紧邻上方的 // 注释）
  proto:enum <Name> / proto:service <Name>   同上
  go:func <Name> / go:type <Name>           声明行到配对的 `}`（含紧邻上方的 // 注释；方法写方法名即可）
  region <name>               源文件中 `doc:begin <name>` … `doc:end <name>` 两行标记之间（标记行不输出；任何语言）
围栏语言默认按扩展名推断（.sql→sql .proto→protobuf .go→go .ts→ts .yaml→yaml …），`lang=` 覆盖。

失败即红，不静默跳过：文件不存在 / 符号找不到 / 指令没有闭合 / 围栏块缺失都是错误。
指令行的缩进决定生成块的缩进（列表项里的代码块也能管）。
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

DIRECTIVE = re.compile(r'^(?P<indent>\s*)<!--\s*embed:\s*(?P<spec>.+?)\s*-->\s*$')
END = re.compile(r'^\s*<!--\s*/embed\s*-->\s*$')
FENCE = re.compile(r'^\s*(`{3,})\s*(\S*)\s*$')
LANG_BY_EXT = {
    '.sql': 'sql', '.proto': 'protobuf', '.go': 'go', '.ts': 'ts', '.tsx': 'tsx', '.js': 'js',
    '.yaml': 'yaml', '.yml': 'yaml', '.json': 'json', '.toml': 'toml', '.sh': 'bash', '.py': 'python',
    '.mjs': 'js', '.ini': 'ini', '.env': 'ini', '.md': 'markdown', 'Makefile': 'make', 'Dockerfile': 'dockerfile',
}


class EmbedError(Exception):
    pass


def repo_root() -> Path:
    out = subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True, check=True).stdout
    return Path(out.strip())


def tracked_markdown(root: Path) -> list[Path]:
    # 含未跟踪文件:canary 沙箱是刚 git init 的空索引,只看 --cached 会把它当成没有任何指令
    out = subprocess.run(
        ['git', '-c', 'core.quotepath=off', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
        cwd=root, capture_output=True, text=True, check=True,
    ).stdout
    return [root / f for f in out.split('\0') if f.endswith('.md') and '/node_modules/' not in f and not f.startswith('backend/third_party')]


# ── 选择器 ──────────────────────────────────────────────────────────────

def leading_comments(lines: list[str], index: int, marker: str) -> int:
    """从 index 往上吃紧邻的 marker 注释行，返回起始下标。"""
    start = index
    while start > 0 and lines[start - 1].strip().startswith(marker):
        start -= 1
    return start


def brace_block(lines: list[str], start: int, where: str) -> list[str]:
    depth = 0
    seen = False
    for i in range(start, len(lines)):
        code = re.sub(r'//.*$', '', lines[i])
        code = re.sub(r'"(?:\\.|[^"\\])*"', '""', code)
        depth += code.count('{') - code.count('}')
        if '{' in code:
            seen = True
        if seen and depth == 0:
            return lines[start:i + 1]
    raise EmbedError(f'{where}: 找不到配对的右花括号')


def select_sql(lines: list[str], kind: str, name: str, where: str) -> list[str]:
    head = {
        'table': re.compile(r'^\s*CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?' + re.escape(name) + r'\b', re.I),
        'type': re.compile(r'^\s*CREATE\s+TYPE\s+' + re.escape(name) + r'\b', re.I),
    }[kind]
    for i, line in enumerate(lines):
        if head.match(line):
            start = leading_comments(lines, i, '--')
            for j in range(i, len(lines)):
                if re.sub(r'--.*$', '', lines[j]).rstrip().endswith(';'):
                    return lines[start:j + 1]
            raise EmbedError(f'{where}: `{name}` 的语句没有分号结尾')
    raise EmbedError(f'{where}: 源文件里没有 CREATE {kind.upper()} {name}')


def select_proto(lines: list[str], kind: str, name: str, where: str) -> list[str]:
    head = re.compile(r'^\s*' + kind + r'\s+' + re.escape(name) + r'\s*\{')
    for i, line in enumerate(lines):
        if head.match(line):
            start = leading_comments(lines, i, '//')
            return lines[start:i] + brace_block(lines, i, where)
    raise EmbedError(f'{where}: 源文件里没有 {kind} {name}')


def select_go(lines: list[str], kind: str, name: str, where: str) -> list[str]:
    if kind == 'func':
        head = re.compile(r'^func\s+(?:\([^)]*\)\s*)?' + re.escape(name) + r'\s*[(\[]')
    else:
        head = re.compile(r'^type\s+' + re.escape(name) + r'\b')
    for i, line in enumerate(lines):
        if head.match(line):
            start = leading_comments(lines, i, '//')
            if '{' not in line and kind == 'type':  # 单行类型别名
                return lines[start:i + 1]
            return lines[start:i] + brace_block(lines, i, where)
    raise EmbedError(f'{where}: 源文件里没有 {kind} {name}')


def select_region(lines: list[str], name: str, where: str) -> list[str]:
    begin = end = None
    for i, line in enumerate(lines):
        if re.search(r'doc:begin\s+' + re.escape(name) + r'\b', line):
            begin = i
        elif re.search(r'doc:end\s+' + re.escape(name) + r'\b', line):
            end = i
            break
    if begin is None or end is None or end <= begin:
        raise EmbedError(f'{where}: 源文件里没有成对的 doc:begin/doc:end {name}')
    return lines[begin + 1:end]


def dedent(block: list[str]) -> list[str]:
    indents = [len(l) - len(l.lstrip()) for l in block if l.strip()]
    cut = min(indents) if indents else 0
    return [l[cut:] if l.strip() else '' for l in block]


def resolve(root: Path, spec: str, where: str) -> tuple[list[str], str]:
    tokens = spec.split()
    if not tokens:
        raise EmbedError(f'{where}: 指令为空')
    lang = None
    if tokens and tokens[-1].startswith('lang='):
        lang = tokens.pop()[len('lang='):]
    path = root / tokens[0]
    if not path.is_file():
        raise EmbedError(f'{where}: 源文件不存在 {tokens[0]}')
    lines = path.read_text().rstrip('\n').split('\n')
    selector = tokens[1:]
    if not selector:
        block = lines
    elif len(selector) == 2 and selector[0].startswith('sql:'):
        block = select_sql(lines, selector[0][4:], selector[1], where)
    elif len(selector) == 2 and selector[0].startswith('proto:'):
        block = select_proto(lines, selector[0][6:], selector[1], where)
    elif len(selector) == 2 and selector[0].startswith('go:'):
        block = select_go(lines, selector[0][3:], selector[1], where)
    elif len(selector) == 2 and selector[0] == 'region':
        block = select_region(lines, selector[1], where)
    else:
        raise EmbedError(f'{where}: 无法识别的选择器 {" ".join(selector)}')
    lang = lang or LANG_BY_EXT.get(path.suffix) or LANG_BY_EXT.get(path.name) or ''
    return dedent(block), lang


# ── Markdown 改写 ────────────────────────────────────────────────────────

def render(md: Path, root: Path) -> tuple[list[str], list[str]]:
    """返回 (新内容行, 指令描述列表)。"""
    src = md.read_text().split('\n')
    out: list[str] = []
    seen: list[str] = []
    i = 0
    while i < len(src):
        m = DIRECTIVE.match(src[i])
        if not m:
            out.append(src[i])
            i += 1
            continue
        where = f'{md.relative_to(root)}:{i + 1}'
        indent = m.group('indent')
        block, lang = resolve(root, m.group('spec'), where)
        # 指令后必须紧跟围栏块，然后是结束行
        j = i + 1
        while j < len(src) and not src[j].strip():
            j += 1
        fence = FENCE.match(src[j]) if j < len(src) else None
        if fence is None:
            raise EmbedError(f'{where}: 指令下方必须紧跟 ``` 围栏块')
        ticks = fence.group(1)
        k = j + 1
        while k < len(src) and src[k].strip() != ticks:
            k += 1
        if k >= len(src):
            raise EmbedError(f'{where}: 围栏块没有闭合')
        e = k + 1
        while e < len(src) and not src[e].strip():
            e += 1
        if e >= len(src) or not END.match(src[e]):
            raise EmbedError(f'{where}: 围栏块之后必须是 <!-- /embed -->')
        out.append(src[i])
        out.append(f'{indent}{ticks}{lang}')
        out.extend(f'{indent}{l}' if l else '' for l in block)
        out.append(f'{indent}{ticks}')
        out.append(src[e])
        seen.append(f'{where}  {m.group("spec")}  → {len(block)} 行')
        i = e + 1
    return out, seen


KNOWN_FLAGS = {'--check', '--list'}


def usage(out=sys.stderr) -> None:
    print('用法: scripts/doc-embed.py [--check] [--list]', file=out)
    print('  （无参数）  重写所有受管代码块', file=out)
    print('  --check     只比对不改写；有漂移退出码 1', file=out)
    print('  --list      列出所有指令及其解析结果', file=out)


def main(argv: list[str]) -> int:
    # 未知参数一律拒绝：这是一个会改文件的脚本，把 --help 或拼错的 flag 当成
    # 「无参数=重写」静默执行过一次（2026-09-08 实测），必须报错退出。
    if any(a in ('-h', '--help') for a in argv):
        usage(sys.stdout)
        return 0
    unknown = [a for a in argv if a not in KNOWN_FLAGS]
    if unknown:
        print(f'doc-embed: 未知参数 {unknown}', file=sys.stderr)
        usage()
        return 2
    check = '--check' in argv
    listing = '--list' in argv
    root = repo_root()
    stale: list[str] = []
    errors: list[str] = []
    total = 0
    for md in tracked_markdown(root):
        text = md.read_text()
        if '<!-- embed:' not in text:
            continue
        try:
            out, seen = render(md, root)
        except EmbedError as err:
            errors.append(str(err))
            continue
        total += len(seen)
        if listing:
            print('\n'.join(seen))
        new = '\n'.join(out)
        if new != text:
            rel = md.relative_to(root)
            if check:
                stale.append(str(rel))
            else:
                md.write_text(new)
                print(f'doc-embed: 重写 {rel}')
    for err in errors:
        print(f'doc-embed: [EMBED] {err}', file=sys.stderr)
    for rel in stale:
        print(f'doc-embed: [EMBED] {rel} 与源码不一致——运行 scripts/doc-embed.py 重新生成', file=sys.stderr)
    if errors or stale:
        return 1
    print(f'doc-embed: OK（{total} 个受管代码块{"，均与源一致" if check else "已重写"}）')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
