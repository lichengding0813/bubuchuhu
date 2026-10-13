"""成就中心输入校验与纯业务辅助函数。"""


MILESTONE_TYPE = 1
EVENT_BADGE_TYPE = 2


def valid_cloud_asset_url(value):
    """成就素材必须来自小程序云存储，避免重新占用代码包空间。"""
    return isinstance(value, str) and value.strip().startswith('cloud://') and len(value.strip()) <= 500


def normalize_activity_ids(values):
    if values is None:
        return []
    if not isinstance(values, list):
        raise ValueError('关联活动格式无效')
    result = []
    seen = set()
    for value in values:
        try:
            activity_id = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError('关联活动编号无效') from exc
        if activity_id <= 0:
            raise ValueError('关联活动编号无效')
        if activity_id not in seen:
            seen.add(activity_id)
            result.append(activity_id)
    if len(result) > 100:
        raise ValueError('单枚彩蛋徽章最多关联100场活动')
    return result


def normalize_event_badge_payload(data):
    """彩蛋徽章只允许超级管理员维护，里程碑徽章由迁移脚本固定。"""
    name = str(data.get('name') or '').strip()
    description = str(data.get('description') or '').strip()
    image_url = str(data.get('image_url') or '').strip()
    is_active = 1 if data.get('is_active', 1) in (True, 1, '1') else 0
    try:
        sort_order = int(data.get('sort_order') or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError('排序值无效') from exc

    if not name:
        raise ValueError('请填写徽章名称')
    if len(name) > 100:
        raise ValueError('徽章名称不能超过100字')
    if len(description) > 500:
        raise ValueError('徽章说明不能超过500字')
    if not valid_cloud_asset_url(image_url):
        raise ValueError('请上传有效的云存储徽章图片')
    if sort_order < 0 or sort_order > 9999:
        raise ValueError('排序值应在0至9999之间')

    return {
        'name': name,
        'description': description,
        'image_url': image_url,
        'is_active': is_active,
        'sort_order': sort_order,
        'activity_ids': normalize_activity_ids(data.get('activity_ids')),
    }


def progress_for_threshold(attendance_count, threshold):
    """返回展示所需的安全进度，避免前端重复实现成就规则。"""
    count = max(0, int(attendance_count or 0))
    target = max(1, int(threshold or 1))
    return {
        'current': min(count, target),
        'target': target,
        'remaining': max(0, target - count),
        'percent': min(100, int(count * 100 / target)),
    }
