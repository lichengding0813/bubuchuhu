"""不依赖 Flask/数据库的业务规则，便于独立测试。"""
from datetime import datetime, timedelta


def parse_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    normalized = str(value).strip().replace('T', ' ')
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M'):
        try:
            return datetime.strptime(normalized, fmt)
        except ValueError:
            continue
    raise ValueError('时间格式应为 YYYY-MM-DD HH:MM')


def activity_times(data, allow_partial=False):
    """解析并校验报名截止、开始、结束时间；旧客户端按 12 小时兼容。"""
    try:
        start_time = parse_datetime(data.get('activityTime'))
        deadline = parse_datetime(data.get('deadline'))
        end_time = parse_datetime(data.get('endTime'))
    except ValueError as exc:
        return None, None, None, str(exc)

    if not start_time:
        if allow_partial:
            return None, end_time, deadline, None
        return None, None, None, '缺少活动开始时间'
    if not end_time:
        end_time = start_time + timedelta(hours=12)
    if end_time <= start_time:
        return None, None, None, '活动结束时间必须晚于开始时间'
    if deadline and deadline > start_time:
        return None, None, None, '报名截止时间不能晚于活动开始时间'
    return start_time, end_time, deadline, None


def validate_activity_payload(data):
    """校验正式发布/重提所需字段，不能只依赖前端按钮状态。"""
    required = {
        'name': '活动名称',
        'description': '活动描述',
        'location': '活动地点',
        'route': '路线简介',
        'wechat': '发起人微信号',
        'groupQR': '微信群二维码',
    }
    missing = [label for key, label in required.items() if not str(data.get(key) or '').strip()]
    if missing:
        return f'缺少必填信息：{"、".join(missing)}'
    if len(str(data.get('name'))) > 30:
        return '活动名称不能超过30字'
    try:
        difficulty = int(data.get('difficulty'))
        max_participants = int(data.get('maxParticipants'))
    except (TypeError, ValueError):
        return '难度和人数限制格式无效'
    if difficulty not in range(1, 6):
        return '难度等级需为1至5星'
    if max_participants < 2 or max_participants > 100:
        return '人数限制需在2至100之间'

    travel_options = data.get('travelOptions') or []
    if not travel_options or any(option not in (1, 2, 3) for option in travel_options):
        return '请至少选择一种有效出行方式'
    meeting_points = data.get('meetingPoints') or []
    if not meeting_points or any(
        not point.get('time') or not str(point.get('location') or '').strip()
        for point in meeting_points
    ):
        return '请完整填写集合点时间和地点'

    latitude, longitude = data.get('latitude'), data.get('longitude')
    if (latitude is None) != (longitude is None):
        return '活动地点坐标不完整'
    if latitude is not None:
        try:
            if not -90 <= float(latitude) <= 90 or not -180 <= float(longitude) <= 180:
                return '活动地点坐标无效'
        except (TypeError, ValueError):
            return '活动地点坐标无效'
    return None


def published_activity_status(start_time, end_time, now=None):
    """正式活动按起止时间直接进入报名中、进行中或已结束状态。"""
    now = now or datetime.now()
    if end_time and end_time <= now:
        return 4
    if start_time and start_time <= now:
        return 3
    return 1


def effective_lottery_status(lottery, now=None):
    """数据库 2 表示手动结束；0/1 均由起止时间决定展示状态。"""
    now = now or datetime.now()
    if lottery['status'] == 2 or now > lottery['end_time']:
        return 2
    if now < lottery['start_time']:
        return 0
    return 1
