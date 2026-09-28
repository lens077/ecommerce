#!/usr/bin/env python3
"""Generate a secret-free rule/probe catalog from sibling kubernetes sources.

Run with the existing kubernetes/.venv-tools Python (PyYAML). Does not call the
network, kubectl, read credentials, or import executable component scripts.

--verify-body is stdlib-only (verify-context [GENERATED] runs it in CI): it proves
the committed catalog was not hand-edited. It cannot see source drift in the
sibling repo; that still needs --check against a kubernetes checkout.
"""
import argparse
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TARGET = ROOT / 'docs/observability/alerting-rules.md'
# 2026-09-27 push 前异构双审发现：本文自称「自动生成；不要手改」，但 --check 依赖同级
# kubernetes 仓与 PyYAML，本仓 CI 永远跑不了它；复核时目录已落后上游 3 条告警而无人发现。
# 正文摘要让 CI 至少能用标准库抓住手改；定义与生成放在同一文件，避免两处漂移。
BODY_LINE = re.compile(r'^> 正文 SHA-256：`([0-9a-f]{64})`')


def body_digest(text):
    kept = [line for line in text.split('\n') if not BODY_LINE.match(line)]
    return hashlib.sha256('\n'.join(kept).encode('utf-8')).hexdigest()


def verify_body(text):
    recorded = [m.group(1) for m in map(BODY_LINE.match, text.split('\n')) if m]
    if len(recorded) != 1:
        return 'alerting-rules.md 缺少或重复正文摘要行；改源码后用生成器重新生成'
    if recorded[0] != body_digest(text):
        return 'alerting-rules.md 正文与摘要不符（被手改）；改同级 kubernetes 仓源码后重新生成'
    return None


def inline(value):
    return str(value).replace('|', '\\|').replace('\n', ' ')


def generate(kubernetes, date):
    import yaml  # 惰性导入：--verify-body 必须能在无 PyYAML 的 CI 里运行
    rule_root = kubernetes / 'components/vmalert/rules'
    files = sorted(rule_root.glob('*.yml'))
    if not files:
        raise ValueError('no rule sources found')
    sources = [(p.relative_to(kubernetes).as_posix(), p.read_bytes()) for p in files]
    probe_path = kubernetes / 'components/gatus/endpoints.yaml'
    probe_bytes = probe_path.read_bytes()
    sources.append((probe_path.relative_to(kubernetes).as_posix(), probe_bytes))
    digest = hashlib.sha256()
    for name, body in sources:
        digest.update(name.encode() + b'\0' + body + b'\0')
    rows = []
    counts = []
    for p in files:
        groups = yaml.safe_load(p.read_text())['groups']
        alerts = records = 0
        for group in groups:
            for rule in group['rules']:
                alerts += 'alert' in rule
                records += 'record' in rule
                rows.append((p.name, group, rule))
        counts.append((p.name, alerts, records))
    probes = yaml.safe_load(probe_bytes)['endpoints']
    lines = ['# 告警规则与 Gatus 探针目录', '',
             '> 自动生成；不要手改。本目录是源码投影，不是 live 配置或送达证明。',
             f'> 生成基准日期：{date}；来源：同级 kubernetes 仓。',
             f'> 源码集合 SHA-256：`{digest.hexdigest()}`。', '',
             '策略、账号与运维边界见 [告警与通知手册](alerting-notification.md)。', '',
             '## 再生成与漂移检查', '',
             '在 ecommerce 仓根目录执行；依赖同级 kubernetes checkout 与已有 PyYAML 工具环境。',
             '脚本只读取规则和探针 YAML，不读 Secret、env、数据库或线上 API。', '',
             '```bash',
             f'../kubernetes/.venv-tools/bin/python scripts/generate-alerting-catalog.py --date {date}',
             f'../kubernetes/.venv-tools/bin/python scripts/generate-alerting-catalog.py --date {date} --check',
             '```', '',
             '发布规则或探针变更时，用本次维护日期再生成并运行 `--check`；日期相同的重复生成字节一致。',
             '`--kubernetes PATH` 可指定 checkout。`--check` 非零表示本文与该 checkout 的源码不一致；',
             '它不检查集群内存加载态，部署后仍须核对 vmalert rules API 与 Gatus 配置。',
             'CI 的 verify-context 只跑 `--verify-body`（标准库）：它能发现手改，发现不了同级仓源码漂移；',
             '后者只有上面的 `--check` 能发现，改了同级仓规则或探针就要在本仓再生成。', '',
             '## 规则文件总览', '',
             '| 源文件（components/vmalert/rules） | alert | record | SHA-256 |',
             '|---|---:|---:|---|']
    for filename, alerts, records in counts:
        body = (rule_root / filename).read_bytes()
        lines.append(f'| {filename} | {alerts} | {records} | `{hashlib.sha256(body).hexdigest()}` |')
    lines += [f'| **合计** | **{sum(x[1] for x in counts)}** | **{sum(x[2] for x in counts)}** | |', '',
              '## 逐条规则', '',
              'severity 是规则源标签；critical/crit 仍保留其级别，由 bridge 映射 core/page priority 4。',
              '其余 severity 进入 ticket（Watchdog 在 AM 先路由 null）。每条 expr 与全部 annotations 原样保留；',
              'description 中的操作是排障提示，不构成自动执行授权，也不代表其中历史措辞已逐条复验。', '']
    for index, (filename, group, rule) in enumerate(rows, 1):
        name = rule.get('alert') or rule['record']
        lines += [f'### {index}. {name}', '',
                  f'- 源码：同级 kubernetes 的 `components/vmalert/rules/{filename}`；组 `{group["name"]}`。',
                  f'- interval：`{group.get("interval", "继承 evaluationInterval")}`；for：`{rule.get("for", "0s")}`；keep_firing_for：`{rule.get("keep_firing_for", "0s")}`。',
                  f'- severity：`{rule.get("labels", {}).get("severity", "未设置")}`；类型：`{"alert" if "alert" in rule else "record"}`。',
                  '', '```promql', str(rule['expr']).rstrip(), '```', '', '```yaml',
                  yaml.safe_dump({'labels': rule.get('labels', {}), 'annotations': rule.get('annotations', {})},
                                 allow_unicode=True, sort_keys=False, width=120).rstrip(),
                  '```', '']
    lines += [f'## Gatus 探针（{len(probes)} 项）', '',
              '源码：同级 kubernetes 的 `components/gatus/endpoints.yaml`。本表保留实际 URL、完整 conditions、',
              'interval 和端点覆盖的失败/恢复阈值。Gatus 没有 PromQL `for`，用连续结果数实现观察窗口；',
              '窗口按第一次异常/成功观测到触发观测的 `(threshold - 1) × interval` 计算。',
              '周期 2m 的恢复窗口为 6m（不短于 5m），不是精确 5m；调度/请求耗时还会带来延迟。',
              '主配置 custom provider 默认 11/6，恢复通知开启、minimum-reminder-interval=0s（不重复提醒）。', '',
              '| 名称 / 分组 | URL | interval | 失败/恢复次数 | 观测窗口（故障/恢复） | 完整 conditions |',
              '|---|---|---|---|---|---|']
    for p in probes:
        alert = next(a for a in p['alerts'] if a['type'] == 'custom')
        fail, recover = alert.get('failure-threshold', 11), alert.get('success-threshold', 6)
        interval = p['interval']
        seconds = int(interval[:-1]) * {'s': 1, 'm': 60, 'h': 3600}[interval[-1]]
        window = f'{(fail-1)*seconds//60}m / {(recover-1)*seconds//60}m'
        conditions = '<br>'.join('`' + inline(c) + '`' for c in p['conditions'])
        lines.append(f'| {inline(p["name"])} / {inline(p["group"])} | `{inline(p["url"])}` | {interval} | {fail}/{recover} | {window} | {conditions} |')
    lines += ['', 'URL 仅包含受控健康检查/指标查询，不包含 topic、token、用户名密码或业务查询结果。',
              'TCP、匿名 HTTP、指标存在性各自证明的边界不同；探针成功不等于端到端业务成功。', '']
    text = '\n'.join(lines)
    lines.insert(5, f'> 正文 SHA-256：`{body_digest(text)}`（不含本行；手改正文会让 verify-context 的 [GENERATED] 变红）。')
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kubernetes', type=pathlib.Path, default=ROOT.parent / 'kubernetes')
    parser.add_argument('--date', help='Explicit YYYY-MM-DD documentation baseline')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--verify-body', action='store_true',
                        help='stdlib-only: fail if the committed catalog was hand-edited')
    args = parser.parse_args()
    target = TARGET
    if args.verify_body:
        if args.check or args.date:
            parser.error('--verify-body cannot be combined with --check/--date')
        if not target.exists():
            print('alerting-rules.md 不存在', file=sys.stderr)
            return 1
        problem = verify_body(target.read_text(encoding='utf-8'))
        if problem:
            print(problem, file=sys.stderr)
            return 1
        print('alerting catalog body matches its digest')
        return 0
    if not args.date:
        parser.error('--date is required unless --verify-body')
    import datetime
    datetime.date.fromisoformat(args.date)
    text = generate(args.kubernetes.resolve(), args.date)
    if args.check:
        if not target.exists() or target.read_text() != text:
            print('alerting catalog differs; regenerate from source', file=sys.stderr)
            return 1
        print('alerting catalog matches source')
    else:
        target.write_text(text)
        print('generated docs/observability/alerting-rules.md')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
