#!/usr/bin/env python3
"""Offline contract tests: fake time/sender, local temporary state, no credentials."""
import concurrent.futures
import importlib.util
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import tempfile
import unittest

HERE = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('notify', HERE / 'notify.py')
notify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(notify)


def check(status='fail', key='docker:web', severity='page', detail='容器未运行'):
    return dict(key=key, scope='docker', object='web', status=status,
                severity=severity, detail=detail, first_check='docker inspect web')


class IncidentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = pathlib.Path(self.tmp.name) / 'incidents.json'
        self.sent = []
        self.cfg = notify.Config(host='node1', page_topic='page', ticket_topic='ticket')

    def run_at(self, now, records, sender=None):
        return notify.process(records, self.path, self.cfg, now=now,
                              sender=sender or self.sent.append)

    def test_transient_failure_is_silent_and_no_orphan_recovery(self):
        self.run_at(0, [check()])
        self.run_at(599, [check()])
        self.run_at(600, [check('ok')])
        self.run_at(901, [check('ok')])
        self.assertEqual(self.sent, [])

    def test_duplicate_or_invalid_record_does_not_suppress_the_round(self):
        # 配置笔误（WATCH="web web"）曾让整轮一条通知都不发、状态文件也不写。
        # 坏记录必须被计数并让退出码非零，但不能连带吞掉其余检查的告警。
        rows = [check(key='docker:web'), check(key='docker:web'),
                check(key='docker:api', detail='api 未运行')]
        first = self.run_at(0, rows)
        self.assertEqual(first['invalid'], 1)
        self.assertTrue(self.path.exists())
        self.run_at(600, rows)
        self.assertEqual([payload['key'] for payload in self.sent], ['docker:web', 'docker:api'])

    def test_hold_recovery_and_recurrence(self):
        self.run_at(0, [check()])
        self.run_at(600, [check()])
        self.run_at(900, [check('ok')])
        self.run_at(1199, [check('ok')])
        self.assertEqual(len(self.sent), 1)
        self.run_at(1200, [check('ok')])
        self.assertEqual([m['event'] for m in self.sent], ['firing', 'resolved'])
        self.assertEqual(self.sent[0]['title'], '[故障][关注] web · node1')
        self.assertEqual(self.sent[1]['title'], '[恢复][关注] web · node1')
        self.assertEqual(self.sent[1]['priority'], 2)
        self.assertNotIn('容器未运行', self.sent[1]['message'])
        self.run_at(1300, [check()])
        self.run_at(1900, [check()])
        self.assertEqual(len(self.sent), 3)

    def test_failed_send_does_not_advance_delivery_state(self):
        self.run_at(0, [check()])
        def fail(_message):
            raise OSError('fake failure')
        result = self.run_at(600, [check()], fail)
        self.assertEqual(result['failed'], 1)
        incident = json.loads(self.path.read_text())['incidents']['docker:web']
        self.assertIsNone(incident['last_sent'])
        self.assertFalse(incident['firing_sent'])
        self.run_at(601, [check()])
        self.assertEqual(len(self.sent), 1)

    def test_failed_resolved_is_retried_and_reflap_does_not_send_resolved(self):
        self.run_at(0, [check()])
        self.run_at(600, [check()])
        self.run_at(700, [check('ok')])
        self.run_at(1000, [check('ok')], lambda _: (_ for _ in ()).throw(OSError()))
        self.run_at(1001, [check()])
        self.assertEqual(len(self.sent), 1)
        self.run_at(1100, [check('ok')])
        self.run_at(1400, [check('ok')])
        self.assertEqual(self.sent[-1]['event'], 'resolved')

    def test_reminders_back_off_and_cap_for_each_severity(self):
        for severity, schedule in [('page', [3600, 7200, 14400, 28800, 86400, 86400]),
                                   ('ticket', [14400, 28800, 57600, 86400, 86400])]:
            with self.subTest(severity=severity):
                self.path = pathlib.Path(self.tmp.name) / (severity + '.json')
                self.sent.clear()
                record = check(severity=severity)
                self.run_at(0, [record]); self.run_at(600, [record])
                now = 600
                for interval in schedule:
                    before = len(self.sent)
                    self.run_at(now + interval - 1, [record])
                    self.assertEqual(len(self.sent), before)
                    now += interval
                    self.run_at(now, [record])
                    self.assertEqual(len(self.sent), before + 1)
                self.assertEqual(self.sent[0]['topic'], severity)

    def test_incident_identity_not_changing_detail_or_peer_problem(self):
        self.run_at(0, [check()])
        self.run_at(600, [check(detail='容器 unhealthy'), check(key='docker:db')])
        self.run_at(900, [check(detail='容器 exited')])
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.sent[0]['key'], 'docker:web')

    def test_unknown_and_missing_checks_are_not_recovery(self):
        self.run_at(0, [check()]); self.run_at(600, [check()])
        self.run_at(900, [check('unknown')]); self.run_at(1300, [])
        self.assertEqual(len(self.sent), 1)

    def test_missing_ticket_topic_preserves_pending_not_routed_to_page(self):
        self.cfg.ticket_topic = ''
        self.run_at(0, [check(severity='ticket')])
        with self.assertLogs('host-watchdog', level='ERROR'):
            result = self.run_at(600, [check(severity='ticket')])
        self.assertEqual(result['failed'], 1)
        self.assertEqual(self.sent, [])
        self.cfg.ticket_topic = 'ticket'
        self.run_at(601, [check(severity='ticket')])
        self.assertEqual(self.sent[0]['topic'], 'ticket')
        self.assertEqual(self.sent[0]['title'], '[故障][待办] web · node1')

    def test_resolved_uses_original_incident_topic(self):
        self.run_at(0, [check()]); self.run_at(600, [check()])
        self.cfg.page_topic = 'changed-page'
        self.run_at(700, [check('ok')]); self.run_at(1000, [check('ok')])
        self.assertEqual(self.sent[-1]['topic'], 'page')

    def test_utf8_content_is_bounded_and_lines_are_sanitized(self):
        record = check(detail='异常\n伪造行' * 3000)
        self.run_at(0, [record]); self.run_at(600, [record])
        body = self.sent[0]['message']
        self.assertLessEqual(len(body.encode('utf-8')), 3000)
        self.assertLessEqual(len(body.splitlines()), 6)
        self.assertIn('范围：docker', body)
        self.assertIn('先查：', body)

    def test_corrupt_state_fails_closed_without_overwrite(self):
        self.path.write_text('{bad')
        with self.assertRaises(ValueError):
            self.run_at(0, [check()])
        self.assertEqual(self.path.read_text(), '{bad')
        self.assertEqual(self.sent, [])

    def test_concurrent_evaluations_send_firing_once(self):
        self.run_at(0, [check()])
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda _: self.run_at(600, [check()]), range(8)))
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_clock_rollback_never_sends_early(self):
        self.run_at(1000, [check()]); self.run_at(900, [check()])
        self.run_at(1499, [check()])
        self.assertEqual(self.sent, [])
        self.run_at(1500, [check()])
        self.assertEqual(len(self.sent), 1)

    def test_unobserved_gap_resets_pending_recovery(self):
        self.run_at(0, [check()]); self.run_at(600, [check()])
        self.run_at(700, [check('ok')]); self.run_at(1000, [])
        self.run_at(1001, [check('ok')])
        self.assertEqual(len(self.sent), 1)
        self.run_at(1301, [check('ok')])
        self.assertEqual(len(self.sent), 2)

    def test_test_state_alias_is_rejected(self):
        self.cfg.mode = 'test'; self.cfg.test_topic = 'test'
        self.cfg.production_state = str(self.path)
        alias = pathlib.Path(self.tmp.name) / 'alias'
        alias.symlink_to(self.path)
        with self.assertRaises(ValueError):
            notify.process([check()], alias, self.cfg, 0, self.sent.append)

    def test_test_mode_requires_separate_topic_and_state(self):
        self.cfg.mode = 'test'
        for topic in ['', 'page', 'ticket']:
            self.cfg.test_topic = topic
            with self.assertRaises(ValueError):
                self.run_at(0, [check()])
        self.cfg.test_topic = 'test'
        self.cfg.production_state = str(self.path)
        with self.assertRaises(ValueError):
            self.run_at(0, [check()])
        test_path = pathlib.Path(self.tmp.name) / 'isolated.test.json'
        notify.process([check()], test_path, self.cfg, now=0, sender=self.sent.append)
        notify.process([check()], test_path, self.cfg, now=600, sender=self.sent.append)
        self.assertEqual(self.sent[0]['topic'], 'test')
        self.assertEqual(self.sent[0]['priority'], 1)
        self.assertTrue(self.sent[0]['title'].startswith('[测试]'))
        self.assertFalse(self.path.exists())


class InputTests(unittest.TestCase):
    def test_tsv_requires_complete_known_checks(self):
        row = 'docker:web\tdocker\tweb\tfail\tpage\tunhealthy\tdocker inspect web\n'
        self.assertEqual(notify.parse_records(row)[0]['key'], 'docker:web')
        with self.assertRaises(ValueError):
            notify.parse_records('partial\n')

    def test_only_exact_mac_site_is_ignored_not_all_newt(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = pathlib.Path(tmp) / 'pangolin.sqlite'
            con = sqlite3.connect(db)
            con.execute('CREATE TABLE sites (siteId INTEGER, name TEXT, type TEXT, online INTEGER)')
            con.executemany('INSERT INTO sites VALUES (?,?,?,?)',
                [(1, 'mac', 'newt', 0), (2, 'node0', 'newt', 0),
                 (3, 'mac-backup', 'newt', 0), (4, 'node2', 'newt', 1)])
            con.commit(); con.close()
            records = notify.pangolin_records(str(db), 'mac')
            self.assertEqual([r['object'] for r in records], ['node0', 'mac-backup', 'node2'])
            self.assertEqual([r['status'] for r in records], ['fail', 'fail', 'ok'])
            self.assertEqual(records[0]['key'], 'pangolin:2')

    def test_environment_test_mode_has_separate_paths_and_never_falls_back(self):
        env = dict(HOST_LABEL='node0-test', WATCHDOG_MODE='test',
                   NTFY_TOPIC='page', NTFY_TEST_TOPIC='test',
                   NOTIFY_STATE_FILE='/var/lib/host-watchdog/incidents.json')
        cfg, path = notify.from_environment(env)
        self.assertNotEqual(path, cfg.production_state)
        self.assertEqual(cfg.mode, 'test')
        env['NTFY_TEST_TOPIC'] = ''
        with self.assertRaises(ValueError):
            notify.from_environment(env)


class ShellTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        self.bin = self.root / 'bin'; self.bin.mkdir()
        self.env = dict(PATH=str(self.bin) + ':' + os.environ['PATH'],
            WATCHDOG_CONF='/dev/null', HOST_LABEL='fixture', WATCH='web',
            SYSTEMD_UNITS='', HTTP_CHECKS='', PANGOLIN_DB='', DISK_PATHS='/fixture',
            STATE_FILE=str(self.root / 'restarts'), NOTIFY_STATE_FILE=str(self.root / 'incidents.json'),
            NOTIFY_HELPER=str(HERE / 'notify.py'), NTFY_URL='', NTFY_TOPIC='page',
            NTFY_TICKET_TOPIC='ticket', NTFY_TEST_TOPIC='test', HC_PING_URL='',
            PYTHONDONTWRITEBYTECODE='1')
        self.stub('docker', '''#!/bin/sh
case "$*" in
  *RestartCount*) echo 7;;
  *State.Status*) echo running;;
  *State.Health*) echo healthy;;
esac
''')
        self.stub('df', '#!/bin/sh\nprintf "Use%%\\n20%%\\n"\n')
        # Never let accidental regression invoke a real network client.
        self.stub('curl', '#!/bin/sh\necho NETWORK_FORBIDDEN >&2\nexit 91\n')

    def stub(self, name, text):
        path = self.bin / name
        path.write_text(text); path.chmod(0o755)

    def run_shell(self):
        return subprocess.run(['/bin/bash', str(HERE / 'watchdog.sh')], env=self.env,
                              capture_output=True, text=True, timeout=15)

    def test_restart_growth_is_diagnostic_not_incident(self):
        pathlib.Path(self.env['STATE_FILE']).write_text('web 6\n')
        result = self.run_shell()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('诊断', result.stdout)
        self.assertEqual(json.loads(pathlib.Path(self.env['NOTIFY_STATE_FILE']).read_text())['incidents'], {})

    def test_disk_warning_is_pending_ticket_and_unhealthy_is_page(self):
        self.stub('docker', '#!/bin/sh\ncase "$*" in *RestartCount*) echo 7;; *State.Status*) echo running;; *State.Health*) echo unhealthy;; esac\n')
        self.stub('df', '#!/bin/sh\nprintf "Use%%\\n90%%\\n"\n')
        result = self.run_shell()
        self.assertEqual(result.returncode, 1, result.stderr)
        incidents = json.loads(pathlib.Path(self.env['NOTIFY_STATE_FILE']).read_text())['incidents']
        self.assertEqual(incidents['docker:web']['severity'], 'page')
        self.assertEqual(incidents['disk:/fixture']['severity'], 'ticket')
        self.assertNotIn('NETWORK_FORBIDDEN', result.stderr)

    def test_critical_disk_retains_page_alongside_warning(self):
        self.stub('df', '#!/bin/sh\nprintf "Use%%\\n96%%\\n"\n')
        result = self.run_shell()
        self.assertEqual(result.returncode, 1, result.stderr)
        incidents = json.loads(pathlib.Path(self.env['NOTIFY_STATE_FILE']).read_text())['incidents']
        self.assertEqual(incidents['disk-critical:/fixture']['severity'], 'page')
        self.assertEqual(incidents['disk:/fixture']['severity'], 'ticket')

    def test_df_failure_is_ticket_not_ok_or_false_recovery(self):
        self.stub('df', '#!/bin/sh\nexit 1\n')
        result = self.run_shell()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertNotIn('OK —', result.stdout)
        incidents = json.loads(pathlib.Path(self.env['NOTIFY_STATE_FILE']).read_text())['incidents']
        self.assertEqual(incidents['disk-read:/fixture']['severity'], 'ticket')
        self.assertNotIn('disk:/fixture', incidents)

    def test_hc_ping_reports_scan_completion_even_if_checks_fail(self):
        capture = self.root / 'curl-args'
        self.env['HC_PING_URL'] = 'https://hc.example/fixture'
        self.env['CAPTURE'] = str(capture)
        self.stub('df', '#!/bin/sh\nprintf "Use%%\\n90%%\\n"\n')
        self.stub('curl', '#!/bin/sh\nprintf "%s\\n" "$@" > "$CAPTURE"\n')
        result = self.run_shell()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('https://hc.example/fixture', capture.read_text().splitlines())
        self.assertNotIn('https://hc.example/fixture/fail', capture.read_text())

    def test_failed_notification_does_not_ping_detector_heartbeat(self):
        capture = self.root / 'curl-args'
        self.env.update(HC_PING_URL='https://hc.example/fixture', CAPTURE=str(capture),
                        NOTIFY_HOLD_SECONDS='0', NTFY_TICKET_TOPIC='')
        self.stub('df', '#!/bin/sh\nprintf "Use%%\\n90%%\\n"\n')
        self.stub('curl', '#!/bin/sh\nprintf "%s\\n" "$@" > "$CAPTURE"\n')
        result = self.run_shell()
        self.assertEqual(result.returncode, 2)
        self.assertFalse(capture.exists())

    def test_test_mode_leaves_production_state_untouched(self):
        production = pathlib.Path(self.env['STATE_FILE']); production.write_text('production marker')
        incidents = pathlib.Path(self.env['NOTIFY_STATE_FILE']); incidents.write_text('production incident marker')
        self.env['WATCHDOG_MODE'] = 'test'
        self.env['WATCHDOG_TEST_STATE_DIR'] = str(self.root / 'isolated-test')
        result = self.run_shell()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(production.read_text(), 'production marker')
        self.assertEqual(incidents.read_text(), 'production incident marker')

    def test_test_restart_state_symlink_cannot_alias_production(self):
        production = pathlib.Path(self.env['STATE_FILE']); production.write_text('production marker')
        test_dir = self.root / 'isolated-test'; test_dir.mkdir()
        (test_dir / 'restarts').symlink_to(production)
        self.env['WATCHDOG_MODE'] = 'test'
        self.env['WATCHDOG_TEST_STATE_DIR'] = str(test_dir)
        result = self.run_shell()
        self.assertEqual(result.returncode, 2)
        self.assertEqual(production.read_text(), 'production marker')

    def test_invalid_test_topic_fails_before_production_state_write(self):
        self.env['WATCHDOG_MODE'] = 'test'; self.env['NTFY_TEST_TOPIC'] = 'page'
        result = self.run_shell()
        self.assertEqual(result.returncode, 2)
        self.assertFalse(pathlib.Path(self.env['STATE_FILE']).exists())


if __name__ == '__main__':
    unittest.main()
