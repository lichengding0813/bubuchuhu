from flask import Blueprint, request, jsonify, g
from datetime import datetime, timedelta
import secrets
import logging
import os
import time
import requests
from db_utils import get_db
from domain import (
    activity_times,
    normalize_official_activity_data,
    published_activity_status,
    validate_activity_payload,
    validate_weather_date,
    weather_code_summary,
    weather_location_candidates,
)

from middleware import check_verified_and_blacklist

activity_bp = Blueprint('activity', __name__)

_calendar_weather_cache = {}
_CALENDAR_WEATHER_CACHE_TTL = 30 * 60
_WEATHER_CA_BUNDLE = '/etc/ssl/certs/ca-certificates.crt'
_weather_session = requests.Session()
# 云托管环境变量中可能存在 HTTPS 代理，固定公网天气接口无需继承代理。
_weather_session.trust_env = False


def _weather_request(url, params):
    verify = _WEATHER_CA_BUNDLE if os.path.isfile(_WEATHER_CA_BUNDLE) else True
    return _weather_session.get(url, params=params, timeout=(3, 6), verify=verify)


def _valid_coordinates(latitude, longitude):
    try:
        lat = float(latitude)
        lon = float(longitude)
    except (TypeError, ValueError):
        return None
    if -90 <= lat <= 90 and -180 <= lon <= 180:
        return lat, lon
    return None


def _resolve_weather_location(city, latitude, longitude):
    coordinates = _valid_coordinates(latitude, longitude)
    if coordinates:
        return coordinates[0], coordinates[1], city or '活动地点'

    for candidate in weather_location_candidates(city):
        if ':' in candidate:
            continue
        response = _weather_request(
            'https://geocoding-api.open-meteo.com/v1/search',
            {
                'name': candidate,
                'count': 1,
                'language': 'zh',
                'countryCode': 'CN',
            },
        )
        if response.status_code >= 500:
            response.raise_for_status()
        if response.status_code != 200:
            continue
        data = response.json()
        results = data.get('results') or []
        if results:
            location = results[0]
            coordinates = _valid_coordinates(location.get('latitude'), location.get('longitude'))
            if coordinates:
                return coordinates[0], coordinates[1], location.get('name') or candidate
    return None


def generate_activity_no():
    """生成活动编号：ACT + 年月日 + 6位随机十六进制数。"""
    date_str = datetime.now().strftime('%Y%m%d')
    return f"ACT{date_str}{secrets.token_hex(3).upper()}"


def _get_official_flag(cursor, openid):
    """读取账号当前白名单状态，统一返回 0/1。"""
    cursor.execute("SELECT isOfficial FROM users WHERE openId = %s", (openid,))
    user = cursor.fetchone()
    return 1 if user and user.get('isOfficial') == 1 else 0


def _check_activity_content(data, openid):
    """执行微信文本内容安全检测，返回错误信息或 None。"""
    from app import check_text_security

    texts_to_check = [
        (data.get('name', ''), '活动名称'),
        (data.get('description', ''), '活动描述'),
        (data.get('location', ''), '活动地点'),
        (data.get('route', ''), '路线'),
    ]
    for index, point in enumerate(data.get('meetingPoints') or []):
        location = point.get('location', '')
        if location:
            texts_to_check.append((location, f'集合点{index + 1}地点'))

    for text, label in texts_to_check:
        if text and str(text).strip():
            is_safe, message = check_text_security(
                text,
                openid,
                scene=1,
                title=data.get('name', ''),
            )
            if not is_safe:
                return f'{label}{message}'
    return None


def _insert_activity_options(cursor, activity_id, data):
    """写入活动出行方式与集合点。"""
    for travel_type in data.get('travelOptions') or []:
        cursor.execute(
            "INSERT INTO activity_travel_options (activity_id, travel_type, bus_qr_url) VALUES (%s, %s, %s)",
            (activity_id, travel_type, None)
        )
    for index, point in enumerate(data.get('meetingPoints') or []):
        cursor.execute(
            """
            INSERT INTO activity_meeting_points
                (activity_id, point_order, meeting_time, location, latitude, longitude)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                activity_id,
                index + 1,
                point.get('time'),
                point.get('location'),
                point.get('latitude'),
                point.get('longitude'),
            )
        )


def _refresh_activity_statuses(cursor, now=None):
    """按明确结束时间刷新状态；旧数据以开始后 12 小时作为兼容结束时间。"""
    now = now or datetime.now()
    cursor.execute("""
        UPDATE activities
        SET status = 4
        WHERE status IN (1, 3)
          AND COALESCE(end_time, DATE_ADD(activity_time, INTERVAL 12 HOUR)) <= %s
    """, (now,))
    ended = cursor.rowcount
    cursor.execute("""
        UPDATE activities
        SET status = 3
        WHERE status = 1
          AND activity_time <= %s
          AND COALESCE(end_time, DATE_ADD(activity_time, INTERVAL 12 HOUR)) > %s
    """, (now, now))
    return cursor.rowcount, ended


@activity_bp.route('/create', methods=['POST'])
@check_verified_and_blacklist
def create_activity():
    """创建活动"""
    openid = g.openid
    data = request.get_json(silent=True) or {}
    payload_error = validate_activity_payload(data)
    if payload_error:
        return jsonify({'code': 400, 'msg': payload_error})
    start_time, end_time, deadline, time_error = activity_times(data)
    if time_error:
        return jsonify({'code': 400, 'msg': time_error})
    conn = None
    cursor = None

    # ==================== 内容安全检测 ====================
    from app import check_text_security
    openid_for_check = openid
    texts_to_check = [
        ('name', data.get('name', ''), '活动名称'),
        ('description', data.get('description', ''), '活动描述'),
        ('location', data.get('location', ''), '活动地点'),
        ('route', data.get('route', ''), '路线'),
    ]
    # 集合点地点也需要检测
    for idx, point in enumerate(data.get('meetingPoints', [])):
        loc = point.get('location', '')
        if loc:
            texts_to_check.append((f'meeting_point_{idx}', loc, f'集合点{idx+1}地点'))

    for field_name, text, field_label in texts_to_check:
        if text and text.strip():
            is_safe, msg = check_text_security(text, openid_for_check, scene=1, title=data.get('name', ''))
            if not is_safe:
                return jsonify({'code': 400, 'msg': f'{field_label}{msg}'})
    # ==================== 内容安全检测结束 ====================

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 生成活动编号
        activity_no = generate_activity_no()
        # 普通发布入口始终创建普通活动；官方活动使用独立接口。
        is_official = 0

        # 1. 插入活动主表（增加 is_force_insurance 字段）
        sql = """
        INSERT INTO activities (
            activity_no, name, description, activity_time, end_time, location,
            route, latitude, longitude, distance, climb, difficulty, max_participants,
            deadline, cover_url, group_qr_url, wechat_id, created_by,
            status, is_force_insurance, is_official, created_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        """

        cursor.execute(sql, (
            activity_no,
            data.get('name'),
            data.get('description'),
            start_time,
            end_time,
            data.get('location'),
            data.get('route'),
            data.get('latitude'),
            data.get('longitude'),
            data.get('distance', 0),
            data.get('climb', 0),
            data.get('difficulty'),
            data.get('maxParticipants', 20),
            deadline,
            data.get('cover'),
            data.get('groupQR'),
            data.get('wechat'),
            openid,
            0,  # 默认待审核
            data.get('mandatoryInsurance', 0),  # 是否强制保险，默认0
            is_official
        ))

        activity_id = cursor.lastrowid

        # 2. 插入出行方式
        travel_options = data.get('travelOptions', [])
        for travel_type in travel_options:
            cursor.execute(
                "INSERT INTO activity_travel_options (activity_id, travel_type, bus_qr_url) VALUES (%s, %s, %s)",
                (activity_id, travel_type, None)
            )

        # 3. 插入集合点
        meeting_points = data.get('meetingPoints', [])
        for index, point in enumerate(meeting_points):
            cursor.execute(
                "INSERT INTO activity_meeting_points (activity_id, point_order, meeting_time, location, latitude, longitude) VALUES (%s, %s, %s, %s, %s, %s)",
                (activity_id, index + 1, point.get('time'), point.get('location'),
                 point.get('latitude'), point.get('longitude'))
            )

        # 4. 插入审核记录
        cursor.execute(
            "INSERT INTO activity_audit_logs (activity_id, action, created_at) VALUES (%s, %s, NOW())",
            (activity_id, 1)
        )

        conn.commit()

        return jsonify({
            'code': 200,
            'msg': '活动创建成功',
            'data': {'activity_id': activity_id, 'activity_no': activity_no}
        })

    except Exception:
        if conn:
            conn.rollback()
        logging.exception("数据库操作失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ==================== 官方活动共享发布 ====================

@activity_bp.route('/official-activities', methods=['GET'])
@check_verified_and_blacklist
def get_official_activities():
    """官方账号查看全部官方活动；列表对所有官方账号共享。"""
    openid = g.openid
    page = max(request.args.get('page', 1, type=int) or 1, 1)
    size = min(max(request.args.get('size', 30, type=int) or 30, 1), 100)
    offset = (page - 1) * size
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        if _get_official_flag(cursor, openid) != 1:
            return jsonify({'code': 403, 'msg': '仅官方账号可管理官方活动'})

        _refresh_activity_statuses(cursor)
        conn.commit()
        cursor.execute(
            "SELECT COUNT(*) AS total FROM activities WHERE is_official = 1 AND status != -1"
        )
        total = cursor.fetchone()['total']
        cursor.execute("""
            SELECT a.*,
                   u.nickName AS creator_name,
                   u.avatarUrl AS creator_avatar,
                   COALESCE(pc.participant_count, 0) AS participant_count
            FROM activities a
            LEFT JOIN users u ON a.created_by = u.openId
            LEFT JOIN (
                SELECT activity_id, SUM(companion_count + 1) AS participant_count
                FROM activity_participants
                WHERE status = 1
                GROUP BY activity_id
            ) pc ON pc.activity_id = a.id
            WHERE a.is_official = 1 AND a.status != -1
            ORDER BY a.activity_time DESC, a.created_at DESC
            LIMIT %s OFFSET %s
        """, (size, offset))
        return jsonify({
            'code': 200,
            'data': {
                'list': cursor.fetchall(),
                'total': total,
                'page': page,
                'size': size,
            }
        })
    except Exception:
        logging.exception("获取官方活动列表失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/official-activities/create', methods=['POST'])
@check_verified_and_blacklist
def create_official_activity():
    """官方账号从独立入口直接发布官方活动，无需人工审核。"""
    openid = g.openid
    data, title_error = normalize_official_activity_data(request.get_json(silent=True) or {})
    if title_error:
        return jsonify({'code': 400, 'msg': title_error})
    payload_error = validate_activity_payload(data)
    if payload_error:
        return jsonify({'code': 400, 'msg': payload_error})
    start_time, end_time, deadline, time_error = activity_times(data)
    if time_error:
        return jsonify({'code': 400, 'msg': time_error})
    content_error = _check_activity_content(data, openid)
    if content_error:
        return jsonify({'code': 400, 'msg': content_error})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        if _get_official_flag(cursor, openid) != 1:
            return jsonify({'code': 403, 'msg': '仅官方账号可发布官方活动'})

        activity_no = generate_activity_no()
        status = published_activity_status(start_time, end_time)
        cursor.execute("""
            INSERT INTO activities (
                activity_no, name, description, activity_time, end_time, location,
                route, latitude, longitude, distance, climb, difficulty, max_participants,
                deadline, cover_url, group_qr_url, wechat_id, created_by,
                status, is_force_insurance, is_official, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1, NOW())
        """, (
            activity_no,
            data.get('name'),
            data.get('description'),
            start_time,
            end_time,
            data.get('location'),
            data.get('route'),
            data.get('latitude'),
            data.get('longitude'),
            data.get('distance', 0),
            data.get('climb', 0),
            data.get('difficulty'),
            data.get('maxParticipants', 20),
            deadline,
            data.get('cover'),
            data.get('groupQR'),
            data.get('wechat'),
            openid,
            status,
            data.get('mandatoryInsurance', 0),
        ))
        activity_id = cursor.lastrowid
        _insert_activity_options(cursor, activity_id, data)
        cursor.execute("""
            INSERT INTO activity_audit_logs
                (activity_id, auditor_openid, action, reason, created_at)
            VALUES (%s, %s, 2, %s, NOW())
        """, (activity_id, openid, '官方活动免审核直接发布'))
        conn.commit()
        return jsonify({
            'code': 200,
            'msg': '官方活动已直接发布',
            'data': {'activity_id': activity_id, 'activity_no': activity_no, 'status': status}
        })
    except Exception:
        if conn:
            conn.rollback()
        logging.exception("发布官方活动失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/official-activities/update', methods=['POST'])
@check_verified_and_blacklist
def update_official_activity():
    """任一官方账号均可修改官方活动，保存后保持直接发布状态。"""
    openid = g.openid
    data, title_error = normalize_official_activity_data(request.get_json(silent=True) or {})
    if title_error:
        return jsonify({'code': 400, 'msg': title_error})
    activity_id = data.get('activity_id')
    if not activity_id:
        return jsonify({'code': 400, 'msg': '缺少活动ID'})
    payload_error = validate_activity_payload(data)
    if payload_error:
        return jsonify({'code': 400, 'msg': payload_error})
    start_time, end_time, deadline, time_error = activity_times(data)
    if time_error:
        return jsonify({'code': 400, 'msg': time_error})
    content_error = _check_activity_content(data, openid)
    if content_error:
        return jsonify({'code': 400, 'msg': content_error})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        if _get_official_flag(cursor, openid) != 1:
            return jsonify({'code': 403, 'msg': '仅官方账号可修改官方活动'})
        cursor.execute(
            "SELECT id, is_official FROM activities WHERE id = %s FOR UPDATE",
            (activity_id,)
        )
        activity = cursor.fetchone()
        if not activity or activity.get('is_official') != 1:
            return jsonify({'code': 404, 'msg': '官方活动不存在'})

        status = published_activity_status(start_time, end_time)
        cursor.execute("""
            UPDATE activities SET
                name = %s, description = %s, activity_time = %s, end_time = %s,
                location = %s, route = %s, latitude = %s, longitude = %s,
                distance = %s, climb = %s, difficulty = %s, max_participants = %s,
                deadline = %s, cover_url = %s, group_qr_url = %s, wechat_id = %s,
                is_force_insurance = %s, is_official = 1, status = %s,
                reject_reason = NULL, reject_time = NULL, updated_at = NOW()
            WHERE id = %s
        """, (
            data.get('name'),
            data.get('description'),
            start_time,
            end_time,
            data.get('location'),
            data.get('route'),
            data.get('latitude'),
            data.get('longitude'),
            data.get('distance', 0),
            data.get('climb', 0),
            data.get('difficulty'),
            data.get('maxParticipants', 20),
            deadline,
            data.get('cover'),
            data.get('groupQR'),
            data.get('wechat'),
            data.get('mandatoryInsurance', 0),
            status,
            activity_id,
        ))
        cursor.execute("DELETE FROM activity_travel_options WHERE activity_id = %s", (activity_id,))
        cursor.execute("DELETE FROM activity_meeting_points WHERE activity_id = %s", (activity_id,))
        _insert_activity_options(cursor, activity_id, data)
        conn.commit()
        return jsonify({
            'code': 200,
            'msg': '官方活动已更新',
            'data': {'activity_id': activity_id, 'status': status}
        })
    except Exception:
        if conn:
            conn.rollback()
        logging.exception("更新官方活动失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/list', methods=['GET'])
def get_activity_list():
    """获取活动列表"""
    page = max(request.args.get('page', 1, type=int) or 1, 1)
    size = min(max(request.args.get('size', 10, type=int) or 10, 1), 50)
    status = request.args.get('status')
    tab = request.args.get('tab', '')
    keyword = request.args.get('keyword', '')
    difficulty = request.args.get('difficulty')
    travel_type = request.args.get('travel')
    official = request.args.get('official')
    openid = request.headers.get('X-Wx-OpenId')

    offset = (page - 1) * size
    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()
        _refresh_activity_statuses(cursor)
        conn.commit()

        # 构建查询条件
        where_clause = "WHERE a.status NOT IN (0, -1, 2)"  # 不展示待审核、草稿、已拒绝的活动
        params = []

        if tab == 'ongoing':
            where_clause = "WHERE a.status IN (1, 3)"
        elif tab == 'ended':
            where_clause = "WHERE a.status = 4"

        if status is not None:
            try:
                normalized_status = int(status)
            except (TypeError, ValueError):
                return jsonify({'code': 400, 'msg': '活动状态参数无效'})
            if normalized_status in (0, -1, 2):
                return jsonify({'code': 403, 'msg': '待审核活动请使用管理员接口查看'})
            else:
                where_clause += " AND a.status = %s"
                params.append(normalized_status)

        if keyword:
            where_clause += " AND (a.name LIKE %s OR a.description LIKE %s OR a.location LIKE %s)"
            params.extend([f'%{keyword}%', f'%{keyword}%', f'%{keyword}%'])

        if difficulty is not None:
            if not str(difficulty).isdigit() or int(difficulty) not in range(1, 6):
                return jsonify({'code': 400, 'msg': '难度参数无效'})
            where_clause += " AND a.difficulty = %s"
            params.append(int(difficulty))

        if travel_type is not None:
            if not str(travel_type).isdigit() or int(travel_type) not in (1, 2, 3):
                return jsonify({'code': 400, 'msg': '出行方式参数无效'})
            where_clause += " AND EXISTS (SELECT 1 FROM activity_travel_options t WHERE t.activity_id = a.id AND t.travel_type = %s)"
            params.append(int(travel_type))

        if official is not None:
            normalized_official = str(official).strip().lower()
            if normalized_official in ('1', 'true'):
                where_clause += " AND a.is_official = 1"
            elif normalized_official not in ('', '0', 'false'):
                return jsonify({'code': 400, 'msg': '官方活动筛选参数无效'})

        # 查询总数
        cursor.execute(f"SELECT COUNT(*) as total FROM activities a {where_clause}", params)
        total = cursor.fetchone()['total']

        # 查询列表 - 显式增加 is_force_insurance 字段
        sql = f"""
        SELECT
            a.id, a.activity_no, a.name, a.description, a.activity_time, a.end_time,
            a.location, a.latitude, a.longitude,
            a.difficulty, a.max_participants, a.status, a.cover_url, a.view_count,
            a.created_at, a.is_force_insurance, a.is_official,
            u.nickName as creator_name, u.avatarUrl as creator_avatar,
            COALESCE(pc.participant_count, 0) AS participant_count,
            CASE WHEN mine.id IS NULL THEN FALSE ELSE TRUE END AS has_registered
        FROM activities a
        LEFT JOIN users u ON a.created_by = u.openId
        LEFT JOIN (
            SELECT activity_id, SUM(companion_count + 1) AS participant_count
            FROM activity_participants
            WHERE status = 1
            GROUP BY activity_id
        ) pc ON pc.activity_id = a.id
        LEFT JOIN (
            SELECT DISTINCT activity_id, 1 AS id
            FROM activity_participants
            WHERE user_openid = %s AND status = 1
        ) mine ON mine.activity_id = a.id
        {where_clause}
        ORDER BY a.created_at DESC
        LIMIT %s OFFSET %s
        """
        list_params = [openid or '', *params, size, offset]
        cursor.execute(sql, list_params)
        activities = cursor.fetchall()

        return jsonify({
            'code': 200,
            'data': {
                'list': activities,
                'total': total,
                'page': page,
                'size': size
            }
        })

    except Exception as e:
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/detail', methods=['GET'])
def get_activity_detail():
    """获取活动详情"""
    activity_id = request.args.get('id')
    openid = request.headers.get('X-Wx-OpenId')

    if not activity_id:
        return jsonify({'code': 400, 'msg': '缺少活动ID'})

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 获取活动基本信息 - SELECT a.* 会自动包含 is_force_insurance 字段
        cursor.execute("""
            SELECT a.*, u.nickName as creator_name, u.avatarUrl as creator_avatar
            FROM activities a
            LEFT JOIN users u ON a.created_by = u.openId
            WHERE a.id = %s
        """, (activity_id,))
        activity = cursor.fetchone()

        if not activity:
            return jsonify({'code': 404, 'msg': '活动不存在'})

        viewer_is_admin = False
        viewer_is_official = False
        if openid:
            cursor.execute("SELECT isAdmin, isOfficial FROM users WHERE openId = %s", (openid,))
            viewer = cursor.fetchone()
            viewer_is_admin = bool(viewer and viewer.get('isAdmin') == 1)
            viewer_is_official = bool(viewer and viewer.get('isOfficial') == 1)

        is_owner = bool(openid and activity.get('created_by') == openid)
        can_manage_official = bool(
            viewer_is_official and activity.get('is_official') == 1
        )
        if activity.get('status') in (0, -1, 2) and not (
            is_owner or viewer_is_admin or can_manage_official
        ):
            return jsonify({'code': 404, 'msg': '活动不存在'})

        # 更新浏览次数
        cursor.execute("UPDATE activities SET view_count = view_count + 1 WHERE id = %s", (activity_id,))

        # 获取出行方式
        cursor.execute("SELECT * FROM activity_travel_options WHERE activity_id = %s", (activity_id,))
        activity['travel_options'] = cursor.fetchall()

        # 获取集合点
        cursor.execute("SELECT * FROM activity_meeting_points WHERE activity_id = %s ORDER BY point_order",
                       (activity_id,))
        activity['meeting_points'] = cursor.fetchall()

        # 获取报名人数
        cursor.execute("SELECT COALESCE(SUM(companion_count + 1), 0) as count FROM activity_participants WHERE activity_id = %s AND status = 1",
                       (activity_id,))
        activity['participant_count'] = cursor.fetchone()['count']

        # 新增：当前用户是否已报名
        activity['has_registered'] = False
        if openid:
            cursor.execute(
                "SELECT id FROM activity_participants WHERE activity_id = %s AND user_openid = %s AND status = 1",
                (activity_id, openid)
            )
            if cursor.fetchone():
                activity['has_registered'] = True

        if not (is_owner or viewer_is_admin or can_manage_official or activity['has_registered']):
            activity['group_qr_url'] = None
            activity['wechat_id'] = None

        # 用户 openid 只用于服务端鉴权，不作为活动详情字段公开。
        activity.pop('created_by', None)
        if not (is_owner or viewer_is_admin or can_manage_official):
            activity.pop('reject_reason', None)
            activity.pop('reject_time', None)

        conn.commit()

        return jsonify({
            'code': 200,
            'data': activity
        })

    except Exception as e:
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/participate', methods=['POST'])
@check_verified_and_blacklist
def participate_activity():
    """报名活动"""
    openid = g.openid
    data = request.get_json(silent=True) or {}
    activity_id = data.get('activity_id')
    if not activity_id:
        return jsonify({'code': 400, 'msg': '缺少活动ID'})

    # 同行人数校验：0-3
    try:
        companion_count = int(data.get('companion_count', 0) or 0)
    except (TypeError, ValueError):
        return jsonify({'code': 400, 'msg': '同行人数格式无效'})
    if companion_count < 0 or companion_count > 3:
        return jsonify({'code': 400, 'msg': '同行人数需在0-3之间'})
    travel_option = data.get('travel_option')
    if travel_option not in (None, ''):
        try:
            travel_option = int(travel_option)
        except (TypeError, ValueError):
            return jsonify({'code': 400, 'msg': '出行方式无效'})
        if travel_option not in (1, 2, 3):
            return jsonify({'code': 400, 'msg': '出行方式无效'})
    else:
        travel_option = None

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 锁定活动行，保证并发报名时容量计算与写入串行执行。
        cursor.execute(
            "SELECT id, max_participants, status, deadline, activity_time FROM activities WHERE id = %s FOR UPDATE",
            (activity_id,)
        )
        activity = cursor.fetchone()

        if not activity:
            return jsonify({'code': 404, 'msg': '活动不存在'})

        now = datetime.now()
        if activity['status'] != 1:
            return jsonify({'code': 400, 'msg': '活动不可报名'})
        if activity.get('deadline') and now > activity['deadline']:
            return jsonify({'code': 400, 'msg': '报名已截止'})
        if activity.get('activity_time') and now >= activity['activity_time']:
            return jsonify({'code': 400, 'msg': '活动已开始，无法报名'})

        # 检查是否已报名（仅检查有效报名，status=1）
        cursor.execute(
            "SELECT id FROM activity_participants WHERE activity_id = %s AND user_openid = %s AND status = 1",
            (activity_id, openid)
        )
        if cursor.fetchone():
            return jsonify({'code': 400, 'msg': '您已报名该活动'})

        # 检查人数限制：已占用名额 = SUM(companion_count + 1)
        cursor.execute(
            "SELECT COALESCE(SUM(companion_count + 1), 0) as occupied FROM activity_participants WHERE activity_id = %s AND status = 1",
            (activity_id,)
        )
        current_occupied = cursor.fetchone()['occupied']
        slots_needed = companion_count + 1

        if current_occupied + slots_needed > activity['max_participants']:
            remain = activity['max_participants'] - current_occupied
            return jsonify({'code': 400, 'msg': f'名额不足，当前剩余{remain}个，本次报名需{slots_needed}个'})

        # 检查是否有已取消的报名记录，有则恢复
        cursor.execute(
            "SELECT id FROM activity_participants WHERE activity_id = %s AND user_openid = %s AND status = 0",
            (activity_id, openid)
        )
        cancelled_record = cursor.fetchone()

        if cancelled_record:
            # 恢复已取消的记录
            cursor.execute(
                "UPDATE activity_participants SET status = 1, nickname = %s, phone = %s, wechat_id = %s, travel_option = %s, remark = %s, companion_count = %s WHERE id = %s",
                (data.get('nickname'), data.get('phone'), data.get('wechat_id'),
                 travel_option, data.get('remark'), companion_count, cancelled_record['id'])
            )
        else:
            # 插入新报名记录
            cursor.execute("""
                INSERT INTO activity_participants (
                    activity_id, user_openid, nickname, phone, wechat_id, 
                    travel_option, remark, companion_count, status, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 1, NOW())
            """, (
                activity_id,
                openid,
                data.get('nickname'),
                data.get('phone'),
                data.get('wechat_id'),
                travel_option,
                data.get('remark'),
                companion_count,
            ))

        conn.commit()

        return jsonify({'code': 200, 'msg': '报名成功'})

    except Exception:
        if conn:
            conn.rollback()
        logging.exception("数据库操作失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/cancel-participation', methods=['POST'])
@check_verified_and_blacklist
def cancel_participation():
    """取消报名活动"""
    openid = g.openid
    data = request.get_json(silent=True) or {}
    activity_id = data.get('activity_id')

    if not activity_id:
        return jsonify({'code': 400, 'msg': '缺少活动ID'})

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 检查活动是否存在且未结束
        cursor.execute("SELECT id, status, activity_time FROM activities WHERE id = %s", (activity_id,))
        activity = cursor.fetchone()

        if not activity:
            return jsonify({'code': 404, 'msg': '活动不存在'})

        if activity['status'] in (3, 4) or (
            activity.get('activity_time') and datetime.now() >= activity['activity_time']
        ):
            return jsonify({'code': 400, 'msg': '活动已开始或结束，无法取消报名'})

        # 检查是否已报名
        cursor.execute(
            "SELECT id, status FROM activity_participants WHERE activity_id = %s AND user_openid = %s AND status = 1",
            (activity_id, openid)
        )
        participation = cursor.fetchone()

        if not participation:
            return jsonify({'code': 400, 'msg': '您未报名该活动'})

        # 软删除：将 status 设为 0（已取消）
        cursor.execute(
            "UPDATE activity_participants SET status = 0 WHERE id = %s",
            (participation['id'],)
        )

        conn.commit()

        return jsonify({'code': 200, 'msg': '取消报名成功'})

    except Exception:
        if conn:
            conn.rollback()
        logging.exception("数据库操作失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/my-activities', methods=['GET'])
@check_verified_and_blacklist
def get_my_activities():
    """获取我发起的活动"""
    openid = g.openid

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # SELECT a.* 会自动包含 is_force_insurance 字段
        cursor.execute("""
            SELECT a.*, 
                   (SELECT COALESCE(SUM(companion_count + 1), 0) FROM activity_participants WHERE activity_id = a.id AND status = 1) as participant_count,
                   u.nickName as creator_name, u.avatarUrl as creator_avatar
            FROM activities a
            LEFT JOIN users u ON a.created_by = u.openId
            WHERE a.created_by = %s AND a.status != -1 AND a.is_official = 0
            ORDER BY a.created_at DESC
        """, (openid,))

        activities = cursor.fetchall()

        return jsonify({
            'code': 200,
            'data': activities
        })

    except Exception as e:
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/my-participations', methods=['GET'])
@check_verified_and_blacklist
def get_my_participations():
    """获取我报名的活动"""
    openid = g.openid

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT p.*, a.name, a.activity_time, a.location, a.cover_url, a.status as activity_status,
                   a.is_force_insurance, a.is_official,
                   u.nickName as creator_name
            FROM activity_participants p
            JOIN activities a ON p.activity_id = a.id
            LEFT JOIN users u ON a.created_by = u.openId
            WHERE p.user_openid = %s
            ORDER BY p.created_at DESC
        """, (openid,))

        participations = cursor.fetchall()

        return jsonify({
            'code': 200,
            'data': participations
        })

    except Exception as e:
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/update-rejected', methods=['POST'])
@check_verified_and_blacklist
def update_rejected_activity():
    """修改被驳回的活动并重新提交"""
    openid = g.openid
    data = request.get_json(silent=True) or {}
    activity_id = data.get('activity_id')

    if not activity_id:
        return jsonify({'code': 400, 'msg': '缺少活动ID'})
    payload_error = validate_activity_payload(data)
    if payload_error:
        return jsonify({'code': 400, 'msg': payload_error})
    start_time, end_time, deadline, time_error = activity_times(data)
    if time_error:
        return jsonify({'code': 400, 'msg': time_error})

    # ==================== 内容安全检测 ====================
    from app import check_text_security
    texts_to_check = [
        ('name', data.get('name', ''), '活动名称'),
        ('description', data.get('description', ''), '活动描述'),
        ('location', data.get('location', ''), '活动地点'),
        ('route', data.get('route', ''), '路线'),
    ]
    for idx, point in enumerate(data.get('meetingPoints', [])):
        loc = point.get('location', '')
        if loc:
            texts_to_check.append((f'meeting_point_{idx}', loc, f'集合点{idx+1}地点'))

    for field_name, text, field_label in texts_to_check:
        if text and text.strip():
            is_safe, msg = check_text_security(text, openid, scene=1, title=data.get('name', ''))
            if not is_safe:
                return jsonify({'code': 400, 'msg': f'{field_label}{msg}'})
    # ==================== 内容安全检测结束 ====================

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 检查活动是否存在且是被驳回状态
        cursor.execute(
            "SELECT id, status, created_by, reject_reason FROM activities WHERE id = %s",
            (activity_id,)
        )
        activity = cursor.fetchone()

        if not activity:
            return jsonify({'code': 404, 'msg': '活动不存在'})

        if activity['created_by'] != openid:
            return jsonify({'code': 403, 'msg': '无权限修改此活动'})
        if activity['status'] != 2:
            return jsonify({'code': 400, 'msg': '只有被驳回的活动可以重新提交'})

        is_official = 0

        # 更新活动信息（增加 is_force_insurance）
        sql = """
        UPDATE activities SET
            name = %s, description = %s, activity_time = %s, end_time = %s, location = %s,
            latitude = %s, longitude = %s,
            route = %s, distance = %s, climb = %s, difficulty = %s,
            max_participants = %s, deadline = %s, cover_url = %s,
            group_qr_url = %s, wechat_id = %s, is_force_insurance = %s, is_official = %s,
            status = 0,  -- 重新变为待审核
            reject_reason = NULL, reject_time = NULL, updated_at = NOW()
        WHERE id = %s
        """

        cursor.execute(sql, (
            data.get('name'),
            data.get('description'),
            start_time,
            end_time,
            data.get('location'),
            data.get('latitude'),
            data.get('longitude'),
            data.get('route'),
            data.get('distance', 0),
            data.get('climb', 0),
            data.get('difficulty'),
            data.get('maxParticipants', 20),
            deadline,
            data.get('cover'),
            data.get('groupQR'),
            data.get('wechat'),
            data.get('mandatoryInsurance', 0),  # 新增字段
            is_official,
            activity_id
        ))

        # 删除旧的出行方式和集合点
        cursor.execute("DELETE FROM activity_travel_options WHERE activity_id = %s", (activity_id,))
        cursor.execute("DELETE FROM activity_meeting_points WHERE activity_id = %s", (activity_id,))

        # 重新插入出行方式
        travel_options = data.get('travelOptions', [])
        for travel_type in travel_options:
            cursor.execute(
                "INSERT INTO activity_travel_options (activity_id, travel_type, bus_qr_url) VALUES (%s, %s, %s)",
                (activity_id, travel_type, None)
            )

        # 重新插入集合点
        meeting_points = data.get('meetingPoints', [])
        for index, point in enumerate(meeting_points):
            cursor.execute(
                "INSERT INTO activity_meeting_points (activity_id, point_order, meeting_time, location, latitude, longitude) VALUES (%s, %s, %s, %s, %s, %s)",
                (activity_id, index + 1, point.get('time'), point.get('location'),
                 point.get('latitude'), point.get('longitude'))
            )

        # 记录重新提交日志（action=4表示重新提交）
        cursor.execute("""
            INSERT INTO activity_audit_logs (activity_id, action, reason, created_at) 
            VALUES (%s, %s, %s, NOW())
        """, (activity_id, 4, '用户修改后重新提交'))

        conn.commit()

        return jsonify({
            'code': 200,
            'msg': '修改成功，已重新提交审核',
            'data': {'activity_id': activity_id}
        })

    except Exception:
        if conn:
            conn.rollback()
        logging.exception("数据库操作失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/my-activities-with-audit', methods=['GET'])
@check_verified_and_blacklist
def get_my_activities_with_audit():
    """获取我发起的活动（包含审核状态和驳回原因）"""
    openid = g.openid

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # SELECT a.* 会自动包含 is_force_insurance 字段
        cursor.execute("""
            SELECT a.*, 
                   (SELECT COALESCE(SUM(companion_count + 1), 0) FROM activity_participants WHERE activity_id = a.id AND status = 1) as participant_count,
                   (SELECT reason FROM activity_audit_logs 
                    WHERE activity_id = a.id AND action = 3 
                    ORDER BY created_at DESC LIMIT 1) as last_reject_reason,
                   u.nickName as creator_name, u.avatarUrl as creator_avatar
            FROM activities a
            LEFT JOIN users u ON a.created_by = u.openId
            WHERE a.created_by = %s AND a.status != -1 AND a.is_official = 0
            ORDER BY a.created_at DESC
        """, (openid,))

        activities = cursor.fetchall()

        return jsonify({
            'code': 200,
            'data': activities
        })

    except Exception as e:
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/my-participations-grouped', methods=['GET'])
@check_verified_and_blacklist
def get_my_participations_grouped():
    """获取我报名的活动（按状态分组：进行中/已结束）"""
    openid = g.openid
    now = datetime.now()

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 查询进行中的活动（活动时间 > 当前时间）
        cursor.execute("""
            SELECT p.*, a.name, a.activity_time, a.location, a.cover_url,
                   a.status as activity_status, a.id as activity_id,
                   a.is_force_insurance, a.is_official,
                   u.nickName as creator_name
            FROM activity_participants p
            JOIN activities a ON p.activity_id = a.id
            LEFT JOIN users u ON a.created_by = u.openId
            WHERE p.user_openid = %s AND a.activity_time > %s
            ORDER BY a.activity_time ASC
        """, (openid, now))

        ongoing = cursor.fetchall()

        # 查询已结束的活动（活动时间 <= 当前时间）
        cursor.execute("""
            SELECT p.*, a.name, a.activity_time, a.location, a.cover_url,
                   a.status as activity_status, a.id as activity_id,
                   a.is_force_insurance, a.is_official,
                   u.nickName as creator_name
            FROM activity_participants p
            JOIN activities a ON p.activity_id = a.id
            LEFT JOIN users u ON a.created_by = u.openId
            WHERE p.user_openid = %s AND a.activity_time <= %s
            ORDER BY a.activity_time DESC
        """, (openid, now))

        ended = cursor.fetchall()

        return jsonify({
            'code': 200,
            'data': {
                'ongoing': ongoing,
                'ended': ended
            }
        })

    except Exception as e:
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/update-status', methods=['POST'])
@check_verified_and_blacklist
def update_activities_status():
    """
    批量更新所有已通过审核的活动状态（进行中/已结束）
    同时将已满员的活动标记到内存中（或写入数据库）
    建议前端在首页 onShow 时调用，无需等待结果
    """
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        updated_to_ongoing, updated_to_ended = _refresh_activity_statuses(cursor)

        # 获取所有满员的活动ID列表（供前端标记，也可不返回）
        cursor.execute("""
            SELECT a.id, a.max_participants, IFNULL(p.cnt, 0) as current_count
            FROM activities a
            LEFT JOIN (
                SELECT activity_id, SUM(companion_count + 1) as cnt
                FROM activity_participants
                WHERE status = 1
                GROUP BY activity_id
            ) p ON a.id = p.activity_id
            WHERE a.status IN (1,3) AND p.cnt >= a.max_participants
        """)
        full_activities = cursor.fetchall()

        conn.commit()
        return jsonify({
            'code': 200,
            'msg': '状态更新完成',
            'data': {
                'ongoing_updated': updated_to_ongoing,
                'ended_updated': updated_to_ended,
                'full_activity_ids': [act['id'] for act in full_activities]
            }
        })
    except Exception:
        if conn:
            conn.rollback()
        logging.exception("数据库操作失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/participants', methods=['GET'])
@check_verified_and_blacklist
def get_activity_participants():
    """仅活动发起人和管理员可查看报名联系方式。"""
    openid = g.openid
    activity_id = request.args.get('activity_id')
    if not activity_id:
        return jsonify({'code': 400, 'msg': '缺少活动ID'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT id, created_by, is_official FROM activities WHERE id = %s",
            (activity_id,)
        )
        activity = cursor.fetchone()
        if not activity:
            return jsonify({'code': 404, 'msg': '活动不存在'})
        cursor.execute("SELECT isAdmin, isOfficial FROM users WHERE openId = %s", (openid,))
        viewer = cursor.fetchone()
        can_manage_official = bool(
            viewer
            and viewer.get('isOfficial') == 1
            and activity.get('is_official') == 1
        )
        if (
            activity['created_by'] != openid
            and not (viewer and viewer.get('isAdmin') == 1)
            and not can_manage_official
        ):
            return jsonify({'code': 403, 'msg': '无权查看报名人员'})

        # 查询所有报名记录，关联 users 表获取头像和昵称（使用报名时填写的昵称优先，若为空则取 users 表中的昵称）
        cursor.execute("""
            SELECT 
                p.id, p.user_openid, p.status,
                IFNULL(p.nickname, u.nickName) AS nickname,
                u.avatarUrl,
                p.phone, p.wechat_id, 
                p.travel_option, p.remark, p.companion_count, p.created_at
            FROM activity_participants p
            LEFT JOIN users u ON p.user_openid = u.openId
            WHERE p.activity_id = %s
            ORDER BY p.created_at ASC
        """, (activity_id,))
        participants = cursor.fetchall()

        # 格式化时间、转换出行方式文本
        for p in participants:
            if p.get('created_at'):
                p['created_at_formatted'] = p['created_at'].strftime('%m/%d %H:%M') if isinstance(p['created_at'],
                                                                                                  datetime) else str(
                    p['created_at'])
            else:
                p['created_at_formatted'] = ''

            travel_map = {1: '大巴', 2: '高铁/火车', 3: '自驾'}
            p['travel_option_text'] = travel_map.get(p.get('travel_option'), '未选择')

        return jsonify({
            'code': 200,
            'data': {
                'total': len(participants),
                'list': participants
            }
        })

    except Exception as e:
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ==================== 草稿箱功能 ====================

@activity_bp.route('/save-draft', methods=['POST'])
@check_verified_and_blacklist
def save_draft():
    """保存活动草稿（新建或更新）"""
    openid = g.openid
    data = request.get_json(silent=True) or {}
    draft_id = data.get('draft_id')
    start_time, end_time, deadline, time_error = activity_times(data, allow_partial=True)
    if time_error:
        return jsonify({'code': 400, 'msg': time_error})

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()
        is_official = 0

        if draft_id:
            # 更新已有草稿 —— 先校验归属和状态
            cursor.execute(
                "SELECT id FROM activities WHERE id = %s AND created_by = %s AND status = -1",
                (draft_id, openid)
            )
            if not cursor.fetchone():
                return jsonify({'code': 403, 'msg': '草稿不存在或无权限'})

            cursor.execute("""
                UPDATE activities SET
                    name = %s, description = %s, activity_time = %s, end_time = %s, location = %s,
                    route = %s, latitude = %s, longitude = %s, distance = %s, climb = %s, difficulty = %s,
                    max_participants = %s, deadline = %s, cover_url = %s,
                    group_qr_url = %s, wechat_id = %s, is_force_insurance = %s, is_official = %s,
                    updated_at = NOW()
                WHERE id = %s
            """, (
                data.get('name', ''),
                data.get('description', ''),
                start_time,
                end_time,
                data.get('location', ''),
                data.get('route', ''),
                data.get('latitude'),
                data.get('longitude'),
                data.get('distance', 0) or 0,
                data.get('climb', 0) or 0,
                data.get('difficulty', 1) or 1,
                data.get('maxParticipants', 2) or 2,
                deadline,
                data.get('cover', ''),
                data.get('groupQR', ''),
                data.get('wechat', ''),
                data.get('mandatoryInsurance', 0) or 0,
                is_official,
                draft_id
            ))

            # 删除旧的出行方式和集合点，重新插入
            cursor.execute("DELETE FROM activity_travel_options WHERE activity_id = %s", (draft_id,))
            cursor.execute("DELETE FROM activity_meeting_points WHERE activity_id = %s", (draft_id,))

            for travel_type in (data.get('travelOptions') or []):
                cursor.execute(
                    "INSERT INTO activity_travel_options (activity_id, travel_type, bus_qr_url) VALUES (%s, %s, %s)",
                    (draft_id, travel_type, None)
                )

            for index, point in enumerate(data.get('meetingPoints') or []):
                cursor.execute(
                    "INSERT INTO activity_meeting_points (activity_id, point_order, meeting_time, location, latitude, longitude) VALUES (%s, %s, %s, %s, %s, %s)",
                    (draft_id, index + 1, point.get('time'), point.get('location'),
                     point.get('latitude'), point.get('longitude'))
                )

            conn.commit()
            return jsonify({'code': 200, 'msg': '草稿已更新', 'data': {'draft_id': draft_id}})
        else:
            # 新建草稿
            activity_no = generate_activity_no()
            cursor.execute("""
                INSERT INTO activities (
                    activity_no, name, description, activity_time, end_time, location,
                    route, latitude, longitude, distance, climb, difficulty, max_participants,
                    deadline, cover_url, group_qr_url, wechat_id, created_by,
                    status, is_force_insurance, is_official, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, -1, %s, %s, NOW())
            """, (
                activity_no,
                data.get('name', ''),
                data.get('description', ''),
                start_time,
                end_time,
                data.get('location', ''),
                data.get('route', ''),
                data.get('latitude'),
                data.get('longitude'),
                data.get('distance', 0) or 0,
                data.get('climb', 0) or 0,
                data.get('difficulty', 1) or 1,
                data.get('maxParticipants', 2) or 2,
                deadline,
                data.get('cover', ''),
                data.get('groupQR', ''),
                data.get('wechat', ''),
                openid,
                data.get('mandatoryInsurance', 0) or 0,
                is_official
            ))

            new_id = cursor.lastrowid

            for travel_type in (data.get('travelOptions') or []):
                cursor.execute(
                    "INSERT INTO activity_travel_options (activity_id, travel_type, bus_qr_url) VALUES (%s, %s, %s)",
                    (new_id, travel_type, None)
                )

            for index, point in enumerate(data.get('meetingPoints') or []):
                cursor.execute(
                    "INSERT INTO activity_meeting_points (activity_id, point_order, meeting_time, location, latitude, longitude) VALUES (%s, %s, %s, %s, %s, %s)",
                    (new_id, index + 1, point.get('time'), point.get('location'),
                     point.get('latitude'), point.get('longitude'))
                )

            conn.commit()
            return jsonify({'code': 200, 'msg': '草稿已保存', 'data': {'draft_id': new_id}})

    except Exception:
        if conn:
            conn.rollback()
        logging.exception("保存草稿失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/my-drafts', methods=['GET'])
@check_verified_and_blacklist
def get_my_drafts():
    """获取我的草稿列表"""
    openid = g.openid

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, activity_no, name, description, activity_time, end_time, location,
                   difficulty, max_participants, cover_url, is_force_insurance,
                   is_official, created_at, updated_at
            FROM activities
            WHERE created_by = %s AND status = -1 AND is_official = 0
            ORDER BY updated_at DESC
        """, (openid,))

        drafts = cursor.fetchall()

        return jsonify({'code': 200, 'data': drafts})

    except Exception:
        logging.exception("获取草稿列表失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/delete-draft', methods=['POST'])
@check_verified_and_blacklist
def delete_draft():
    """删除草稿"""
    openid = g.openid
    data = request.get_json()
    draft_id = data.get('draft_id')

    if not draft_id:
        return jsonify({'code': 400, 'msg': '缺少草稿ID'})

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 校验归属和状态
        cursor.execute(
            "SELECT id FROM activities WHERE id = %s AND created_by = %s AND status = -1",
            (draft_id, openid)
        )
        if not cursor.fetchone():
            return jsonify({'code': 403, 'msg': '草稿不存在或无权限'})

        # 删除关联数据
        cursor.execute("DELETE FROM activity_travel_options WHERE activity_id = %s", (draft_id,))
        cursor.execute("DELETE FROM activity_meeting_points WHERE activity_id = %s", (draft_id,))
        cursor.execute("DELETE FROM activity_audit_logs WHERE activity_id = %s", (draft_id,))
        cursor.execute("DELETE FROM activities WHERE id = %s", (draft_id,))

        conn.commit()
        return jsonify({'code': 200, 'msg': '草稿已删除'})

    except Exception:
        if conn:
            conn.rollback()
        logging.exception("删除草稿失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/publish-draft', methods=['POST'])
@check_verified_and_blacklist
def publish_draft():
    """将草稿提交为正式活动（status: -1 -> 0）"""
    openid = g.openid
    data = request.get_json()
    draft_id = data.get('draft_id')

    if not draft_id:
        return jsonify({'code': 400, 'msg': '缺少草稿ID'})

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()
        is_official = 0

        # 校验归属和状态
        cursor.execute(
            "SELECT id, name, description, activity_time, end_time, deadline, location, wechat_id, group_qr_url FROM activities WHERE id = %s AND created_by = %s AND status = -1",
            (draft_id, openid)
        )
        activity = cursor.fetchone()
        if not activity:
            return jsonify({'code': 403, 'msg': '草稿不存在或无权限'})

        # 校验必填字段
        missing = []
        if not activity.get('name'): missing.append('活动名称')
        if not activity.get('description'): missing.append('活动描述')
        if not activity.get('activity_time'): missing.append('活动时间')
        if not activity.get('location'): missing.append('活动地点')
        if not activity.get('wechat_id'): missing.append('发起人微信号')
        if not activity.get('group_qr_url'): missing.append('微信群二维码')
        if missing:
            return jsonify({'code': 400, 'msg': f'草稿信息不完整，缺少：{"、".join(missing)}'})

        end_time = activity.get('end_time') or (activity['activity_time'] + timedelta(hours=12))
        if end_time <= activity['activity_time']:
            return jsonify({'code': 400, 'msg': '活动结束时间必须晚于开始时间'})
        if activity.get('deadline') and activity['deadline'] > activity['activity_time']:
            return jsonify({'code': 400, 'msg': '报名截止时间不能晚于活动开始时间'})

        # 内容安全检测
        from app import check_text_security
        texts_to_check = [
            ('name', activity.get('name', ''), '活动名称'),
            ('description', activity.get('description', ''), '活动描述'),
            ('location', activity.get('location', ''), '活动地点'),
        ]
        for field_name, text, field_label in texts_to_check:
            if text and text.strip():
                is_safe, msg = check_text_security(text, openid, scene=1, title=activity.get('name', ''))
                if not is_safe:
                    return jsonify({'code': 400, 'msg': f'{field_label}{msg}'})

        # 更新状态为待审核
        cursor.execute(
            "UPDATE activities SET status = 0, end_time = %s, is_official = %s, updated_at = NOW() WHERE id = %s",
            (end_time, is_official, draft_id)
        )

        # 插入审核记录
        cursor.execute(
            "INSERT INTO activity_audit_logs (activity_id, action, created_at) VALUES (%s, 1, NOW())",
            (draft_id,)
        )

        conn.commit()
        return jsonify({'code': 200, 'msg': '活动已提交审核', 'data': {'activity_id': draft_id}})

    except Exception:
        if conn:
            conn.rollback()
        logging.exception("发布草稿失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/withdraw', methods=['POST'])
@check_verified_and_blacklist
def withdraw_activity():
    """撤回待审核活动，将其状态从 0(待审核) 改为 -1(草稿)"""
    openid = g.openid
    data = request.get_json()
    activity_id = data.get('activity_id')

    if not activity_id:
        return jsonify({'code': 400, 'msg': '缺少活动ID'})

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 校验归属和状态
        cursor.execute(
            "SELECT id FROM activities WHERE id = %s AND created_by = %s AND status = 0",
            (activity_id, openid)
        )
        if not cursor.fetchone():
            return jsonify({'code': 403, 'msg': '活动不存在或非待审核状态'})

        # 更新状态为草稿
        cursor.execute(
            "UPDATE activities SET status = -1, updated_at = NOW() WHERE id = %s",
            (activity_id,)
        )

        # 插入审核记录（action=5 表示撤回）
        cursor.execute(
            "INSERT INTO activity_audit_logs (activity_id, action, created_at) VALUES (%s, 5, NOW())",
            (activity_id,)
        )

        conn.commit()
        return jsonify({'code': 200, 'msg': '活动已撤回至草稿箱'})

    except Exception:
        if conn:
            conn.rollback()
        logging.exception("撤回活动失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
@activity_bp.route('/calendar', methods=['GET'])
@check_verified_and_blacklist
def get_activity_calendar():
    """获取活动日历数据（按月）+ 指定日期的活动列表"""
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    date = request.args.get('date', '')

    if not year or not month or month < 1 or month > 12:
        return jsonify({'code': 400, 'msg': '请提供year和month参数'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        _refresh_activity_statuses(cursor)
        conn.commit()

        if date:
            # 查询指定日期的活动列表
            cursor.execute("""
                SELECT a.id, a.name, a.location, a.latitude, a.longitude,
                       a.activity_time, a.difficulty,
                       a.max_participants, a.status, a.cover_url, a.is_official,
                       COALESCE(pc.participant_count, 0) AS participant_count,
                       CASE WHEN mine.activity_id IS NULL THEN FALSE ELSE TRUE END AS has_registered
                FROM activities a
                LEFT JOIN (
                    SELECT activity_id, SUM(companion_count + 1) AS participant_count
                    FROM activity_participants
                    WHERE status = 1
                    GROUP BY activity_id
                ) pc ON pc.activity_id = a.id
                LEFT JOIN (
                    SELECT DISTINCT activity_id
                    FROM activity_participants
                    WHERE user_openid = %s AND status = 1
                ) mine ON mine.activity_id = a.id
                WHERE a.status NOT IN (0, -1, 2)
                AND DATE(a.activity_time) = %s
                ORDER BY a.activity_time ASC
            """, (g.openid, date))
            list_data = cursor.fetchall()
            return jsonify({'code': 200, 'data': {'list': list_data}})

        # 查询当月每天的活动数量
        cursor.execute("""
            SELECT DATE(activity_time) as dt, COUNT(*) as cnt
            FROM activities
            WHERE status NOT IN (0, -1, 2)
            AND YEAR(activity_time) = %s AND MONTH(activity_time) = %s
            GROUP BY DATE(activity_time)
        """, (year, month))
        result = {row['dt'].strftime('%Y-%m-%d') if row['dt'] else '': row['cnt'] for row in cursor.fetchall()}
        return jsonify({'code': 200, 'data': result})
    except Exception:
        logging.exception("获取日历数据失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@activity_bp.route('/calendar-weather', methods=['GET'])
@check_verified_and_blacklist
def get_calendar_weather():
    """按日历选中日期返回单日天气，不依赖业务天气密钥。"""
    date_text = str(request.args.get('date') or '').strip()
    city = str(request.args.get('city') or '').strip()
    target_date, date_error = validate_weather_date(date_text)
    if date_error:
        return jsonify({'code': 422, 'msg': date_error})
    if len(city) > 100:
        return jsonify({'code': 400, 'msg': '地点参数无效'})

    try:
        resolved = _resolve_weather_location(
            city,
            request.args.get('latitude'),
            request.args.get('longitude'),
        )
        if not resolved:
            return jsonify({'code': 404, 'msg': '无法识别活动地点，请重新选择地图位置'})

        latitude, longitude, resolved_city = resolved
        cache_key = f'{target_date.isoformat()}|{latitude:.4f}|{longitude:.4f}'
        cached = _calendar_weather_cache.get(cache_key)
        if cached and time.time() - cached['ts'] < _CALENDAR_WEATHER_CACHE_TTL:
            return jsonify(cached['response'])

        response = _weather_request(
            'https://api.open-meteo.com/v1/forecast',
            {
                'latitude': latitude,
                'longitude': longitude,
                'daily': 'weather_code,temperature_2m_max,temperature_2m_min',
                'timezone': 'Asia/Shanghai',
                'start_date': target_date.isoformat(),
                'end_date': target_date.isoformat(),
            },
        )
        response.raise_for_status()
        provider_data = response.json()
        daily = provider_data.get('daily') or {}
        dates = daily.get('time') or []
        codes = daily.get('weather_code') or []
        highs = daily.get('temperature_2m_max') or []
        lows = daily.get('temperature_2m_min') or []
        if not dates or not codes or not highs or not lows:
            return jsonify({'code': 404, 'msg': '该日期暂无天气数据'})

        text_day, icon = weather_code_summary(codes[0])
        result = {'code': 200, 'data': {
            'city': resolved_city,
            'date': dates[0],
            'text_day': text_day,
            'high': highs[0],
            'low': lows[0],
            'icon': icon,
            'source': 'Open-Meteo',
        }}
        _calendar_weather_cache[cache_key] = {'ts': time.time(), 'response': result}
        return jsonify(result)
    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
        logging.exception('连接单日天气服务失败')
        return jsonify({'code': 502, 'msg': '天气服务暂时不可用'})
    except (requests.exceptions.RequestException, ValueError, TypeError):
        logging.exception('获取单日天气失败')
        return jsonify({'code': 502, 'msg': '天气服务暂时不可用'})
