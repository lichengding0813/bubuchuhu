from flask import Blueprint, request, jsonify, g, current_app
from datetime import datetime
import random
import pymysql
import logging
from db_utils import get_db, execute_query

from middleware import check_verified_and_blacklist

activity_bp = Blueprint('activity', __name__)


def generate_activity_no():
    """生成活动编号：ACT + 年月日 + 4位随机数"""
    date_str = datetime.now().strftime('%Y%m%d')
    random_str = str(random.randint(1000, 9999))
    return f"ACT{date_str}{random_str}"


@activity_bp.route('/create', methods=['POST'])
def create_activity():
    """创建活动"""
    openid = request.headers.get('X-Wx-OpenId')
    if not openid:
        return jsonify({'code': 401, 'msg': '未获取到用户身份'})

    data = request.get_json()
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

        # 1. 插入活动主表（增加 is_force_insurance 字段）
        sql = """
        INSERT INTO activities (
            activity_no, name, description, activity_time, location,
            route, distance, climb, difficulty, max_participants,
            deadline, cover_url, group_qr_url, wechat_id, created_by,
            status, is_force_insurance, created_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        """

        cursor.execute(sql, (
            activity_no,
            data.get('name'),
            data.get('description'),
            data.get('activityTime'),
            data.get('location'),
            data.get('route'),
            data.get('distance', 0),
            data.get('climb', 0),
            data.get('difficulty'),
            data.get('maxParticipants', 20),
            data.get('deadline'),
            data.get('cover'),
            data.get('groupQR'),
            data.get('wechat'),
            openid,
            0,  # 默认待审核
            data.get('mandatoryInsurance', 0)  # 新增：是否强制保险，默认0
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
                "INSERT INTO activity_meeting_points (activity_id, point_order, meeting_time, location) VALUES (%s, %s, %s, %s)",
                (activity_id, index + 1, point.get('time'), point.get('location'))
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


@activity_bp.route('/list', methods=['GET'])
def get_activity_list():
    """获取活动列表"""
    page = int(request.args.get('page', 1))
    size = int(request.args.get('size', 10))
    status = request.args.get('status')
    keyword = request.args.get('keyword', '')
    openid = request.headers.get('X-Wx-OpenId')

    offset = (page - 1) * size
    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 构建查询条件
        where_clause = "WHERE a.status NOT IN (0, -1, 2)"  # 不展示待审核、草稿、已拒绝的活动
        params = []

        if status is not None:
            if int(status) == 0:
                # 显式请求待审核活动时，替换默认条件
                where_clause = "WHERE a.status = 0"
            else:
                where_clause += " AND a.status = %s"
                params.append(status)

        if keyword:
            where_clause += " AND (a.name LIKE %s OR a.description LIKE %s OR a.location LIKE %s)"
            params.extend([f'%{keyword}%', f'%{keyword}%', f'%{keyword}%'])

        # 查询总数
        cursor.execute(f"SELECT COUNT(*) as total FROM activities a {where_clause}", params)
        total = cursor.fetchone()['total']

        # 查询列表 - 显式增加 is_force_insurance 字段
        sql = f"""
        SELECT 
            a.id, a.activity_no, a.name, a.description, a.activity_time, a.location,
            a.difficulty, a.max_participants, a.status, a.cover_url, a.view_count,
            a.created_at, a.created_by, a.reject_reason, a.is_force_insurance,
            u.nickName as creator_name, u.avatarUrl as creator_avatar
        FROM activities a
        LEFT JOIN users u ON a.created_by = u.openId
        {where_clause}
        ORDER BY a.created_at DESC
        LIMIT %s OFFSET %s
        """
        params.append(size)
        params.append(offset)

        cursor.execute(sql, params)
        activities = cursor.fetchall()

        # 获取每个活动的附加信息
        for activity in activities:
            # 获取出行方式
            cursor.execute(
                "SELECT travel_type, bus_qr_url FROM activity_travel_options WHERE activity_id = %s",
                (activity['id'],)
            )
            activity['travel_options'] = cursor.fetchall()

            # 获取集合点
            cursor.execute(
                "SELECT meeting_time, location FROM activity_meeting_points WHERE activity_id = %s ORDER BY point_order",
                (activity['id'],)
            )
            activity['meeting_points'] = cursor.fetchall()

            # 获取报名人数
            cursor.execute(
                "SELECT COALESCE(SUM(companion_count + 1), 0) as count FROM activity_participants WHERE activity_id = %s AND status = 1",
                (activity['id'],)
            )
            activity['participant_count'] = cursor.fetchone()['count']

            # 新增：当前用户是否已报名（status=1）
            activity['has_registered'] = False
            if openid:
                cursor.execute(
                    "SELECT id FROM activity_participants WHERE activity_id = %s AND user_openid = %s AND status = 1",
                    (activity['id'], openid)
                )
                if cursor.fetchone():
                    activity['has_registered'] = True

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
def participate_activity():
    """报名活动"""
    openid = request.headers.get('X-Wx-OpenId')
    if not openid:
        return jsonify({'code': 401, 'msg': '未获取到用户身份'})

    data = request.get_json()
    activity_id = data.get('activity_id')

    # 同行人数校验：0-3
    companion_count = int(data.get('companion_count', 0) or 0)
    if companion_count < 0 or companion_count > 3:
        return jsonify({'code': 400, 'msg': '同行人数需在0-3之间'})

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 检查活动是否存在
        cursor.execute("SELECT id, max_participants, status FROM activities WHERE id = %s", (activity_id,))
        activity = cursor.fetchone()

        if not activity:
            return jsonify({'code': 404, 'msg': '活动不存在'})

        allowed_status = [1, 3]  # 审核通过 或 进行中
        if activity['status'] not in allowed_status:
            return jsonify({'code': 400, 'msg': '活动不可报名'})

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
                 data.get('travel_option'), data.get('remark'), companion_count, cancelled_record['id'])
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
                data.get('travel_option'),
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
def cancel_participation():
    """取消报名活动"""
    openid = request.headers.get('X-Wx-OpenId')
    if not openid:
        return jsonify({'code': 401, 'msg': '未获取到用户身份'})

    data = request.get_json()
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

        if activity['status'] == 4:
            return jsonify({'code': 400, 'msg': '活动已结束，无法取消报名'})

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
def get_my_activities():
    """获取我发起的活动"""
    openid = request.headers.get('X-Wx-OpenId')
    if not openid:
        return jsonify({'code': 401, 'msg': '未获取到用户身份'})

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
            WHERE a.created_by = %s AND a.status != -1
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
def get_my_participations():
    """获取我报名的活动"""
    openid = request.headers.get('X-Wx-OpenId')
    if not openid:
        return jsonify({'code': 401, 'msg': '未获取到用户身份'})

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT p.*, a.name, a.activity_time, a.location, a.cover_url, a.status as activity_status,
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
    data = request.get_json()
    activity_id = data.get('activity_id')

    if not activity_id:
        return jsonify({'code': 400, 'msg': '缺少活动ID'})

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

        # 更新活动信息（增加 is_force_insurance）
        sql = """
        UPDATE activities SET
            name = %s, description = %s, activity_time = %s, location = %s,
            route = %s, distance = %s, climb = %s, difficulty = %s,
            max_participants = %s, deadline = %s, cover_url = %s,
            group_qr_url = %s, wechat_id = %s, is_force_insurance = %s,
            status = 0,  -- 重新变为待审核
            reject_reason = NULL, reject_time = NULL, updated_at = NOW()
        WHERE id = %s
        """

        cursor.execute(sql, (
            data.get('name'),
            data.get('description'),
            data.get('activityTime'),
            data.get('location'),
            data.get('route'),
            data.get('distance', 0),
            data.get('climb', 0),
            data.get('difficulty'),
            data.get('maxParticipants', 20),
            data.get('deadline'),
            data.get('cover'),
            data.get('groupQR'),
            data.get('wechat'),
            data.get('mandatoryInsurance', 0),  # 新增字段
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
                "INSERT INTO activity_meeting_points (activity_id, point_order, meeting_time, location) VALUES (%s, %s, %s, %s)",
                (activity_id, index + 1, point.get('time'), point.get('location'))
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
            WHERE a.created_by = %s AND a.status != -1
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
        now = datetime.now()

        # 1. 更新状态为“进行中”（status=3）：当前时间 >= 活动开始时间，且活动未结束，且原状态为 1（已通过）
        cursor.execute("""
            UPDATE activities 
            SET status = 3 
            WHERE status = 1 
              AND activity_time <= %s 
              AND (deadline IS NULL OR deadline <= %s)  -- 可选：报名截止时间也已过
        """, (now, now))
        updated_to_ongoing = cursor.rowcount

        # 2. 更新状态为“已结束”（status=4）：当前时间 > 活动结束时间（这里假设活动时间即为结束时间）
        cursor.execute("""
            UPDATE activities 
            SET status = 4 
            WHERE status IN (1, 3) AND activity_time < %s
        """, (now,))
        updated_to_ended = cursor.rowcount

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
def get_activity_participants():
    """获取活动报名人员列表（忽略status字段，返回所有报名记录及用户头像）"""
    activity_id = request.args.get('activity_id')
    if not activity_id:
        return jsonify({'code': 400, 'msg': '缺少活动ID'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # 检查活动是否存在
        cursor.execute("SELECT id FROM activities WHERE id = %s", (activity_id,))
        if not cursor.fetchone():
            return jsonify({'code': 404, 'msg': '活动不存在'})

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

            travel_map = {1: '自驾', 2: '拼车', 3: '大巴'}
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
    data = request.get_json()
    draft_id = data.get('draft_id')

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

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
                    name = %s, description = %s, activity_time = %s, location = %s,
                    route = %s, distance = %s, climb = %s, difficulty = %s,
                    max_participants = %s, deadline = %s, cover_url = %s,
                    group_qr_url = %s, wechat_id = %s, is_force_insurance = %s,
                    updated_at = NOW()
                WHERE id = %s
            """, (
                data.get('name', ''),
                data.get('description', ''),
                data.get('activityTime') or None,
                data.get('location', ''),
                data.get('route', ''),
                data.get('distance', 0) or 0,
                data.get('climb', 0) or 0,
                data.get('difficulty', 1) or 1,
                data.get('maxParticipants', 2) or 2,
                data.get('deadline') or None,
                data.get('cover', ''),
                data.get('groupQR', ''),
                data.get('wechat', ''),
                data.get('mandatoryInsurance', 0) or 0,
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
                    "INSERT INTO activity_meeting_points (activity_id, point_order, meeting_time, location) VALUES (%s, %s, %s, %s)",
                    (draft_id, index + 1, point.get('time'), point.get('location'))
                )

            conn.commit()
            return jsonify({'code': 200, 'msg': '草稿已更新', 'data': {'draft_id': draft_id}})
        else:
            # 新建草稿
            activity_no = generate_activity_no()
            cursor.execute("""
                INSERT INTO activities (
                    activity_no, name, description, activity_time, location,
                    route, distance, climb, difficulty, max_participants,
                    deadline, cover_url, group_qr_url, wechat_id, created_by,
                    status, is_force_insurance, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, -1, %s, NOW())
            """, (
                activity_no,
                data.get('name', ''),
                data.get('description', ''),
                data.get('activityTime') or None,
                data.get('location', ''),
                data.get('route', ''),
                data.get('distance', 0) or 0,
                data.get('climb', 0) or 0,
                data.get('difficulty', 1) or 1,
                data.get('maxParticipants', 2) or 2,
                data.get('deadline') or None,
                data.get('cover', ''),
                data.get('groupQR', ''),
                data.get('wechat', ''),
                openid,
                data.get('mandatoryInsurance', 0) or 0
            ))

            new_id = cursor.lastrowid

            for travel_type in (data.get('travelOptions') or []):
                cursor.execute(
                    "INSERT INTO activity_travel_options (activity_id, travel_type, bus_qr_url) VALUES (%s, %s, %s)",
                    (new_id, travel_type, None)
                )

            for index, point in enumerate(data.get('meetingPoints') or []):
                cursor.execute(
                    "INSERT INTO activity_meeting_points (activity_id, point_order, meeting_time, location) VALUES (%s, %s, %s, %s)",
                    (new_id, index + 1, point.get('time'), point.get('location'))
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
            SELECT id, activity_no, name, description, activity_time, location,
                   difficulty, max_participants, cover_url, created_at, updated_at
            FROM activities
            WHERE created_by = %s AND status = -1
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

        # 校验归属和状态
        cursor.execute(
            "SELECT id, name, description, activity_time, location, wechat_id, group_qr_url FROM activities WHERE id = %s AND created_by = %s AND status = -1",
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
            "UPDATE activities SET status = 0, updated_at = NOW() WHERE id = %s",
            (draft_id,)
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