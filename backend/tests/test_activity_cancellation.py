"""隔离事务验证活动取消的权限、关联停止和回滚。"""
from datetime import datetime
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from activity_service import ActivityCancellationError, cancel_activity
from test_achievement_settlement import SqliteCursor


class ActivityCancellationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.addCleanup(self.db.close)
        self.db.executescript('''
            CREATE TABLE users (openId TEXT PRIMARY KEY, isAdmin INTEGER, isOfficial INTEGER);
            INSERT INTO users VALUES ('owner', 0, 0), ('stranger', 0, 0), ('official', 0, 1), ('admin', 1, 0);
            CREATE TABLE activities (id INTEGER PRIMARY KEY, status INTEGER, created_by TEXT,
                is_official INTEGER, activity_time TEXT, end_time TEXT, updated_at TEXT);
            INSERT INTO activities VALUES (1, 1, 'owner', 0, '2026-10-20 08:00', '2026-10-20 18:00', NULL);
            CREATE TABLE activity_lotteries (id INTEGER PRIMARY KEY, activity_id INTEGER, status INTEGER, updated_at TEXT);
            INSERT INTO activity_lotteries VALUES (1, 1, 0, NULL), (2, 1, 2, NULL), (3, 2, 0, NULL);
            CREATE TABLE notification_jobs (id INTEGER PRIMARY KEY, activity_id INTEGER, event_type TEXT,
                status TEXT, last_error TEXT, updated_at TEXT);
            INSERT INTO notification_jobs VALUES
                (1, 1, 'activity_reminder', 'pending', '', NULL),
                (2, 1, 'lottery_start', 'retry', '', NULL),
                (3, 1, 'activity_reminder', 'sent', '', NULL),
                (4, 2, 'lottery_start', 'pending', '', NULL),
                (5, 1, 'approval_result', 'pending', '', NULL),
                (6, 1, 'lottery_start', 'processing', '', NULL);
            CREATE TABLE activity_audit_logs (activity_id INTEGER, auditor_openid TEXT, action INTEGER, reason TEXT);
            CREATE TABLE activity_participants (activity_id INTEGER, status INTEGER);
            INSERT INTO activity_participants VALUES (1, 1), (1, 0);
            CREATE TABLE lottery_records (activity_id INTEGER, prize_id INTEGER);
            INSERT INTO lottery_records VALUES (1, 1);
        ''')
        self.db.commit()
        self.cursor = SqliteCursor(self.db)
        self.now = datetime(2026, 10, 13, 9)

    def cancel(self, operator='owner', activity_id=1):
        return cancel_activity(self.cursor, activity_id, operator, self.now)

    def test_cancellation_stops_activity_lotteries_and_unsent_reminders_keeps_history(self):
        self.assertEqual(self.cancel(), {'activity_id': 1, 'status': 5})
        self.db.commit()
        self.assertEqual(self.db.execute('SELECT status FROM activities').fetchone()[0], 5)
        self.assertEqual([row[0] for row in self.db.execute('SELECT status FROM activity_lotteries ORDER BY id')], [2, 2, 0])
        self.assertEqual([row[0] for row in self.db.execute('SELECT status FROM notification_jobs ORDER BY id')],
                         ['skipped', 'skipped', 'sent', 'pending', 'pending', 'skipped'])
        self.assertEqual(tuple(self.db.execute('SELECT auditor_openid, action FROM activity_audit_logs').fetchone()), ('owner', 6))
        self.assertEqual([row[0] for row in self.db.execute('SELECT status FROM activity_participants')], [1, 0])
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM lottery_records').fetchone()[0], 1)
        with self.assertRaisesRegex(ActivityCancellationError, '已取消'):
            self.cancel()
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM activity_audit_logs').fetchone()[0], 1)

    def test_ordinary_activity_only_creator_can_cancel(self):
        for operator in ('stranger', 'official', 'admin'):
            with self.subTest(operator=operator), self.assertRaises(ActivityCancellationError) as error:
                self.cancel(operator)
            self.assertEqual(error.exception.code, 403)
        self.assertEqual(self.db.execute('SELECT status FROM activities').fetchone()[0], 1)

    def test_official_activity_current_official_or_admin_can_cancel(self):
        for operator in ('owner', 'stranger', 'official', 'admin'):
            self.db.execute('UPDATE activities SET is_official = 1, status = 3')
            if operator in ('official', 'admin'):
                self.assertEqual(self.cancel(operator)['status'], 5)
            else:
                with self.assertRaises(ActivityCancellationError) as error:
                    self.cancel(operator)
                self.assertEqual(error.exception.code, 403)

    def test_drafts_review_rejected_ended_and_cancelled_cannot_cancel(self):
        for status in (-1, 0, 2, 4, 5):
            self.db.execute('UPDATE activities SET status = ?', (status,))
            with self.subTest(status=status), self.assertRaises(ActivityCancellationError):
                self.cancel()
        with self.assertRaises(ActivityCancellationError) as error:
            self.cancel(activity_id=999)
        self.assertEqual(error.exception.code, 404)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM activity_audit_logs').fetchone()[0], 0)

    def test_stale_status_with_past_end_and_legacy_missing_end_cannot_cancel(self):
        for end_time in ('2026-10-12 20:00', None):
            self.db.execute("UPDATE activities SET status = 1, activity_time = '2026-10-12 08:00', end_time = ?", (end_time,))
            with self.assertRaisesRegex(ActivityCancellationError, '已结束'):
                self.cancel()

    def test_failure_rolls_back_all_related_changes(self):
        self.db.execute('DROP TABLE activity_audit_logs')
        self.db.commit()
        with self.assertRaises(sqlite3.OperationalError):
            self.cancel()
        self.db.rollback()
        self.assertEqual(self.db.execute('SELECT status FROM activities').fetchone()[0], 1)
        self.assertEqual(self.db.execute('SELECT status FROM activity_lotteries WHERE id = 1').fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT status FROM notification_jobs WHERE id = 1').fetchone()[0], 'pending')


if __name__ == '__main__':
    unittest.main()
