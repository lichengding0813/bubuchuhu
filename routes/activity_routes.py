from flask import Blueprint, request, jsonify, g
from datetime import datetime
import random
import pymysql
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

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 生成活动编号
        activity_no = generate_activity_no()

        # 1. 插入活动主表
        sql = """
        INSERT INTO activities (
            activity_no, name, description, activity_time, location,
            route, distance, climb, difficulty, max_participants,
            deadline, cover_url, group_qr_url, wechat_id, created_by,
            status, created_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
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
            0  # 默认待审核
        ))

        activity_id = cursor.lastrowid

        # 2. 插入出行方式
        travel_options = data.get('travelOptions', [])
        for travel_type in travel_options:
            bus_qr = data.get('busQR') if travel_type == 1 else None
            cursor.execute(
                "INSERT INTO activity_travel_options (activity_id, travel_type, bus_qr_url) VALUES (%s, %s, %s)",
                (activity_id, travel_type, bus_qr)
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

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
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

    offset = (page - 1) * size
    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 构建查询条件
        where_clause = "WHERE 1=1"
        params = []

        if status is not None:
            where_clause += " AND a.status = %s"
            params.append(status)

        if keyword:
            where_clause += " AND (a.name LIKE %s OR a.description LIKE %s OR a.location LIKE %s)"
            params.extend([f'%{keyword}%', f'%{keyword}%', f'%{keyword}%'])

        # 查询总数
        cursor.execute(f"SELECT COUNT(*) as total FROM activities a {where_clause}", params)
        total = cursor.fetchone()['total']

        # 查询列表 - 添加 reject_reason 和发起人信息
        sql = f"""
        SELECT 
            a.id, a.activity_no, a.name, a.description, a.activity_time, a.location,
            a.difficulty, a.max_participants, a.status, a.cover_url, a.view_count,
            a.created_at, a.created_by, a.reject_reason,
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
                "SELECT COUNT(*) as count FROM activity_participants WHERE activity_id = %s AND status = 1",
                (activity['id'],)
            )
            activity['participant_count'] = cursor.fetchone()['count']

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
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@activity_bp.route('/detail', methods=['GET'])
def get_activity_detail():
    """获取活动详情"""
    activity_id = request.args.get('id')

    if not activity_id:
        return jsonify({'code': 400, 'msg': '缺少活动ID'})

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 获取活动基本信息 - 添加 reject_reason 字段
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
        cursor.execute("SELECT COUNT(*) as count FROM activity_participants WHERE activity_id = %s AND status = 1",
                       (activity_id,))
        activity['participant_count'] = cursor.fetchone()['count']

        conn.commit()

        return jsonify({
            'code': 200,
            'data': activity
        })

    except Exception as e:
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
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

        if activity['status'] != 1:
            return jsonify({'code': 400, 'msg': '活动不可报名'})

        # 检查是否已报名
        cursor.execute(
            "SELECT id FROM activity_participants WHERE activity_id = %s AND user_openid = %s",
            (activity_id, openid)
        )
        if cursor.fetchone():
            return jsonify({'code': 400, 'msg': '您已报名该活动'})

        # 检查人数限制
        cursor.execute(
            "SELECT COUNT(*) as count FROM activity_participants WHERE activity_id = %s AND status = 1",
            (activity_id,)
        )
        current_count = cursor.fetchone()['count']

        if current_count >= activity['max_participants']:
            return jsonify({'code': 400, 'msg': '报名人数已满'})

        # 插入报名记录
        cursor.execute("""
            INSERT INTO activity_participants (
                activity_id, user_openid, nickname, phone, wechat_id, 
                travel_option, remark, status, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
        """, (
            activity_id,
            openid,
            data.get('nickname'),
            data.get('phone'),
            data.get('wechat_id'),
            data.get('travel_option'),
            data.get('remark'),
            0  # 待确认
        ))

        conn.commit()

        return jsonify({'code': 200, 'msg': '报名成功'})

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
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

        cursor.execute("""
            SELECT a.*, 
                   (SELECT COUNT(*) FROM activity_participants WHERE activity_id = a.id AND status = 1) as participant_count,
                   u.nickName as creator_name, u.avatarUrl as creator_avatar
            FROM activities a
            LEFT JOIN users u ON a.created_by = u.openId
            WHERE a.created_by = %s 
            ORDER BY a.created_at DESC
        """, (openid,))

        activities = cursor.fetchall()

        return jsonify({
            'code': 200,
            'data': activities
        })

    except Exception as e:
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
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
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
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

        if activity['status'] != 2:  # 2表示审核拒绝
            return jsonify({'code': 400, 'msg': '只有被驳回的活动才能修改'})

        # 更新活动信息
        sql = """
        UPDATE activities SET
            name = %s, description = %s, activity_time = %s, location = %s,
            route = %s, distance = %s, climb = %s, difficulty = %s,
            max_participants = %s, deadline = %s, cover_url = %s,
            group_qr_url = %s, wechat_id = %s, status = 0,  -- 重新变为待审核
            reject_reason = NULL, reject_time = NULL,  -- 清空驳回信息
            updated_at = NOW()
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
            activity_id
        ))

        # 删除旧的出行方式和集合点
        cursor.execute("DELETE FROM activity_travel_options WHERE activity_id = %s", (activity_id,))
        cursor.execute("DELETE FROM activity_meeting_points WHERE activity_id = %s", (activity_id,))

        # 重新插入出行方式
        travel_options = data.get('travelOptions', [])
        for travel_type in travel_options:
            bus_qr = data.get('busQR') if travel_type == 1 else None
            cursor.execute(
                "INSERT INTO activity_travel_options (activity_id, travel_type, bus_qr_url) VALUES (%s, %s, %s)",
                (activity_id, travel_type, bus_qr)
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

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
    finally:
        if cursor:
            cursor.close()


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

        cursor.execute("""
            SELECT a.*, 
                   (SELECT COUNT(*) FROM activity_participants WHERE activity_id = a.id AND status = 1) as participant_count,
                   (SELECT reason FROM activity_audit_logs 
                    WHERE activity_id = a.id AND action = 3 
                    ORDER BY created_at DESC LIMIT 1) as last_reject_reason,
                   u.nickName as creator_name, u.avatarUrl as creator_avatar
            FROM activities a
            LEFT JOIN users u ON a.created_by = u.openId
            WHERE a.created_by = %s 
            ORDER BY a.created_at DESC
        """, (openid,))

        activities = cursor.fetchall()

        return jsonify({
            'code': 200,
            'data': activities
        })

    except Exception as e:
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
    finally:
        if cursor:
            cursor.close()


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
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
    finally:
        if cursor:
            cursor.close()