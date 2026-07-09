from flask import Blueprint, request, jsonify, g
from datetime import datetime
import logging
from db_utils import get_db
from middleware import check_verified_and_blacklist, check_admin

admin_bp = Blueprint('admin', __name__)


@admin_bp.route('/pending-activities', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def get_pending_activities():
    """获取待审核的活动列表（status=0）"""
    page = int(request.args.get('page', 1))
    size = int(request.args.get('size', 20))
    offset = (page - 1) * size

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 查询总数
        cursor.execute("SELECT COUNT(*) as total FROM activities WHERE status = 0")
        total = cursor.fetchone()['total']

        # 查询待审核列表
        cursor.execute("""
            SELECT a.*, u.nickName as creator_name, u.avatarUrl as creator_avatar
            FROM activities a
            JOIN users u ON a.created_by = u.openId
            WHERE a.status = 0
            ORDER BY a.created_at ASC
            LIMIT %s OFFSET %s
        """, (size, offset))

        activities = cursor.fetchall()

        # 获取每个活动的报名人数
        for activity in activities:
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
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


@admin_bp.route('/review-activity', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def review_activity():
    """审核活动（通过/驳回）"""
    data = request.get_json()
    activity_id = data.get('activity_id')
    action = data.get('action')  # 'approve' 或 'reject'
    reject_reason = data.get('reject_reason', '')
    auditor_openid = g.openid  # 审核人openid

    if not activity_id or not action:
        return jsonify({'code': 400, 'msg': '缺少必要参数'})

    if action not in ['approve', 'reject']:
        return jsonify({'code': 400, 'msg': '无效的操作类型'})

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 检查活动是否存在
        cursor.execute("SELECT id, status, created_by FROM activities WHERE id = %s", (activity_id,))
        activity = cursor.fetchone()

        if not activity:
            return jsonify({'code': 404, 'msg': '活动不存在'})

        if activity['status'] != 0:
            return jsonify({'code': 400, 'msg': '活动已被审核过'})

        # 更新活动状态
        if action == 'approve':
            new_status = 1  # 审核通过
            action_code = 2  # 审核通过
            msg = '活动审核通过'
            reason = ''
        else:
            new_status = 2  # 审核拒绝
            action_code = 3  # 审核拒绝
            msg = '活动已驳回'
            reason = reject_reason

            # 保存驳回原因到 activities 表
            cursor.execute("""
                UPDATE activities 
                SET reject_reason = %s, reject_time = NOW()
                WHERE id = %s
            """, (reject_reason, activity_id))

        # 更新活动状态
        cursor.execute("UPDATE activities SET status = %s WHERE id = %s", (new_status, activity_id))

        # 记录审核日志（使用正确的字段名：reason）
        cursor.execute("""
            INSERT INTO activity_audit_logs (activity_id, auditor_openid, action, reason, created_at)
            VALUES (%s, %s, %s, %s, NOW())
        """, (activity_id, auditor_openid, action_code, reason))

        conn.commit()

        return jsonify({
            'code': 200,
            'msg': msg,
            'data': {'activity_id': activity_id, 'status': new_status}
        })

    except Exception:
        if conn:
            conn.rollback()
        logging.exception("数据库操作失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


@admin_bp.route('/blacklist', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def get_blacklist():
    """获取黑名单用户列表"""
    page = int(request.args.get('page', 1))
    size = int(request.args.get('size', 20))
    offset = (page - 1) * size

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as total FROM users WHERE isBlacklist = 1")
        total = cursor.fetchone()['total']

        cursor.execute("""
            SELECT openId, nickName, avatarUrl, phoneNumber, wechatId,
                   verifyAttempts, lastLoginTime, createTime
            FROM users 
            WHERE isBlacklist = 1
            ORDER BY lastLoginTime DESC
            LIMIT %s OFFSET %s
        """, (size, offset))

        users = cursor.fetchall()

        return jsonify({
            'code': 200,
            'data': {
                'list': users,
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


@admin_bp.route('/remove-blacklist', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def remove_from_blacklist():
    """将用户移出黑名单"""
    data = request.get_json()
    openid = data.get('openid')

    if not openid:
        return jsonify({'code': 400, 'msg': '缺少用户openid'})

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE users 
            SET isBlacklist = 0, verifyAttempts = 0, needVerify = 1, verified = 0
            WHERE openId = %s
        """, (openid,))

        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({'code': 404, 'msg': '用户不存在或不在黑名单中'})

        return jsonify({'code': 200, 'msg': '已移出黑名单'})

    except Exception:
        if conn:
            conn.rollback()
        logging.exception("数据库操作失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


@admin_bp.route('/reset-all-verification', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def reset_all_verification():
    """管理员触发全员重新验证：将所有非管理员用户重置为未验证状态"""
    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 重置所有非管理员用户的验证状态（保持管理员不受影响）
        cursor.execute("""
            UPDATE users 
            SET needVerify = 1, verified = 0, verifyAttempts = 0
            WHERE isAdmin = 0 OR isAdmin IS NULL
        """)

        affected = cursor.rowcount
        conn.commit()

        return jsonify({
            'code': 200,
            'msg': f'已重置 {affected} 位用户的验证状态',
            'data': {'affected_count': affected}
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


# ==================== 验证问题管理 ====================

@admin_bp.route('/verify-questions', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def get_verify_questions():
    """获取所有验证问题"""
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, question, answers, sort_order, is_active, created_at, updated_at FROM verify_questions ORDER BY sort_order ASC"
        )
        rows = cursor.fetchall()
        questions = []
        for row in rows:
            questions.append({
                'id': row['id'],
                'question': row['question'],
                'answers': [a.strip() for a in row['answers'].split(',')],
                'sort_order': row['sort_order'],
                'is_active': row['is_active'],
                'answers_text': row['answers']
            })
        return jsonify({'code': 200, 'data': questions})
    except Exception:
        logging.exception("获取验证问题失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@admin_bp.route('/verify-questions', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def add_verify_question():
    """添加验证问题"""
    data = request.get_json()
    question = (data.get('question') or '').strip()
    answers = (data.get('answers') or '').strip()

    if not question or not answers:
        return jsonify({'code': 400, 'msg': '问题和答案都不能为空'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT COALESCE(MAX(sort_order), 0) as max_order FROM verify_questions")
        max_order = cursor.fetchone()['max_order']

        cursor.execute(
            "INSERT INTO verify_questions (question, answers, sort_order, is_active) VALUES (%s, %s, %s, 1)",
            (question, answers, max_order + 1)
        )
        conn.commit()
        new_id = cursor.lastrowid
        return jsonify({'code': 200, 'msg': '添加成功', 'data': {'id': new_id}})
    except Exception:
        if conn:
            conn.rollback()
        logging.exception("添加验证问题失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@admin_bp.route('/verify-questions/<int:qid>', methods=['PUT'])
@check_verified_and_blacklist
@check_admin
def update_verify_question(qid):
    """更新验证问题"""
    data = request.get_json()
    question = (data.get('question') or '').strip()
    answers = (data.get('answers') or '').strip()
    is_active = data.get('is_active')

    if not question or not answers:
        return jsonify({'code': 400, 'msg': '问题和答案都不能为空'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        if is_active is not None:
            cursor.execute(
                "UPDATE verify_questions SET question = %s, answers = %s, is_active = %s WHERE id = %s",
                (question, answers, int(is_active), qid)
            )
        else:
            cursor.execute(
                "UPDATE verify_questions SET question = %s, answers = %s WHERE id = %s",
                (question, answers, qid)
            )

        if cursor.rowcount == 0:
            return jsonify({'code': 404, 'msg': '问题不存在'})

        conn.commit()
        return jsonify({'code': 200, 'msg': '更新成功'})
    except Exception:
        if conn:
            conn.rollback()
        logging.exception("更新验证问题失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@admin_bp.route('/verify-questions/<int:qid>', methods=['DELETE'])
@check_verified_and_blacklist
@check_admin
def delete_verify_question(qid):
    """删除验证问题"""
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as cnt FROM verify_questions WHERE is_active = 1")
        cnt = cursor.fetchone()['cnt']
        if cnt <= 1:
            return jsonify({'code': 400, 'msg': '至少需要保留 1 道验证问题'})

        cursor.execute("DELETE FROM verify_questions WHERE id = %s", (qid,))
        if cursor.rowcount == 0:
            return jsonify({'code': 404, 'msg': '问题不存在'})

        conn.commit()
        return jsonify({'code': 200, 'msg': '删除成功'})
    except Exception:
        if conn:
            conn.rollback()
        logging.exception("删除验证问题失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()