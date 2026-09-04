"""不依赖数据库的 v1.4 领域规则回归测试。"""
from datetime import datetime, timedelta
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from domain import (
    activity_times,
    can_manage_activity_participants,
    effective_lottery_status,
    format_review_date,
    lottery_activity_error,
    normalize_official_activity_data,
    pick_lottery_prize,
    probability_percent_to_bps,
    published_activity_status,
    validate_lottery_probabilities,
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

    def test_formal_payload_requires_map_coordinates(self):
        error = validate_activity_payload({
            'name': '测试活动', 'description': '描述', 'location': '上海',
            'route': '路线', 'wechat': 'wechat', 'groupQR': 'cloud://qr',
            'difficulty': 3, 'maxParticipants': 20,
            'travelOptions': [1],
            'meetingPoints': [{'time': '2026-08-10 07:00', 'location': '集合点'}],
        })
        self.assertIn('地图', error)

    def test_review_import_keeps_date_without_time(self):
        self.assertEqual(
            format_review_date(datetime(2026, 8, 25, 9, 30)),
            '2026.08.25',
        )
        self.assertEqual(format_review_date('2026-8-5 09:30'), '2026.08.05')

    def test_official_activity_can_raise_participant_limit_to_two_hundred(self):
        payload = {
            'name': '测试活动', 'description': '描述', 'location': '上海',
            'route': '路线', 'wechat': 'wechat', 'groupQR': 'cloud://qr',
            'difficulty': 3, 'maxParticipants': 200,
            'travelOptions': [1],
            'meetingPoints': [{'time': '2026-08-10 07:00', 'location': '集合点'}],
            'latitude': 31.2, 'longitude': 121.5,
        }
        self.assertIn('100', validate_activity_payload(payload))
        self.assertIsNone(validate_activity_payload(payload, max_participants_limit=200))


class ParticipantManagementPermissionTests(unittest.TestCase):
    def test_personal_activity_is_managed_only_by_creator(self):
        activity = {'created_by': 'creator', 'is_official': 0}
        self.assertTrue(can_manage_activity_participants(activity, 'creator', {}))
        self.assertFalse(can_manage_activity_participants(
            activity, 'official-user', {'isOfficial': 1}
        ))

    def test_official_activity_is_shared_by_official_accounts(self):
        activity = {'created_by': 'creator', 'is_official': 1}
        self.assertTrue(can_manage_activity_participants(
            activity, 'official-user', {'isOfficial': 1}
        ))
        self.assertFalse(can_manage_activity_participants(activity, 'creator', {}))


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

    def test_probability_is_stored_as_integer_basis_points(self):
        self.assertEqual(probability_percent_to_bps('12.34'), 1234)
        with self.assertRaises(ValueError):
            probability_percent_to_bps(0)

    def test_total_probability_cannot_exceed_one_hundred_percent(self):
        total, error = validate_lottery_probabilities([
            {'probability_bps': 2500},
            {'probability_bps': 5000},
        ])
        self.assertEqual(total, 7500)
        self.assertIsNone(error)
        _, error = validate_lottery_probabilities([
            {'probability_bps': 6000},
            {'probability_bps': 5000},
        ])
        self.assertIn('100%', error)

    def test_stocked_prize_is_selected_and_sold_out_prize_becomes_no_win(self):
        prizes = [
            {'id': 1, 'probability_bps': 1000, 'remaining': 1},
            {'id': 2, 'probability_bps': 2000, 'remaining': 0},
        ]
        self.assertEqual(pick_lottery_prize(prizes, 500)['id'], 1)
        self.assertIsNone(pick_lottery_prize(prizes, 1500))
        self.assertIsNone(pick_lottery_prize(prizes, 9000))


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
