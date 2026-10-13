"""活动取消事务；由调用方提交或回滚。"""
from datetime import datetime, timedelta

from domain import can_manage_activity_participants, parse_datetime


class ActivityCancellationError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def cancel_activity(cursor, activity_id, operator_openid, now=None):
    """锁定活动，校验管理权限，保留报名和奖品历史后终止活动。"""
    cursor.execute("""
        SELECT id, status, created_by, is_official, activity_time, end_time
        FROM activities WHERE id = %s FOR UPDATE
    """, (activity_id,))
    activity = cursor.fetchone()
    if not activity:
        raise ActivityCancellationError(404, '活动不存在')
    cursor.execute('SELECT isAdmin, isOfficial FROM users WHERE openId = %s', (operator_openid,))
    if not can_manage_activity_participants(activity, operator_openid, cursor.fetchone()):
        raise ActivityCancellationError(403, '无权取消该活动')
    status = int(activity.get('status') or 0)
    if status == 5:
        raise ActivityCancellationError(400, '活动已取消')
    if status not in (1, 3):
        raise ActivityCancellationError(400, '只能取消报名中或进行中的活动')
    end_time = parse_datetime(activity.get('end_time'))
    start_time = parse_datetime(activity.get('activity_time'))
    if not end_time and start_time:
        end_time = start_time + timedelta(hours=12)
    if end_time and end_time <= (now or datetime.now()):
        raise ActivityCancellationError(400, '活动已结束，无法取消')

    cursor.execute('UPDATE activities SET status = 5, updated_at = NOW() WHERE id = %s', (activity_id,))
    cursor.execute('UPDATE activity_lotteries SET status = 2, updated_at = NOW() WHERE activity_id = %s AND status <> 2', (activity_id,))
    cursor.execute("""
        UPDATE notification_jobs SET status = 'skipped', last_error = '活动已取消', updated_at = NOW()
        WHERE activity_id = %s AND event_type IN ('activity_reminder', 'lottery_start')
          AND status IN ('pending', 'retry', 'processing')
    """, (activity_id,))
    # action 5 已用于撤回审核；6 表示取消已发布的活动。
    cursor.execute("""
        INSERT INTO activity_audit_logs (activity_id, auditor_openid, action, reason)
        VALUES (%s, %s, 6, '取消活动')
    """, (activity_id, operator_openid))
    return {'activity_id': activity_id, 'status': 5}
