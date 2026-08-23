"""不依赖 Flask/数据库的业务规则，便于独立测试。"""
from datetime import datetime, timedelta
import re

OFFICIAL_TITLE_PREFIX = '【步步出沪】'


def normalize_official_activity_data(data):
    """补齐并去重官方活动标题前缀，拒绝只有前缀的空标题。"""
    normalized = dict(data or {})
    title = str(normalized.get('name') or '').strip()
    while title.startswith(OFFICIAL_TITLE_PREFIX):
        title = title[len(OFFICIAL_TITLE_PREFIX):].lstrip()
    if not title:
        return normalized, '请填写官方活动名称'
    normalized['name'] = f'{OFFICIAL_TITLE_PREFIX}{title}'
    return normalized, None


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


def lottery_activity_error(activity):
    """抽奖只能关联已发布或已结束的官方活动。"""
    if not activity:
        return '活动不存在'
    if int(activity.get('is_official') or 0) != 1:
        return '只有官方活动可以创建抽奖'
    if int(activity.get('status')) not in (1, 3, 4):
        return '该官方活动当前不能创建抽奖'
    return None


def weather_location_candidates(city='', latitude=None, longitude=None):
    """生成天气服务位置候选：优先坐标，再尝试地点与行政区名称。"""
    candidates = []

    try:
        lat = float(latitude)
        lon = float(longitude)
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            candidates.append(f'{lat:.6f}:{lon:.6f}')
    except (TypeError, ValueError):
        pass

    text = re.sub(r'\s+', '', str(city or '').strip())
    if text:
        candidates.append(text)
        first_part = re.split(r'[,，、/|·（(]', text, maxsplit=1)[0]
        if first_part:
            candidates.append(first_part)

        # 历史活动多使用景区名且没有坐标，补充常见目的地对应的天气城市。
        scenic_aliases = (
            ('武功山', '萍乡'),
            ('龙王潭', '安吉'),
            ('安吉', '安吉'),
            ('上虞', '绍兴'),
            ('九溪', '杭州'),
            ('天目山', '杭州'),
            ('大明山', '杭州'),
            ('清凉峰', '杭州'),
            ('莫干山', '湖州'),
            ('四明山', '宁波'),
        )
        for keyword, weather_city in scenic_aliases:
            if keyword in text:
                candidates.append(weather_city)

        municipality = re.search(r'(北京|上海|天津|重庆|香港|澳门)', text)
        if municipality:
            candidates.append(municipality.group(1))

        if not re.search(r'(?:自治州|自治区|地区|盟|省|市|县|区)', text):
            # 兼容“安吉龙王潭”“绍兴上虞”这类把行政区和景点连写的旧地点。
            for length in (2, 3, 4):
                if len(text) >= length:
                    candidates.append(text[:length])

        without_province = re.sub(r'^.*?(?:省|自治区)', '', text)
        scan_texts = [without_province, text] if without_province and without_province != text else [text]
        for scan_text in scan_texts:
            for match in re.finditer(r'([\u4e00-\u9fff]{2,10}?(?:自治州|地区|盟|市|县|区))', scan_text):
                name = match.group(1)
                candidates.append(re.sub(r'(?:自治州|地区|盟|市|县|区)$', '', name))
                candidates.append(name)

    unique = []
    for candidate in candidates:
        if candidate and candidate not in unique:
            unique.append(candidate)
    return unique[:6]


def validate_weather_date(value, today=None):
    """校验单日天气日期；预报接口支持近期历史和未来 16 天。"""
    try:
        target = datetime.strptime(str(value or ''), '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return None, '日期参数无效'

    current = today or datetime.now().date()
    if target < current - timedelta(days=92):
        return None, '仅支持查询最近92天的天气'
    if target > current + timedelta(days=15):
        return None, '仅支持查询未来15天的天气预报'
    return target, None


def weather_code_summary(code):
    """将 WMO 天气代码转换为小程序展示文本和 Vant 图标。"""
    try:
        value = int(code)
    except (TypeError, ValueError):
        return '天气未知', 'cloud-o'

    if value == 0:
        return '晴', 'sunny-o'
    if value in (1, 2):
        return '晴间多云', 'cloud'
    if value == 3:
        return '阴', 'cloud-o'
    if value in (45, 48):
        return '雾', 'warn-o'
    if value in (51, 53, 55, 56, 57):
        return '毛毛雨', 'rain-o'
    if value in (61, 63, 65, 66, 67, 80, 81, 82):
        return '雨', 'rain-o'
    if value in (71, 73, 75, 77, 85, 86):
        return '雪', 'snow-o'
    if value in (95, 96, 99):
        return '雷雨', 'rain-o'
    return '天气未知', 'cloud-o'
