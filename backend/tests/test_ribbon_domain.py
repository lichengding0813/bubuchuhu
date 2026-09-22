"""Validation regression tests for configurable ribbon walls."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ribbon_domain import (
    normalize_charms,
    normalize_ribbon_ids,
    normalize_ribbon_payload,
    normalize_wall_payload,
    valid_asset_url,
)


class RibbonDomainTests(unittest.TestCase):
    def test_wall_accepts_three_configurable_charms(self):
        payload = normalize_wall_payload({
            'title': '飘带墙 03',
            'subtitle': '新的一面墙',
            'charm_urls': ['cloud://env/a.png', '', 'cloud://env/b.png'],
        })
        self.assertEqual(payload['title'], '飘带墙 03')
        self.assertEqual(len(payload['charm_urls']), 3)

    def test_wall_requires_a_title(self):
        with self.assertRaisesRegex(ValueError, '墙面名称'):
            normalize_wall_payload({'title': ''})

    def test_new_wall_defaults_to_draft(self):
        payload = normalize_wall_payload({'title': '新墙面'})
        self.assertEqual(payload['is_active'], 0)

    def test_wall_allows_at_most_four_unique_ribbons(self):
        self.assertEqual(normalize_ribbon_ids(['1', 2, 3, 4]), [1, 2, 3, 4])
        with self.assertRaisesRegex(ValueError, '最多放置4条'):
            normalize_ribbon_ids([1, 2, 3, 4, 5])
        with self.assertRaisesRegex(ValueError, '不能重复'):
            normalize_ribbon_ids([1, 1])

    def test_only_cloud_assets_are_accepted(self):
        self.assertTrue(valid_asset_url('cloud://prod/ribbons/one.webp'))
        self.assertFalse(valid_asset_url('/images/ribbons/one.webp'))
        self.assertFalse(valid_asset_url('https://untrusted.example/one.webp'))
        with self.assertRaisesRegex(ValueError, '有效的飘带图片'):
            normalize_ribbon_payload({'name': '测试', 'image_url': 'https://example.com/a.png'})

    def test_missing_charm_slots_are_padded(self):
        self.assertEqual(
            normalize_charms(['cloud://env/a.png']),
            ['cloud://env/a.png', '', ''],
        )


if __name__ == '__main__':
    unittest.main()
