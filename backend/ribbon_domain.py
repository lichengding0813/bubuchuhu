"""Pure validation helpers for the configurable ribbon wall feature."""

MAX_WALL_RIBBONS = 4
MAX_WALL_CHARMS = 3


def _text(value, field_name, max_length, required=False):
    value = str(value or '').strip()
    if required and not value:
        raise ValueError(f'请填写{field_name}')
    if len(value) > max_length:
        raise ValueError(f'{field_name}不能超过{max_length}个字符')
    return value


def _flag(value, default=1):
    if value is None:
        return int(default)
    if isinstance(value, bool):
        return int(value)
    if value in (0, 1, '0', '1'):
        return int(value)
    raise ValueError('启用状态无效')


def valid_asset_url(value):
    """Ribbon-wall assets must live in WeChat cloud storage."""
    value = str(value or '').strip()
    return bool(value) and len(value) <= 500 and value.startswith('cloud://')


def normalize_charms(values):
    if values is None:
        return None
    if not isinstance(values, list):
        raise ValueError('挂件配置格式无效')
    if len(values) > MAX_WALL_CHARMS:
        raise ValueError(f'每面墙最多配置{MAX_WALL_CHARMS}个挂件')
    normalized = []
    for value in values:
        value = str(value or '').strip()
        if value and not valid_asset_url(value):
            raise ValueError('挂件图片地址无效')
        normalized.append(value)
    while len(normalized) < MAX_WALL_CHARMS:
        normalized.append('')
    return normalized


def normalize_wall_payload(data, partial=False):
    data = data if isinstance(data, dict) else {}
    result = {}
    if not partial or 'title' in data:
        result['title'] = _text(data.get('title'), '墙面名称', 60, required=True)
    if not partial or 'subtitle' in data:
        result['subtitle'] = _text(data.get('subtitle'), '墙面文案', 120)
    if not partial or 'is_active' in data:
        result['is_active'] = _flag(data.get('is_active'), default=0)
    if 'charm_urls' in data:
        result['charm_urls'] = normalize_charms(data.get('charm_urls'))
    if partial and not result:
        raise ValueError('没有可更新的墙面信息')
    return result


def normalize_ribbon_payload(data, partial=False):
    data = data if isinstance(data, dict) else {}
    result = {}
    if not partial or 'name' in data:
        result['name'] = _text(data.get('name'), '飘带名称', 100, required=True)
    if not partial or 'description' in data:
        result['description'] = _text(data.get('description'), '飘带说明', 500)
    if not partial or 'image_url' in data:
        image_url = str(data.get('image_url') or '').strip()
        if not valid_asset_url(image_url):
            raise ValueError('请上传有效的飘带图片')
        result['image_url'] = image_url
    if not partial or 'is_active' in data:
        result['is_active'] = _flag(data.get('is_active'), default=1)
    if partial and not result:
        raise ValueError('没有可更新的飘带信息')
    return result


def normalize_ribbon_ids(values):
    if not isinstance(values, list):
        raise ValueError('飘带列表格式无效')
    if len(values) > MAX_WALL_RIBBONS:
        raise ValueError(f'每面墙最多放置{MAX_WALL_RIBBONS}条飘带')
    normalized = []
    for value in values:
        try:
            ribbon_id = int(value)
        except (TypeError, ValueError):
            raise ValueError('飘带编号无效')
        if ribbon_id <= 0:
            raise ValueError('飘带编号无效')
        if ribbon_id in normalized:
            raise ValueError('同一面墙不能重复放置飘带')
        normalized.append(ribbon_id)
    return normalized
