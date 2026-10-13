"""执行实际成就中心查询，验证状态过滤与历史徽章显示。

提取路由函数以复用隔离 SQLite 数据，无 Flask 或生产连接依赖。
"""
import ast
from datetime import datetime
import logging
from pathlib import Path
from types import SimpleNamespace
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from achievement_domain import MILESTONE_TYPE, progress_for_threshold
from achievement_service import count_valid_attendance
import test_achievement_settlement as settlement


class AchievementCenterStatusTests(unittest.TestCase):
    def setUp(self):
        fixture = settlement.AchievementSettlementTests()
        fixture.setUp()
        self.db = fixture.db
        self.addCleanup(self.db.close)
        self.fixture = fixture
        self.db.execute('ALTER TABLE activities ADD COLUMN name TEXT')
        self.db.execute('ALTER TABLE activities ADD COLUMN activity_time TEXT')
        self.db.execute('ALTER TABLE activities ADD COLUMN cover_url TEXT')
        self.db.execute('ALTER TABLE achievement_definitions ADD COLUMN created_at TEXT')
        self.db.execute('ALTER TABLE achievement_definitions ADD COLUMN updated_at TEXT')
        self.db.execute('ALTER TABLE users ADD COLUMN isAdmin INTEGER DEFAULT 0')
        source = Path(__file__).resolve().parents[1] / 'routes/achievement_routes.py'
        module = ast.parse(source.read_text())
        functions = [node for node in module.body if isinstance(node, ast.FunctionDef)
                     and node.name in ('_decorate_badge', 'get_achievement_center', '_admin_config')]
        for node in functions:
            node.decorator_list = []
        scope = {
            'datetime': datetime, 'logging': logging,
            'MILESTONE_TYPE': MILESTONE_TYPE, 'progress_for_threshold': progress_for_threshold,
            'count_valid_attendance': count_valid_attendance,
            'get_db': lambda: SimpleNamespace(cursor=lambda: settlement.SqliteCursor(self.db)),
            'g': SimpleNamespace(openid='user'), 'jsonify': lambda payload: payload,
            '_close': lambda cursor: None,
        }
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), scope)
        self.center = scope['get_achievement_center']
        self.admin_config = scope['_admin_config']

    def test_invalid_history_is_excluded_from_progress_and_lit_milestones(self):
        for activity_id in range(1, 10):
            self.fixture.settle(activity_id)
        for activity_id, status in zip(range(2, 10), (-1, 0, 2, 5, -1, 0, 2, 5)):
            self.db.execute('UPDATE activities SET status = ? WHERE id = ?', (status, activity_id))
        response = self.center()
        self.assertEqual(response['code'], 200)
        data = response['data']
        self.assertEqual(data['attendance_count'], 1)
        self.assertEqual(data['milestone_unlocked'], 1)
        self.assertEqual(data['next_milestone']['threshold_count'], 5)
        self.assertFalse(data['milestones'][1]['unlocked'])
        self.assertEqual(data['milestones'][1]['progress']['current'], 1)
        self.assertEqual(self.fixture.count('achievement_rewards'), 1)
        self.assertEqual(self.fixture.count('achievement_attendance'), 9)
        badges = self.admin_config(settlement.SqliteCursor(self.db))['badges']
        self.assertEqual([item['unlocked_count'] for item in badges], [1, 0, 0, 0, 0, 0])

    def test_event_badge_for_cancelled_source_is_hidden(self):
        self.fixture.add_event_badge()
        self.fixture.settle(1)
        self.fixture.settle(2)
        self.assertEqual(self.center()['data']['event_unlocked'], 1)
        self.db.execute('UPDATE activities SET status = 5 WHERE id = 1')
        data = self.center()['data']
        self.assertEqual(data['attendance_count'], 1)
        self.assertEqual(data['event_badges'], [])
        self.assertEqual(data['milestone_unlocked'], 1)
        badges = self.admin_config(settlement.SqliteCursor(self.db))['badges']
        self.assertEqual(next(item['unlocked_count'] for item in badges if item['code'] == 'EVENT'), 0)


if __name__ == '__main__':
    unittest.main()
