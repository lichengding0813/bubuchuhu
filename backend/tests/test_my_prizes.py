"""执行奖品合并查询，并复现 DictCursor 空结果返回元组的情况。"""
import ast
from datetime import datetime
import logging
from pathlib import Path
import sqlite3
from types import SimpleNamespace
import unittest


class PrizeCursor:
    def __init__(self, db):
        self.cursor = db.cursor()
        self.closed = False

    def execute(self, sql, params):
        self.cursor.execute(sql.replace('%s', '?'), params)

    def fetchall(self):
        rows = [dict(row) for row in self.cursor.fetchall()]
        for row in rows:
            for field in ('drawn_at', 'redeemed_at'):
                if row.get(field):
                    row[field] = datetime.fromisoformat(row[field])
        # PyMySQL DictCursor 只在有行时转换结果，空查询仍是 ()。
        return rows if rows else ()

    def close(self):
        self.closed = True
        self.cursor.close()


class MyPrizesTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.addCleanup(self.db.close)
        self.db.executescript('''
            CREATE TABLE activities (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE activity_lotteries (id INTEGER PRIMARY KEY, activity_id INTEGER, lottery_name TEXT);
            CREATE TABLE lottery_prizes (id INTEGER PRIMARY KEY, tier_name TEXT, image_url TEXT,
                claim_instructions TEXT, pickup_location TEXT);
            CREATE TABLE lottery_records (id INTEGER PRIMARY KEY, drawn_at TEXT,
                lottery_id INTEGER, prize_id INTEGER, user_openid TEXT);
            CREATE TABLE lottery_redemptions (record_id INTEGER, redeem_code TEXT, status INTEGER, redeemed_at TEXT);
            CREATE TABLE achievement_rewards (id INTEGER PRIMARY KEY, created_at TEXT, source_activity_id INTEGER,
                prize_name TEXT, image_url TEXT, claim_instructions TEXT, pickup_location TEXT,
                redeem_code TEXT, status INTEGER, redeemed_at TEXT, user_openid TEXT);
            INSERT INTO activities VALUES (1, '活动');
            INSERT INTO activity_lotteries VALUES (1, 1, '抽奖');
            INSERT INTO lottery_prizes VALUES (1, '抽奖奖品', 'cloud://prize', '联系领取', '集合点');
        ''')
        self.cursors = []

        def cursor():
            value = PrizeCursor(self.db)
            self.cursors.append(value)
            return value

        source = Path(__file__).resolve().parents[1] / 'routes/lottery_routes.py'
        tree = ast.parse(source.read_text())
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                     and node.name in {'my_lottery_prizes', '_close', '_format_minute', '_redemption_label'}]
        for node in functions:
            node.decorator_list = []
        scope = {'get_db': lambda: SimpleNamespace(cursor=cursor), 'g': SimpleNamespace(openid='test-only'),
                 'jsonify': lambda result: result, 'datetime': datetime, 'logging': logging}
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), scope)
        self.fetch = scope['my_lottery_prizes']

    def lottery(self, user='test-only'):
        self.db.execute('INSERT INTO lottery_records VALUES (1, ?, 1, 1, ?)', ('2026-10-12 18:00:00', user))
        self.db.execute('INSERT INTO lottery_redemptions VALUES (1, ?, 0, NULL)', ('TEST-LOTTERY',))

    def achievement(self, user='test-only'):
        self.db.execute('''INSERT INTO achievement_rewards VALUES
            (1, '2026-10-13 09:00:00', NULL, '成就奖品', 'cloud://badge', '联系领取', '集合点',
             'TEST-ACHIEVEMENT', 1, '2026-10-13 10:00:00', ?)''', (user,))

    def test_no_prizes_returns_empty_list_and_closes_cursor(self):
        self.assertEqual(self.fetch(), {'code': 200, 'data': []})
        self.assertTrue(self.cursors[-1].closed)

    def test_only_achievement_prize_merges_into_empty_lottery_tuple(self):
        self.achievement()
        result = self.fetch()
        self.assertEqual(result['code'], 200)
        self.assertEqual(len(result['data']), 1)
        prize = result['data'][0]
        self.assertEqual(prize['source_type'], 'achievement')
        self.assertEqual(prize['prize_key'], 'achievement-1')
        self.assertEqual(prize['activity_name'], '累计成就')
        self.assertEqual(prize['redemption_label'], '已核销')
        self.assertEqual(prize['redeemed_at'], '2026-10-13 10:00')
        self.assertIsNone(prize['record_id'])

    def test_only_lottery_prize_keeps_redemption_fields(self):
        self.lottery()
        result = self.fetch()
        self.assertEqual(result['code'], 200)
        self.assertEqual(len(result['data']), 1)
        self.assertEqual(result['data'][0]['redeem_code'], 'TEST-LOTTERY')
        self.assertEqual(result['data'][0]['prize_key'], 'lottery-1')
        self.assertEqual(result['data'][0]['redemption_label'], '待核销')
        self.assertEqual(result['data'][0]['redeemed_at'], '')

    def test_mixed_prizes_are_sorted_and_source_keys_do_not_collide(self):
        self.lottery()
        self.achievement()
        result = self.fetch()
        self.assertEqual(result['code'], 200)
        self.assertEqual([p['prize_key'] for p in result['data']], ['achievement-1', 'lottery-1'])
        self.assertEqual([p['drawn_at'] for p in result['data']], ['2026-10-13 09:00', '2026-10-12 18:00'])
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM achievement_rewards').fetchone()[0], 1)

    def test_other_users_prizes_are_excluded(self):
        self.lottery(user='other-test-only')
        self.achievement(user='other-test-only')
        self.assertEqual(self.fetch(), {'code': 200, 'data': []})


if __name__ == '__main__':
    unittest.main()
