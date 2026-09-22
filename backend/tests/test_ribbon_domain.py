"""Validation regression tests for configurable ribbon walls."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ribbon_domain import (
    normalize_charm_payload,
    normalize_charms,
    normalize_ordered_items,
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

    def test_charm_uses_cloud_asset_validation(self):
        payload = normalize_charm_payload({
            'name': '新挂件',
            'image_url': 'cloud://prod/ribbon-wall/charms/new.png',
        })
        self.assertEqual(payload['name'], '新挂件')

    def test_combined_preview_order_supports_ribbons_and_charms(self):
        layout = normalize_ordered_items([
            {'type': 'ribbon', 'id': 1},
            {'type': 'charm', 'id': 2},
            {'type': 'ribbon', 'id': 3},
        ])
        self.assertEqual(layout['ribbon_ids'], [1, 3])
        self.assertEqual(layout['charm_ids'], [2])

    def test_combined_preview_order_rejects_duplicates_and_limits(self):
        with self.assertRaisesRegex(ValueError, '重复'):
            normalize_ordered_items([
                {'type': 'charm', 'id': 1},
                {'type': 'charm', 'id': 1},
            ])
        with self.assertRaisesRegex(ValueError, '最多放置4条飘带'):
            normalize_ordered_items([
                {'type': 'ribbon', 'id': value}
                for value in range(1, 6)
            ])


if __name__ == '__main__':
    unittest.main()
