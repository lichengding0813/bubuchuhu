"""不依赖数据库的 v1.4 领域规则回归测试。"""
from datetime import datetime, timedelta
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from domain import (
    activity_times,
    effective_lottery_status,
    lottery_activity_error,
    normalize_official_activity_data,
    published_activity_status,
    validate_activity_payload,
    validate_weather_date,
    weather_code_summary,
    weather_location_candidates,
)


class OfficialActivityTitleTests(unittest.TestCase):
    def test_prefix_is_added_and_duplicate_prefixes_are_collapsed(self):
        normalized, error = normalize_official_activity_data({'name': '龙王潭'})
        self.assertIsNone(error)
        self.assertEqual(normalized['name'], '【步步出沪】龙王潭')

        normalized, error = normalize_official_activity_data({
            'name': '【步步出沪】【步步出沪】 龙王潭'
        })
        self.assertIsNone(error)
        self.assertEqual(normalized['name'], '【步步出沪】龙王潭')

    def test_prefix_only_title_is_rejected(self):
        _, error = normalize_official_activity_data({'name': '【步步出沪】'})
        self.assertEqual(error, '请填写官方活动名称')


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

    def test_only_official_published_activity_can_create_lottery(self):
        self.assertEqual(
            lottery_activity_error({'is_official': 0, 'status': 1}),
            '只有官方活动可以创建抽奖',
        )
        self.assertEqual(
            lottery_activity_error({'is_official': 1, 'status': 0}),
            '该官方活动当前不能创建抽奖',
        )
        self.assertIsNone(lottery_activity_error({'is_official': 1, 'status': 4}))


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


class WeatherLocationTests(unittest.TestCase):
    def test_coordinates_are_preferred_to_scenic_spot_name(self):
        candidates = weather_location_candidates('安吉龙王潭', 30.63, 119.68)
        self.assertEqual(candidates[0], '30.630000:119.680000')
        self.assertIn('安吉龙王潭', candidates)

    def test_legacy_scenic_spot_name_falls_back_to_leading_county(self):
        candidates = weather_location_candidates('安吉龙王潭')
        self.assertIn('安吉', candidates)

    def test_city_name_is_extracted_from_address(self):
        candidates = weather_location_candidates('浙江省绍兴市上虞区')
        self.assertIn('绍兴市', candidates)
        self.assertIn('绍兴', candidates)

    def test_scenic_spot_falls_back_to_nearby_weather_city(self):
        self.assertIn('萍乡', weather_location_candidates('武功山'))
        self.assertIn('安吉', weather_location_candidates('龙王潭'))

    def test_selected_weather_date_is_limited_to_available_range(self):
        today = datetime(2026, 8, 23).date()
        target, error = validate_weather_date('2026-08-30', today)
        self.assertEqual(target.isoformat(), '2026-08-30')
        self.assertIsNone(error)
        _, error = validate_weather_date('2026-09-10', today)
        self.assertIn('未来15天', error)

    def test_wmo_weather_code_is_converted_for_miniprogram(self):
        self.assertEqual(weather_code_summary(0), ('晴', 'sunny-o'))
        self.assertEqual(weather_code_summary(95), ('雷雨', 'rain-o'))


if __name__ == '__main__':
    unittest.main()
