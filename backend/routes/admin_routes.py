from flask import Blueprint, request, jsonify, g
from datetime import datetime
import logging
from db_utils import get_db
from middleware import (
    check_verified_and_blacklist,
    check_admin,
    _invalidate_user_cache,
    _clear_user_cache,
)

admin_bp = Blueprint('admin', __name__)


@admin_bp.route('/dashboard', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def get_dashboard():
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as c FROM activities")
        total_activities = cursor.fetchone()['c']
        cursor.execute("SELECT COUNT(*) as c FROM activities WHERE status = 0 AND is_official = 0")
        pending = cursor.fetchone()['c']
        cursor.execute("SELECT COUNT(*) as c FROM activities WHERE status IN (1,3,4)")
        approved = cursor.fetchone()['c']
        cursor.execute("SELECT COUNT(*) as c FROM users")
        total_users = cursor.fetchone()['c']
        cursor.execute("SELECT COUNT(DISTINCT user_openid) as c FROM activity_participants WHERE status = 1")
        active_participants = cursor.fetchone()['c']
        cursor.execute("SELECT COUNT(*) as c FROM activity_participants WHERE status = 1 AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)")
        this_week_signups = cursor.fetchone()['c']
        return jsonify({'code': 200, 'data': {
            'total_activities': total_activities,
            'pending_count': pending,
            'approved_count': approved,
            'total_users': total_users,
            'active_participants': active_participants,
            'this_week_signups': this_week_signups
        }})
    except Exception:
        logging.exception("获取管理看板失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@admin_bp.route('/pending-activities', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def get_pending_activities():
    """获取待审核的活动列表（status=0）"""
    page = max(request.args.get('page', 1, type=int) or 1, 1)
    size = min(max(request.args.get('size', 20, type=int) or 20, 1), 50)
    offset = (page - 1) * size

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 查询总数
        cursor.execute("SELECT COUNT(*) as total FROM activities WHERE status = 0 AND is_official = 0")
        total = cursor.fetchone()['total']

        # 查询待审核列表
        cursor.execute("""
            SELECT a.*, u.nickName as creator_name, u.avatarUrl as creator_avatar
            FROM activities a
            JOIN users u ON a.created_by = u.openId
            WHERE a.status = 0 AND a.is_official = 0
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
    data = request.get_json(silent=True) or {}
    activity_id = data.get('activity_id')
    action = data.get('action')  # 'approve' 或 'reject'
    reject_reason = str(data.get('reject_reason') or '').strip()
    auditor_openid = g.openid  # 审核人openid

    if not activity_id or not action:
        return jsonify({'code': 400, 'msg': '缺少必要参数'})

    if action not in ['approve', 'reject']:
        return jsonify({'code': 400, 'msg': '无效的操作类型'})
    if action == 'reject' and not reject_reason.strip():
        return jsonify({'code': 400, 'msg': '驳回时请填写原因'})

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        # 检查活动是否存在
        cursor.execute(
            "SELECT id, status, created_by, is_official FROM activities WHERE id = %s FOR UPDATE",
            (activity_id,)
        )
        activity = cursor.fetchone()

        if not activity:
            return jsonify({'code': 404, 'msg': '活动不存在'})

        if activity.get('is_official') == 1:
            return jsonify({'code': 400, 'msg': '官方活动无需审核'})

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
    page = max(request.args.get('page', 1, type=int) or 1, 1)
    size = min(max(request.args.get('size', 20, type=int) or 20, 1), 50)
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
                   verifyAttempts, lastLoginTime, createTime,
                   COALESCE(NULLIF(blacklistSource, ''),
                       CASE WHEN verifyAttempts >= 3 THEN 'verification' ELSE 'manual' END
                   ) AS blacklistSource,
                   blacklistedAt, blacklistedBy
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
    data = request.get_json(silent=True) or {}
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
            SET isBlacklist = 0, verifyAttempts = 0, needVerify = 1, verified = 0,
                blacklistSource = '', blacklistedAt = NULL, blacklistedBy = NULL
            WHERE openId = %s
        """, (openid,))

        conn.commit()
        _invalidate_user_cache(openid)

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


@admin_bp.route('/blacklist-candidates', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def search_blacklist_candidates():
    """按昵称、微信号或精确 openId 搜索可手动拉黑的普通用户。"""
    keyword = str(request.args.get('keyword') or '').strip()
    if not keyword:
        return jsonify({'code': 200, 'data': {'list': []}})
    if len(keyword) > 100:
        return jsonify({'code': 400, 'msg': '搜索内容过长'})

    cursor = None
    try:
        cursor = get_db().cursor()
        pattern = f'%{keyword}%'
        cursor.execute("""
            SELECT openId, nickName, avatarUrl, wechatId, verified, verifyAttempts
            FROM users
            WHERE isBlacklist = 0
              AND (isAdmin = 0 OR isAdmin IS NULL)
              AND (nickName LIKE %s OR wechatId LIKE %s OR openId = %s)
            ORDER BY lastLoginTime DESC
            LIMIT 20
        """, (pattern, pattern, keyword))
        return jsonify({'code': 200, 'data': {'list': cursor.fetchall()}})
    except Exception:
        logging.exception("搜索黑名单候选用户失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


@admin_bp.route('/blacklist', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def add_to_blacklist():
    """管理员手动将普通用户加入黑名单。"""
    data = request.get_json(silent=True) or {}
    openid = str(data.get('openid') or data.get('openId') or '').strip()
    if not openid or len(openid) > 100:
        return jsonify({'code': 400, 'msg': '用户标识无效'})
    if openid == g.openid:
        return jsonify({'code': 400, 'msg': '不能拉黑当前管理员账号'})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT openId, isAdmin, isBlacklist FROM users WHERE openId = %s FOR UPDATE",
            (openid,)
        )
        user = cursor.fetchone()
        if not user:
            return jsonify({'code': 404, 'msg': '用户不存在'})
        if user.get('isAdmin') == 1:
            return jsonify({'code': 400, 'msg': '不能手动拉黑管理员账号'})
        if user.get('isBlacklist') == 1:
            return jsonify({'code': 409, 'msg': '该用户已在黑名单中'})

        cursor.execute("""
            UPDATE users
            SET isBlacklist = 1, blacklistSource = 'manual',
                blacklistedAt = NOW(), blacklistedBy = %s
            WHERE openId = %s
        """, (g.openid, openid))
        conn.commit()
        _invalidate_user_cache(openid)
        return jsonify({'code': 200, 'msg': '已手动加入黑名单'})
    except Exception:
        conn.rollback()
        logging.exception("手动加入黑名单失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


@admin_bp.route('/verification-attempts', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def get_verification_attempts():
    """查看指定用户最近的验证答题记录。"""
    openid = str(request.args.get('openid') or request.args.get('openId') or '').strip()
    if not openid or len(openid) > 100:
        return jsonify({'code': 400, 'msg': '用户标识无效'})

    cursor = None
    try:
        cursor = get_db().cursor()
        cursor.execute("SELECT openId, nickName, wechatId FROM users WHERE openId = %s", (openid,))
        user = cursor.fetchone()
        if not user:
            return jsonify({'code': 404, 'msg': '用户不存在'})
        cursor.execute("""
            SELECT id, question_text, submitted_answer, is_correct, created_at
            FROM verification_attempt_logs
            WHERE user_openid = %s
            ORDER BY created_at DESC, id DESC
            LIMIT 50
        """, (openid,))
        records = cursor.fetchall()
        return jsonify({'code': 200, 'data': {'user': user, 'list': records}})
    except Exception:
        logging.exception("获取验证答题记录失败")
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
        _clear_user_cache()

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


@admin_bp.route('/verify-questions', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def add_verify_question():
    """添加验证问题"""
    data = request.get_json(silent=True) or {}
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


@admin_bp.route('/verify-questions/<int:qid>', methods=['PUT'])
@check_verified_and_blacklist
@check_admin
def update_verify_question(qid):
    """更新验证问题"""
    data = request.get_json(silent=True) or {}
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


# ==================== 官方账号白名单 ====================

@admin_bp.route('/official-accounts', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def get_official_accounts():
    """获取全部官方账号白名单。"""
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT openId, nickName, avatarUrl, wechatId, isOfficial, createTime, lastLoginTime
            FROM users
            WHERE isOfficial = 1
            ORDER BY nickName ASC, openId ASC
        """)
        accounts = cursor.fetchall()
        return jsonify({'code': 200, 'data': {'list': accounts, 'total': len(accounts)}})
    except Exception:
        logging.exception("获取官方账号白名单失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@admin_bp.route('/official-accounts/bootstrap', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def bootstrap_official_account():
    """白名单为空时，由当前管理员主动初始化自己为首个官方账号。"""
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT openId FROM users WHERE isOfficial = 1 LIMIT 1 FOR UPDATE")
        if cursor.fetchone():
            return jsonify({'code': 409, 'msg': '官方账号已初始化，请使用搜索添加白名单'})

        cursor.execute("""
            SELECT openId, nickName, avatarUrl, wechatId, isAdmin, isOfficial
            FROM users
            WHERE openId = %s AND isAdmin = 1
            FOR UPDATE
        """, (g.openid,))
        account = cursor.fetchone()
        if not account:
            return jsonify({'code': 403, 'msg': '当前账号不是管理员'})

        cursor.execute("UPDATE users SET isOfficial = 1 WHERE openId = %s", (g.openid,))
        conn.commit()
        _invalidate_user_cache(g.openid)
        account['isOfficial'] = 1
        return jsonify({
            'code': 200,
            'msg': '已将当前管理员设为首个官方账号',
            'data': account,
        })
    except Exception:
        if conn:
            conn.rollback()
        logging.exception("初始化官方账号失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@admin_bp.route('/official-account-candidates', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def search_official_account_candidates():
    """按昵称、微信号或精确 openId 搜索可加入白名单的用户。"""
    keyword = str(request.args.get('keyword') or '').strip()
    if not keyword:
        return jsonify({'code': 200, 'data': {'list': []}})
    if len(keyword) > 100:
        return jsonify({'code': 400, 'msg': '搜索内容过长'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        pattern = f'%{keyword}%'
        cursor.execute("""
            SELECT openId, nickName, avatarUrl, wechatId, verified, isAdmin, isOfficial
            FROM users
            WHERE isOfficial = 0
              AND isBlacklist = 0
              AND (nickName LIKE %s OR wechatId LIKE %s OR openId = %s)
            ORDER BY lastLoginTime DESC
            LIMIT 20
        """, (pattern, pattern, keyword))
        return jsonify({'code': 200, 'data': {'list': cursor.fetchall()}})
    except Exception:
        logging.exception("搜索官方账号候选用户失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@admin_bp.route('/official-accounts', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def add_official_account():
    """将注册用户加入官方账号白名单，授予官方活动共享管理权限。"""
    data = request.get_json(silent=True) or {}
    openid = str(data.get('openid') or data.get('openId') or '').strip()
    if not openid or len(openid) > 100:
        return jsonify({'code': 400, 'msg': '用户标识无效'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT openId, nickName, avatarUrl, wechatId, isOfficial
            FROM users WHERE openId = %s FOR UPDATE
        """, (openid,))
        account = cursor.fetchone()
        if not account:
            return jsonify({'code': 404, 'msg': '用户不存在'})

        if account.get('isOfficial') != 1:
            cursor.execute("UPDATE users SET isOfficial = 1 WHERE openId = %s", (openid,))
            conn.commit()
            _invalidate_user_cache(openid)

        account['isOfficial'] = 1
        return jsonify({'code': 200, 'msg': '已加入官方账号白名单', 'data': account})
    except Exception:
        if conn:
            conn.rollback()
        logging.exception("添加官方账号失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@admin_bp.route('/official-accounts/remove', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def remove_official_account():
    """将用户移出白名单；历史官方活动保持不变。"""
    data = request.get_json(silent=True) or {}
    openid = str(data.get('openid') or data.get('openId') or '').strip()
    if not openid or len(openid) > 100:
        return jsonify({'code': 400, 'msg': '用户标识无效'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT openId, isOfficial FROM users WHERE openId = %s FOR UPDATE", (openid,))
        account = cursor.fetchone()
        if not account:
            return jsonify({'code': 404, 'msg': '用户不存在'})
        if account.get('isOfficial') != 1:
            return jsonify({'code': 404, 'msg': '该用户不在官方账号白名单中'})

        cursor.execute("UPDATE users SET isOfficial = 0 WHERE openId = %s", (openid,))
        conn.commit()
        _invalidate_user_cache(openid)
        return jsonify({'code': 200, 'msg': '已移出官方账号白名单'})
    except Exception:
        if conn:
            conn.rollback()
        logging.exception("移除官方账号失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
