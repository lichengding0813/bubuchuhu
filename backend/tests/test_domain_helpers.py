"""不依赖数据库的 v1.4 领域规则回归测试。"""
from datetime import datetime, timedelta
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from domain import (
    activity_times,
    effective_lottery_status,
    published_activity_status,
    validate_activity_payload,
)


class ActivityTimeTests(unittest.TestCase):
    def test_legacy_client_gets_twelve_hour_end_time(self):
        start, end, deadline, error = activity_times({
            'activityTime': '2026-08-10 08:00',
            'deadline': '2026-08-10 07:00',
        })
        self.assertIsNone(error)
        self.assertEqual(end - start, timedelta(hours=12))
        self.assertLess(deadline, start)

    def test_end_must_be_after_start(self):
        *_, error = activity_times({
            'activityTime': '2026-08-10 08:00',
            'endTime': '2026-08-10 08:00',
        })
        self.assertIn('结束时间', error)

    def test_formal_payload_rejects_invalid_coordinates(self):
        error = validate_activity_payload({
            'name': '测试活动', 'description': '描述', 'location': '上海',
            'route': '路线', 'wechat': 'wechat', 'groupQR': 'cloud://qr',
            'difficulty': 3, 'maxParticipants': 20,
            'travelOptions': [1],
            'meetingPoints': [{'time': '2026-08-10 07:00', 'location': '集合点'}],
            'latitude': 100, 'longitude': 121,
        })
        self.assertIn('坐标', error)


class LotteryRuleTests(unittest.TestCase):
    def test_scheduled_lottery_opens_by_time(self):
        now = datetime(2026, 8, 10, 12, 0)
        lottery = {
            'status': 0,
            'start_time': now - timedelta(minutes=1),
            'end_time': now + timedelta(minutes=1),
        }
        self.assertEqual(effective_lottery_status(lottery, now), 1)


class PublishedActivityStatusTests(unittest.TestCase):
    def test_future_activity_is_open_for_registration(self):
        now = datetime(2026, 8, 7, 10, 0)
        self.assertEqual(
            published_activity_status(
                datetime(2026, 8, 8, 8, 0),
                datetime(2026, 8, 8, 18, 0),
                now,
            ),
            1,
        )

    def test_started_and_ended_statuses(self):
        now = datetime(2026, 8, 7, 10, 0)
        self.assertEqual(
            published_activity_status(
                datetime(2026, 8, 7, 8, 0),
                datetime(2026, 8, 7, 18, 0),
                now,
            ),
            3,
        )
        self.assertEqual(
            published_activity_status(
                datetime(2026, 8, 6, 8, 0),
                datetime(2026, 8, 6, 18, 0),
                now,
            ),
            4,
        )


if __name__ == '__main__':
    unittest.main()
