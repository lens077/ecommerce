#!/usr/bin/env python3
"""Per-check notification lifecycle. Only stdlib; clock and sender injectable."""
import fcntl
import json
import logging
import os
from pathlib import Path
import tempfile

LOG = logging.getLogger('host-watchdog')
PAGE_INTERVALS = (3600, 7200, 14400, 28800, 86400)
TICKET_INTERVALS = (14400, 28800, 57600, 86400)


class Config:
    def __init__(self, host, page_topic='', ticket_topic='', test_topic='',
                 mode='production', hold=600, recover=300,
                 production_state='/var/lib/host-watchdog/incidents.json'):
        self.host = host
        self.page_topic = page_topic
        self.ticket_topic = ticket_topic
        self.test_topic = test_topic
        self.mode = mode
        self.hold = hold
        self.recover = recover
        self.production_state = production_state

    def validate(self, path):
        if self.mode not in ('production', 'test') or min(self.hold, self.recover) < 0:
            raise ValueError('invalid notification configuration')
        if self.mode == 'test':
            if not self.test_topic or self.test_topic in (self.page_topic, self.ticket_topic):
                raise ValueError('test requires an isolated topic')
            if Path(path).resolve() == Path(self.production_state).resolve():
                raise ValueError('test must not use production state')

    def topic(self, severity):
        topic = self.test_topic if self.mode == 'test' else (
            self.page_topic if severity == 'page' else self.ticket_topic)
        if not topic:
            raise ValueError('notification topic not configured')
        return topic


def compact(value, byte_limit):
    return ' '.join(str(value).split()).encode('utf-8')[:byte_limit].decode('utf-8', 'ignore')


def message(record, incident, config, now, event, topic):
    category = '关注' if incident['severity'] == 'page' else '待办'
    prefix = '[恢复]' if event == 'resolved' else '[故障]'
    title = f"{prefix}[{category}] {compact(record['object'], 200)} · {compact(config.host, 120)}"
    if config.mode == 'test':
        title = '[测试]' + title
    duration = max(0, int(now - incident['first_seen']))
    if event == 'resolved':
        lines = ['状态：检查已恢复正常', f"范围：{record['scope']}",
                 f'持续：本次事件 {duration // 60} 分钟；恢复确认 {config.recover} 秒',
                 '先查：无需立即操作；如再次异常再排查']
    else:
        lines = ['现象：' + compact(record['detail'], 1600),
                 f"范围：{record['scope']}", f'持续：{duration // 60} 分钟',
                 '先查：' + compact(record['first_check'], 600)]
    return dict(key=record['key'], event=event, topic=topic, title=title,
                message='\n'.join(lines), priority=1 if config.mode == 'test' else (
                    2 if event == 'resolved' else (4 if incident['severity'] == 'page' else 2)),
                tags=['white_check_mark' if event == 'resolved' else 'rotating_light'])


def atomic_save(path, data):
    fd, name = tempfile.mkstemp(prefix='.' + path.name + '.', dir=str(path.parent))
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(data, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        directory = os.open(str(path.parent), os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def process(records, path, config, now, sender):
    """Persist observations before delivery; commit delivery only after sender succeeds.

    A crash after HTTP acceptance but before the state commit may duplicate once;
    there is no transactional commit shared with ntfy (not exactly-once delivery).
    """
    path = Path(path)
    config.validate(path)
    # 2026-09-27 push 前异构双审发现：原先任一坏记录就 raise，整轮一条通知都不发，
    # 状态文件也不写。一个配置笔误（WATCH="web web"、DISK_PATHS="/ /"、重名 HTTP_CHECKS）
    # 就把单项错误放大成全量静默，只剩 Healthchecks 死人开关兜底（且它有自己的宽限期）。
    # 改为：跳过坏记录、继续投递其余，用 invalid 计数保证退出码仍非零——不静默，也不放大。
    # 重复 key 保留首次出现，后续计为 invalid，不合并（合并会让两个检查共用一个事件身份）。
    # 非法记录的 key 另记为 held：它不是「缺席」，不能走下方缺席分支重置 first_seen。
    # 2026-09-27 异构双审复现：一个已在计时的故障，只要记录变成非法（如 severity 写成
    # PAGE），每轮 first_seen 都被重置，hold 永远达不到，真实故障一小时内 0 条告警。
    # 改为冻结计时：非法期间不发不重置，记录改回合法后按原计时立刻判定。
    seen = set()
    held = set()
    accepted = []
    invalid = []
    for record in records:
        if (record['key'] in seen or record['status'] not in ('ok', 'fail', 'unknown')
                or record['severity'] not in ('page', 'ticket')
                or record['scope'] not in ('docker', 'systemd', 'host')):
            invalid.append(compact(record['key'], 120))
            if record['key'] not in seen:
                held.add(record['key'])
            continue
        seen.add(record['key'])
        accepted.append(record)
    if invalid:
        # key 来自本机配置，不含凭据；操作者需要知道是哪一项才能改掉笔误。
        LOG.error('notification_invalid_records count=%d keys=%s', len(invalid), ','.join(invalid))
    records = accepted
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock_path = path.with_name(path.name + '.lock')
    if path.is_symlink() or lock_path.is_symlink():
        raise ValueError('state must not be a symlink')
    fd = os.open(str(lock_path), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if path.exists():
            with path.open() as stream:
                state = json.load(stream)
            if (state.get('version') != 1 or state.get('mode') != config.mode
                    or state.get('host') != config.host or not isinstance(state.get('incidents'), dict)):
                raise ValueError('incompatible notification state')
        else:
            state = dict(version=1, mode=config.mode, host=config.host, incidents={})
        incidents = state['incidents']
        # Omitted/retired checks are not proof of health; never synthesize recovery.
        for key in incidents.keys() - seen - held:
            incidents[key]['recover_since'] = None
            if not incidents[key]['firing_sent']:
                incidents[key]['first_seen'] = now
        result = dict(sent=0, failed=0, invalid=len(invalid))
        for record in records:
            key, status = record['key'], record['status']
            incident = incidents.get(key)
            event = None
            if status == 'unknown':
                if incident:
                    incident['recover_since'] = None
                    if not incident['firing_sent']:
                        incident['first_seen'] = now
                continue
            if status == 'fail':
                if not incident:
                    incident = incidents[key] = dict(first_seen=now, last_seen=now,
                        recover_since=None, severity=record['severity'], firing_sent=False,
                        last_sent=None, reminder_index=0, topic=None)
                # Clock rollback never causes an early firing/reminder/recovery.
                if now < incident['last_seen']:
                    incident['first_seen'] = now
                    if incident['last_sent'] is not None:
                        incident['last_sent'] = now
                incident['last_seen'] = now
                incident['recover_since'] = None
                if not incident['firing_sent']:
                    if now - incident['first_seen'] >= config.hold:
                        event = 'firing'
                else:
                    schedule = PAGE_INTERVALS if incident['severity'] == 'page' else TICKET_INTERVALS
                    delay = schedule[min(incident['reminder_index'], len(schedule) - 1)]
                    if now - incident['last_sent'] >= delay:
                        event = 'reminder'
            elif incident:
                if not incident['firing_sent']:
                    del incidents[key]
                    continue
                if incident['recover_since'] is None or now < incident['last_seen']:
                    incident['recover_since'] = now
                incident['last_seen'] = now
                if now - incident['recover_since'] >= config.recover:
                    event = 'resolved'
            atomic_save(path, state)
            if not event:
                continue
            try:
                topic = incident['topic'] or config.topic(incident['severity'])
                sender(message(record, incident, config, now, event, topic))
            except Exception as error:
                # Never log exception messages: HTTP errors can contain URLs/tokens.
                LOG.error('notification_send_failed error_type=%s', type(error).__name__)
                result['failed'] += 1
                continue
            if event == 'resolved':
                del incidents[key]
            else:
                if event == 'reminder':
                    incident['reminder_index'] += 1
                incident['firing_sent'] = True
                incident['last_sent'] = now
                incident['topic'] = topic
            result['sent'] += 1
            atomic_save(path, state)
        atomic_save(path, state)
        return result


def parse_records(text):
    """Return (records, malformed_count).

    Structurally broken lines are skipped and counted instead of raising: raising here
    happened before process(), so one malformed line silenced every valid alert in the
    round -- the same failure 35a88aa6 fixed for semantically invalid records, one layer up.
    Only line numbers are logged; detail text may contain arbitrary content.
    """
    fields = ('key', 'scope', 'object', 'status', 'severity', 'detail', 'first_check')
    records = []
    malformed = []
    for number, line in enumerate(text.splitlines(), 1):
        if not line:
            continue
        values = line.split('\t')
        if len(values) != len(fields) or not all(values[:5]):
            malformed.append(str(number))
            continue
        records.append(dict(zip(fields, values)))
    if malformed:
        LOG.error('notification_malformed_records count=%d lines=%s',
                  len(malformed), ','.join(malformed[:20]))
    return records, len(malformed)


def pangolin_records(path, ignored='mac'):
    """Read all site states so recovery is explicit; never exclude by tunnel type."""
    import sqlite3
    from urllib.parse import quote
    from contextlib import closing
    with closing(sqlite3.connect('file:' + quote(str(path), safe='/') + '?mode=ro', uri=True,
                                 timeout=5)) as connection:
        connection.execute('PRAGMA query_only=ON')
        rows = connection.execute('SELECT siteId, name, online FROM sites ORDER BY siteId').fetchall()
    excluded = set(ignored.split())
    return [dict(key='pangolin:' + str(site_id), scope='host', object=str(name),
                 status='ok' if online == 1 else 'fail', severity='page',
                 detail='隧道站点离线' if online != 1 else '站点在线',
                 first_check='Pangolin 站点状态与对应主机的 newt 服务')
            for site_id, name, online in rows if name not in excluded]


def from_environment(env):
    production = env.get('NOTIFY_STATE_FILE', '/var/lib/host-watchdog/incidents.json')
    mode = env.get('WATCHDOG_MODE', 'production')
    path = env.get('NOTIFY_TEST_STATE_FILE', production + '.test') if mode == 'test' else production
    config = Config(host=env.get('HOST_LABEL', 'host'), page_topic=env.get('NTFY_TOPIC', ''),
                    ticket_topic=env.get('NTFY_TICKET_TOPIC', ''),
                    test_topic=env.get('NTFY_TEST_TOPIC', ''), mode=mode,
                    hold=int(env.get('NOTIFY_HOLD_SECONDS', '600')),
                    recover=int(env.get('NOTIFY_RECOVER_SECONDS', '300')),
                    production_state=production)
    config.validate(path)
    if mode == 'test' and env.get('STATE_FILE'):
        restart = Path(env['STATE_FILE'])
        production_restart = Path(env.get('WATCHDOG_PRODUCTION_RESTART_STATE',
                                          '/var/lib/host-watchdog/state'))
        if restart.is_symlink() or restart.resolve() == production_restart.resolve():
            raise ValueError('test restart state must be isolated')
    return config, path


def http_sender(env):
    from urllib.parse import urlparse
    from urllib.request import Request, build_opener, HTTPRedirectHandler
    url = env.get('NTFY_URL', '').rstrip('/')
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.query or parsed.fragment:
        raise ValueError('notification requires an HTTPS origin without credentials')

    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    opener = build_opener(NoRedirect())

    def send(payload):
        body = {key: payload[key] for key in ('topic', 'title', 'message', 'priority', 'tags')}
        headers = {'Content-Type': 'application/json'}
        if env.get('NTFY_TOKEN'):
            headers['Authorization'] = 'Bearer ' + env['NTFY_TOKEN']
        request = Request(url, data=json.dumps(body, ensure_ascii=False).encode('utf-8'),
                          headers=headers, method='POST')
        with opener.open(request, timeout=10) as response:
            result = json.loads(response.read(65536))
            if not 200 <= response.status < 300 or result.get('event') != 'message':
                raise ValueError('notification not acknowledged')
    return send


def main():
    import sys
    import time
    try:
        config, path = from_environment(os.environ)
        if len(sys.argv) > 1 and sys.argv[1] == '--validate':
            return 0
        if len(sys.argv) > 1 and sys.argv[1] == '--pangolin':
            records = pangolin_records(os.environ['PANGOLIN_DB'],
                                       os.environ.get('PANGOLIN_IGNORE_SITES', 'mac'))
            for record in records:
                print('\t'.join(compact(record[k], 2000) for k in
                      ('key', 'scope', 'object', 'status', 'severity', 'detail', 'first_check')))
            return 0
        records, malformed = parse_records(sys.stdin.read())
        # Validate transport only when there is a due delivery; missing config must
        # still persist pending observations and surface an explicit send error.
        def send(payload):
            return http_sender(os.environ)(payload)
        result = process(records, path, config, time.time(), send)
        result['invalid'] += malformed
        print('host_watchdog_notifications sent=%d failed=%d invalid=%d'
              % (result['sent'], result['failed'], result['invalid']))
        # invalid 同样返回 2：坏记录必须可见，但不再连带丢掉其余检查的通知。
        return 2 if result['failed'] or result['invalid'] else 0
    except Exception as error:
        LOG.error('notification_error error_type=%s', type(error).__name__)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
