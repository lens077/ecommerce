#!/usr/bin/env python3
"""把 TODO.md 的全部条目提取为 Kaneo 同步用的结构化清单。

匹配键是生成的 title（"[标签] 标题"）——/kaneo-sync 技能用它对账，
所以改这里的 tag/标题规则会让既有 Kaneo 任务全部失配，改前先想清楚。

条目定义（与 2026-08-12 首次全量导入一致）：
  - 状态表格行：`| 项目 | ✅/🟡/⬜/🔴 | 说明 |`
  - checkbox 行：`- [ ]` / `- [x]`（缩进续行并入描述）

状态映射：✅/[x] → done；🟡 → in-progress；⬜/[ ]/🔴 → to-do
优先级：P0 段与 🔴 → urgent；L30/L31 风险行与可观测评审段 → high；
        done → low；其余 → medium

用法：python3 scripts/kaneo/extract_todo.py [TODO.md 路径] > /tmp/kaneo_payload.json
"""
import json
import re
import sys

STATUS = {'✅': 'done', '🟡': 'in-progress', '⬜': 'to-do', '🔴': 'to-do-broken'}

TAG = {
    '1. 基础设施与工程化': '基建',
    '2. 后端微服务（核心）': '核心服务',
    '3. 后端微服务（支撑）': '支撑服务',
    '4. 网关与 RBAC': '网关',
    '5. 配置中心（Config Center）': '配置中心',
    '6. 推荐链路（gorse）': '推荐',
    '7. 前端 · consumer': '前端',
    '8. 可观测性与测试': '可观测',
    '二、订单分布式一致性方案（已定）': '订单一致性',
    'P0 · 假成功与越权（2026-08-06 对抗评审发现，优先于一切新功能）': 'P0',
    '其余近期待办': '待办',
}


def clean(s):
    return re.sub(r'\s+', ' ', s.replace('**', '').strip())


def tag(sec):
    if sec in TAG:
        return TAG[sec]
    if sec.startswith('可观测性「统一关联底座」'):
        return '可观测评审'
    if sec.startswith('基础设施 TLS'):
        return 'TLS'
    return sec[:6]


def extract(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    items = []
    section = subsection = ''
    for i, raw in enumerate(lines, 1):
        if m := re.match(r'^## (.+)', raw):
            section, subsection = clean(m.group(1)), ''
            continue
        if m := re.match(r'^### (.+)', raw):
            subsection = clean(m.group(1))
            continue
        if m := re.match(r'^\*\*(consumer|merchant|admin)（', raw):
            subsection = '7. 前端 · ' + m.group(1)
            continue
        if m := re.match(r'^\|([^|]+)\|\s*(✅|🟡|⬜|🔴)\s*\|(.*)$', raw):
            items.append({'line': i, 'sec': subsection or section,
                          'title': clean(m.group(1)),
                          'status': STATUS[m.group(2)], 'marker': m.group(2),
                          'desc': clean(m.group(3).strip('|'))})
            continue
        if m := re.match(r'^\s*- \[( |x)\]\s*(.*)$', raw):
            body = clean(m.group(2))
            j = i
            while j < len(lines) and re.match(r'^\s{4,}\S', lines[j]) \
                    and not re.match(r'^\s*- \[', lines[j]):
                body += ' ' + clean(lines[j])
                j += 1
            tm = re.match(r'^(.*?)(?:[:：]|（`|$)', body)
            done = m.group(1) == 'x'
            items.append({'line': i, 'sec': subsection or section,
                          'title': (clean(tm.group(1)) if tm else body)[:80],
                          'status': 'done' if done else 'to-do',
                          'marker': '[x]' if done else '[ ]', 'desc': body})
    return items


def payload(items):
    out = []
    for it in items:
        t = tag(it['sec'])
        status = 'to-do' if it['status'] == 'to-do-broken' else it['status']
        if t == 'P0' or it['status'] == 'to-do-broken' or 'PII 脱敏' in it['title']:
            prio = 'urgent'
        elif t == '可观测评审' or ('风险' in it['title'] and it['sec'].startswith('1.')):
            prio = 'high'
        elif status == 'done':
            prio = 'low'
        else:
            prio = 'medium'
        desc = it['desc']
        if len(desc) > 220:
            desc = desc[:220] + '…'
        out.append({
            'title': f"[{t}] {it['title']}"[:120],
            'description': f"来源: TODO.md L{it['line']}（{it['sec']}，原状态 {it['marker']}）。{desc}",
            'status': status,
            'priority': prio,
            'todo_line': it['line'],
            'todo_marker': it['marker'],
        })
    return out


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else 'TODO.md'
    json.dump(payload(extract(src)), sys.stdout, ensure_ascii=False, indent=1)
    print(file=sys.stderr)
    print(f'items: {len(extract(src))}', file=sys.stderr)
