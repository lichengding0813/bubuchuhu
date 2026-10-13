"""在隔离数据库中验证成就结算、事务回滚及历史回填的业务结果。

SQLite 适配仅覆盖参数、INSERT IGNORE 与锁语法；生产 MySQL 锁行为需部署后联调。
"""
import hashlib
from pathlib import Path
import sqlite3
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from achievement_service import count_valid_attendance, settle_achievements_after_draw


class SqliteCursor:
    def __init__(self, connection):
        self.cursor = connection.cursor()

    def execute(self, sql, params=()):
        sql = sql.replace('%s', '?').replace('INSERT IGNORE', 'INSERT OR IGNORE')
        sql = sql.replace('FOR UPDATE', '').replace('NOW()', 'CURRENT_TIMESTAMP')
        self.cursor.execute(sql, params)

    @property
    def rowcount(self):
        return self.cursor.rowcount

    @property
    def lastrowid(self):
        return self.cursor.lastrowid

    def fetchone(self):
        row = self.cursor.fetchone()
        return dict(row) if row is not None else None

    def fetchall(self):
        return [dict(row) for row in self.cursor.fetchall()]


class AchievementSettlementTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.addCleanup(self.db.close)
        self.db.row_factory = sqlite3.Row
        self.db.create_function('CONCAT', -1, lambda *items: ''.join(map(str, items)))
        self.db.create_function('MD5', 1, lambda value: hashlib.md5(value.encode()).hexdigest())
        self.db.create_function('SUBSTRING', 3, lambda value, start, length: value[start - 1:start - 1 + length])
        self.db.executescript('''
            CREATE TABLE users (openId TEXT PRIMARY KEY);
            CREATE TABLE activities (id INTEGER PRIMARY KEY, is_official INTEGER, status INTEGER DEFAULT 1);
            CREATE TABLE activity_lotteries (id INTEGER PRIMARY KEY, activity_id INTEGER);
            CREATE TABLE lottery_records (
                id INTEGER PRIMARY KEY, lottery_id INTEGER, user_openid TEXT,
                prize_id INTEGER, chance_no INTEGER, drawn_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE achievement_definitions (
                id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT, description TEXT,
                image_url TEXT, achievement_type INTEGER, threshold_count INTEGER,
                is_physical INTEGER, reward_name TEXT, claim_instructions TEXT,
                pickup_location TEXT, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0
            );
            CREATE TABLE achievement_activity_relations (
                achievement_id INTEGER, activity_id INTEGER, is_active INTEGER DEFAULT 1,
                UNIQUE (achievement_id, activity_id)
            );
            CREATE TABLE achievement_attendance (
                id INTEGER PRIMARY KEY, user_openid TEXT, activity_id INTEGER,
                first_lottery_id INTEGER, first_record_id INTEGER, verified_at TEXT, status INTEGER,
                UNIQUE (user_openid, activity_id)
            );
            CREATE TABLE user_achievements (
                id INTEGER PRIMARY KEY, user_openid TEXT, achievement_id INTEGER,
                source_activity_id INTEGER, source_type TEXT, obtained_at TEXT,
                UNIQUE (user_openid, achievement_id)
            );
            CREATE TABLE achievement_rewards (
                id INTEGER PRIMARY KEY, user_openid TEXT, achievement_id INTEGER,
                source_activity_id INTEGER, prize_name TEXT, image_url TEXT,
                claim_instructions TEXT, pickup_location TEXT, redeem_code TEXT UNIQUE,
                status INTEGER DEFAULT 0, UNIQUE (user_openid, achievement_id)
            );
            CREATE TABLE lottery_redemptions (id INTEGER PRIMARY KEY, redeem_code TEXT UNIQUE);
            INSERT INTO users VALUES ('user');
        ''')
        for badge_id, threshold in enumerate((1, 5, 9, 15, 25, 50), start=1):
            self.db.execute('''
                INSERT INTO achievement_definitions
                    (id, code, name, description, image_url, achievement_type,
                     threshold_count, is_physical, reward_name, claim_instructions, pickup_location)
                VALUES (?, ?, ?, '', 'cloud://prod/badge.png', 1, ?, ?, ?, '', '')
            ''', (badge_id, f'MILESTONE_{threshold:02}', f'徽章{threshold}', threshold,
                  int(threshold >= 9), f'实体徽章{threshold}'))
        self.db.executemany('INSERT INTO activities (id, is_official) VALUES (?, 1)', [(i,) for i in range(1, 51)])
        self.db.execute('INSERT INTO activities (id, is_official) VALUES (100, 0)')
        self.db.commit()
        self.cursor = SqliteCursor(self.db)

    def settle(self, activity_id, record_id=None, lottery_id=None):
        return settle_achievements_after_draw(
            self.cursor, 'user', activity_id, lottery_id or activity_id, record_id or activity_id,
        )

    def count(self, table):
        return self.db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]

    def add_event_badge(self, active=1):
        self.db.execute('''
            INSERT INTO achievement_definitions
                (id, code, name, description, image_url, achievement_type,
                 threshold_count, is_physical, is_active)
            VALUES (7, 'EVENT', '活动彩蛋', '', 'cloud://prod/event.png', 2, NULL, 0, ?)
        ''', (active,))
        self.db.execute('INSERT INTO achievement_activity_relations VALUES (7, 1, 1)')

    def test_repeated_draws_and_multiple_lotteries_in_same_activity_count_once(self):
        self.add_event_badge()
        first = self.settle(1)
        second = self.settle(1, record_id=2, lottery_id=2)
        self.assertTrue(first['attendance_added'])
        self.assertEqual(len(first['new_achievements']), 2)
        self.assertEqual(second, {
            'attendance_count': 1, 'attendance_added': False, 'new_achievements': [],
        })
        self.assertEqual(self.count('achievement_attendance'), 1)
        self.assertEqual(self.count('achievement_rewards'), 0)

    def test_milestones_create_one_physical_reward_and_do_not_reissue_after_redemption(self):
        for activity_id in range(1, 10):
            result = self.settle(activity_id)
        self.assertEqual(result['attendance_count'], 9)
        self.assertEqual([badge['code'] for badge in result['new_achievements']], ['MILESTONE_09'])
        self.assertIsNotNone(result['new_achievements'][0]['reward'])
        self.db.execute('UPDATE achievement_rewards SET status = 1')
        self.settle(9, record_id=10)
        self.assertEqual(self.count('user_achievements'), 3)
        self.assertEqual(self.count('achievement_rewards'), 1)
        self.assertEqual(self.db.execute('SELECT status FROM achievement_rewards').fetchone()[0], 1)
        for activity_id in range(10, 16):
            self.settle(activity_id)
        self.assertEqual(self.count('achievement_rewards'), 2)

    def test_non_official_activity_and_disabled_event_do_not_award(self):
        self.assertFalse(self.settle(100)['attendance_added'])
        self.assertEqual(self.count('achievement_attendance'), 0)
        self.add_event_badge(active=0)
        self.settle(1)
        codes = [row[0] for row in self.db.execute('''
            SELECT d.code FROM user_achievements ua
            JOIN achievement_definitions d ON d.id = ua.achievement_id
        ''')]
        self.assertEqual(codes, ['MILESTONE_01'])

    def test_caller_rollback_removes_attendance_badge_and_reward_together(self):
        for activity_id in range(1, 9):
            self.settle(activity_id)
        self.db.commit()
        self.settle(9)
        self.assertEqual(self.count('achievement_rewards'), 1)
        self.db.rollback()
        self.assertEqual(self.count('achievement_attendance'), 8)
        self.assertEqual(self.count('user_achievements'), 2)
        self.assertEqual(self.count('achievement_rewards'), 0)

    def test_only_published_activity_statuses_create_attendance(self):
        for activity_id, status in enumerate((-1, 0, 1, 2, 3, 4, 5), start=1):
            self.db.execute('UPDATE activities SET status = ? WHERE id = ?', (status, activity_id))
            result = self.settle(activity_id)
            self.assertEqual(result['attendance_added'], status in (1, 3, 4))
        self.assertEqual(count_valid_attendance(self.cursor, 'user'), 3)

    def test_existing_test_draw_and_cancelled_activity_no_longer_count(self):
        for activity_id in range(1, 6):
            self.settle(activity_id)
        self.db.execute('UPDATE activities SET status = -1 WHERE id = 2')
        self.db.execute('UPDATE activities SET status = 5 WHERE id IN (3, 4, 5)')
        self.assertEqual(count_valid_attendance(self.cursor, 'user'), 1)
        self.assertEqual(self.settle(1)['attendance_count'], 1)
        # 历史参与与已经发放的记录保留，后续结算使用有效次数。
        self.assertEqual(self.count('achievement_attendance'), 5)
        self.assertEqual(self.settle(6)['attendance_count'], 2)
        self.assertEqual(self.count('user_achievements'), 2)

    def test_historical_backfill_excludes_drafts_and_cancelled_activities(self):
        for activity_id, status in enumerate((-1, 0, 1, 2, 3, 4, 5), start=1):
            self.db.execute('UPDATE activities SET status = ? WHERE id = ?', (status, activity_id))
            self.db.execute('INSERT INTO activity_lotteries VALUES (?, ?)', (activity_id, activity_id))
            self.db.execute("INSERT INTO lottery_records (lottery_id, user_openid, chance_no) VALUES (?, 'user', 1)", (activity_id,))
        migration = (Path(__file__).resolve().parents[1] / 'migration_v1_6_achievement_center.sql').read_text()
        backfill = migration[migration.index('-- 历史回填'):migration.index('SELECT `TABLE_NAME`')]
        for sql in (part.strip() for part in backfill.split(';') if part.strip()):
            self.cursor.execute(sql)
        self.assertEqual(self.count('achievement_attendance'), 3)
        self.assertEqual(count_valid_attendance(self.cursor, 'user'), 3)
        self.assertEqual(self.count('user_achievements'), 1)

    def test_reward_code_collision_retries_without_losing_reward(self):
        self.db.execute("INSERT INTO lottery_redemptions (redeem_code) VALUES ('collision')")
        for activity_id in range(1, 9):
            self.settle(activity_id)
        with patch('achievement_service._new_reward_code', side_effect=['collision', 'ACH-unique']):
            self.settle(9)
        self.assertEqual(self.db.execute('SELECT redeem_code FROM achievement_rewards').fetchone()[0], 'ACH-unique')

    def test_historical_backfill_counts_actual_official_draws_and_is_rerunnable(self):
        for activity_id in range(1, 10):
            self.db.execute('INSERT INTO activity_lotteries VALUES (?, ?)', (activity_id, activity_id))
            self.db.execute('''
                INSERT INTO lottery_records (lottery_id, user_openid, chance_no)
                VALUES (?, 'user', 1)
            ''', (activity_id,))
        self.db.execute("INSERT INTO lottery_records (lottery_id, user_openid, chance_no) VALUES (1, 'user', 2)")
        self.db.execute('INSERT INTO activity_lotteries VALUES (100, 100)')
        self.db.execute("INSERT INTO lottery_records (lottery_id, user_openid, chance_no) VALUES (100, 'user', 1)")
        migration = (Path(__file__).resolve().parents[1] / 'migration_v1_6_achievement_center.sql').read_text()
        backfill = migration[migration.index('-- 历史回填'):migration.index('SELECT `TABLE_NAME`')]
        statements = [part.strip() for part in backfill.split(';') if part.strip()]
        for sql in statements:
            self.cursor.execute(sql)
        self.assertEqual(self.count('achievement_attendance'), 9)
        self.assertEqual(self.count('user_achievements'), 3)
        self.assertEqual(self.count('achievement_rewards'), 1)
        code = self.db.execute('SELECT redeem_code FROM achievement_rewards').fetchone()[0]
        self.assertEqual(len(code), 32)
        self.db.execute('UPDATE achievement_rewards SET status = 1')
        for sql in statements:
            self.cursor.execute(sql)
        self.assertEqual(self.count('achievement_rewards'), 1)
        self.assertEqual(tuple(self.db.execute('SELECT redeem_code, status FROM achievement_rewards').fetchone()), (code, 1))


if __name__ == '__main__':
    unittest.main()
