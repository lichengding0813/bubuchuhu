"""成就中心不依赖数据库的业务规则回归测试。"""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from achievement_domain import (
    normalize_activity_ids,
    normalize_event_badge_payload,
    progress_for_threshold,
    valid_cloud_asset_url,
)


class AchievementDomainTests(unittest.TestCase):
    def test_badge_requires_cloud_asset(self):
        self.assertTrue(valid_cloud_asset_url('cloud://prod/achievement/badge.png'))
        self.assertFalse(valid_cloud_asset_url('/images/badge.png'))
        with self.assertRaisesRegex(ValueError, '云存储'):
            normalize_event_badge_payload({
                'name': '彩蛋',
                'image_url': 'https://example.com/badge.png',
            })

    def test_activity_ids_are_unique_and_positive(self):
        self.assertEqual(normalize_activity_ids(['1', 2, 1]), [1, 2])
        with self.assertRaisesRegex(ValueError, '活动编号'):
            normalize_activity_ids([0])

    def test_progress_is_clamped(self):
        self.assertEqual(progress_for_threshold(4, 5), {
            'current': 4, 'target': 5, 'remaining': 1, 'percent': 80,
        })
        self.assertEqual(progress_for_threshold(9, 5)['percent'], 100)


if __name__ == '__main__':
    unittest.main()
