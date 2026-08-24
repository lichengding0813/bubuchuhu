"""微信小程序订阅消息：授权额度、任务队列与后台发送。"""
from datetime import datetime
import json
import logging
import os
import threading
import time
import uuid

import requests

from config import WX_API_BASE, WX_APPID, WX_SECRET
from db_utils import get_db


TEMPLATE_BLACKLIST = os.environ.get(
    'WX_TEMPLATE_BLACKLIST',
    'W9zXWifqlQNq3Gv0tE3WQZwJfvpV8HZ6R8ibU7wU1Ys',
)
TEMPLATE_LOTTERY_START = os.environ.get(
    'WX_TEMPLATE_LOTTERY_START',
    'VsSKdYZduCzOk5WDINXNy0rkMX-MGcjFhg-KIgK_koY',
)
TEMPLATE_ACTIVITY_REMINDER = os.environ.get(
    'WX_TEMPLATE_ACTIVITY_REMINDER',
    'VYfqV2moc2_YVzFvcHUsSgKSg7gKiPklfXRoLJAx7EU',
)
TEMPLATE_PENDING_APPROVAL = os.environ.get(
    'WX_TEMPLATE_PENDING_APPROVAL',
    'XSdbgcKEQ30i8_FsciyuHbyfSXDy6VodbW-9cKqoIac',
)

ADMIN_TEMPLATE_IDS = (TEMPLATE_PENDING_APPROVAL, TEMPLATE_BLACKLIST)
USER_TEMPLATE_IDS = (TEMPLATE_ACTIVITY_REMINDER, TEMPLATE_LOTTERY_START)
ALL_TEMPLATE_IDS = set(ADMIN_TEMPLATE_IDS + USER_TEMPLATE_IDS)

_access_token_cache = {'token': None, 'expires_at': 0}
_worker_started = False
_worker_start_lock = threading.Lock()


def _format_time(value):
    if isinstance(value, datetime):
        return value.strftime('%Y年%m月%d日 %H:%M')
    return str(value or '')[:20]


def _thing(value, limit=20):
    text = ' '.join(str(value or '').strip().split())
    return text[:limit] or '-'


def _message_data(values):
    return {key: {'value': value} for key, value in values.items()}


def get_access_token():
    """获取发送订阅消息所需 access_token；沿用项目现有 WX_API_BASE。"""
    now = time.time()
    if _access_token_cache['token'] and _access_token_cache['expires_at'] > now + 300:
        return _access_token_cache['token']

    url = f"{WX_API_BASE.rstrip('/')}/cgi-bin/token"
    response = requests.get(url, params={
        'grant_type': 'client_credential',
        'appid': WX_APPID,
        'secret': WX_SECRET,
    }, timeout=10)
    result = response.json()
    token = result.get('access_token')
    if not token:
        raise RuntimeError(f"获取access_token失败: {result.get('errcode')} {result.get('errmsg', '')}")
    _access_token_cache['token'] = token
    _access_token_cache['expires_at'] = now + int(result.get('expires_in') or 7200)
    return token


def record_subscription_results(openid, results):
    """记录一次用户主动订阅结果；每次 accept 增加一条可发送额度。"""
    conn = get_db()
    cursor = conn.cursor()
    try:
        for template_id, status in results.items():
            if template_id not in ALL_TEMPLATE_IDS or status not in ('accept', 'reject', 'ban'):
                continue
            accepted = 1 if status == 'accept' else 0
            rejected = 1 if status in ('reject', 'ban') else 0
            cursor.execute("""
                INSERT INTO notification_subscriptions
                    (user_openid, template_id, available_count, accepted_count,
                     rejected_count, last_response, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON DUPLICATE KEY UPDATE
                    available_count = available_count + VALUES(available_count),
                    accepted_count = accepted_count + VALUES(accepted_count),
                    rejected_count = rejected_count + VALUES(rejected_count),
                    last_response = VALUES(last_response),
                    updated_at = NOW()
            """, (openid, template_id, accepted, accepted, rejected, status))
            if status == 'ban':
                cursor.execute("""
                    UPDATE notification_subscriptions SET available_count = 0
                    WHERE user_openid = %s AND template_id = %s
                """, (openid, template_id))
        conn.commit()
        cursor.execute("""
            SELECT template_id, available_count, last_response
            FROM notification_subscriptions WHERE user_openid = %s
        """, (openid,))
        return cursor.fetchall()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()


def _insert_job(cursor, *, template_id, recipient, event_type, dedupe_key,
                scheduled_at, page, data, activity_id=None, lottery_id=None):
    cursor.execute("""
        INSERT IGNORE INTO notification_jobs
            (template_id, recipient_openid, event_type, activity_id, lottery_id,
             dedupe_key, scheduled_at, page_path, payload_json, status, next_attempt_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', NOW())
    """, (
        template_id, recipient, event_type, activity_id, lottery_id,
        dedupe_key, scheduled_at, page,
        json.dumps(data, ensure_ascii=False, separators=(',', ':')),
    ))


def _queue_staff_message(template_id, event_type, data, page, dedupe_prefix):
    """为已授权的业务管理员排队；异常只记录日志，不影响主业务。"""
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT u.openId
            FROM users u
            JOIN notification_subscriptions s
              ON s.user_openid = u.openId AND s.template_id = %s
            WHERE (u.isAdmin = 1 OR u.isOfficial = 1)
              AND u.isBlacklist = 0 AND s.available_count > 0
        """, (template_id,))
        recipients = [row['openId'] for row in cursor.fetchall()]
        event_id = uuid.uuid4().hex[:12]
        for recipient in recipients:
            _insert_job(
                cursor,
                template_id=template_id,
                recipient=recipient,
                event_type=event_type,
                dedupe_key=f'{dedupe_prefix}:{event_id}:{recipient}',
                scheduled_at=datetime.now(),
                page=page,
                data=data,
            )
        conn.commit()
    except Exception:
        conn.rollback()
        logging.exception('订阅消息排队失败（不影响主业务）')
    finally:
        cursor.close()


def queue_pending_approval(activity_id, activity_name):
    _queue_staff_message(
        TEMPLATE_PENDING_APPROVAL,
        'pending_approval',
        _message_data({
            'thing1': _thing(activity_name),
            'thing2': _thing('普通活动待审核，请及时处理'),
        }),
        'pages/admin-review/admin-review',
        f'pending:{activity_id}',
    )


def queue_blacklist_notice(target, source):
    nickname = target.get('nickName') or target.get('wechatId') or target.get('openId') or '未知用户'
    manual = source == 'manual'
    _queue_staff_message(
        TEMPLATE_BLACKLIST,
        'blacklist_added',
        _message_data({
            'thing1': _thing('管理员手动拉黑' if manual else '验证答题错误达到上限'),
            'thing2': _thing(nickname),
            'thing3': _thing('账号违规处理' if manual else '身份验证连续答错3次'),
            'thing4': _thing('已加入黑名单'),
            'time5': _format_time(datetime.now()),
        }),
        'pages/blacklist/blacklist',
        f"blacklist:{target.get('openId', '')}",
    )


def _discover_activity_reminders(cursor):
    cursor.execute("""
        SELECT a.id AS activity_id, a.name, a.activity_time, a.location,
               p.user_openid
        FROM activities a
        JOIN activity_participants p ON p.activity_id = a.id AND p.status = 1
        JOIN users u ON u.openId = p.user_openid AND u.isBlacklist = 0
        JOIN notification_subscriptions s
          ON s.user_openid = p.user_openid
         AND s.template_id = %s AND s.available_count > 0
        WHERE a.status IN (1, 3)
          AND a.activity_time > NOW()
          AND a.activity_time <= DATE_ADD(NOW(), INTERVAL 48 HOUR)
    """, (TEMPLATE_ACTIVITY_REMINDER,))
    for row in cursor.fetchall():
        _insert_job(
            cursor,
            template_id=TEMPLATE_ACTIVITY_REMINDER,
            recipient=row['user_openid'],
            event_type='activity_reminder',
            activity_id=row['activity_id'],
            dedupe_key=f"activity-reminder:{row['activity_id']}:{row['user_openid']}",
            scheduled_at=datetime.now(),
            page=f"pages/details/details?id={row['activity_id']}",
            data=_message_data({
                'time2': _format_time(row['activity_time']),
                'thing3': _thing(row.get('location')),
                'thing4': _thing(row.get('name')),
                'thing5': _thing('请留意集合安排并提前做好准备'),
            }),
        )


def _discover_lottery_reminders(cursor):
    cursor.execute("""
        SELECT l.id AS lottery_id, l.activity_id, l.lottery_name, l.start_time,
               a.name AS activity_name, p.user_openid
        FROM activity_lotteries l
        JOIN activities a ON a.id = l.activity_id
        JOIN activity_participants p ON p.activity_id = l.activity_id AND p.status = 1
        JOIN users u ON u.openId = p.user_openid AND u.isBlacklist = 0
        JOIN notification_subscriptions sub
          ON sub.user_openid = p.user_openid
         AND sub.template_id = %s AND sub.available_count > 0
        LEFT JOIN lottery_user_states state
          ON state.lottery_id = l.id AND state.user_openid = p.user_openid
        WHERE l.status <> 2
          AND l.start_time <= NOW() AND l.end_time > NOW()
          AND COALESCE(state.chances_used, 0) < COALESCE(state.chances_total, 1)
    """, (TEMPLATE_LOTTERY_START,))
    for row in cursor.fetchall():
        name = row.get('activity_name') or row.get('lottery_name')
        _insert_job(
            cursor,
            template_id=TEMPLATE_LOTTERY_START,
            recipient=row['user_openid'],
            event_type='lottery_start',
            activity_id=row['activity_id'],
            lottery_id=row['lottery_id'],
            dedupe_key=f"lottery-start:{row['lottery_id']}:{row['user_openid']}",
            scheduled_at=datetime.now(),
            page=f"pages/details/details?id={row['activity_id']}",
            data=_message_data({
                'thing1': _thing(name),
                'time2': _format_time(row['start_time']),
            }),
        )


def _send_job(job):
    token = get_access_token()
    url = f"{WX_API_BASE.rstrip('/')}/cgi-bin/message/subscribe/send"
    response = requests.post(url, params={'access_token': token}, json={
        'touser': job['recipient_openid'],
        'template_id': job['template_id'],
        'page': job.get('page_path') or 'pages/home/home',
        'miniprogram_state': os.environ.get('WX_MINIPROGRAM_STATE', 'formal'),
        'lang': 'zh_CN',
        'data': json.loads(job['payload_json']),
    }, timeout=10)
    return response.json()


def process_notification_jobs(batch_size=50):
    """发现到期提醒并发送任务。MySQL 全局锁避免多 worker 重复处理。"""
    conn = get_db()
    cursor = conn.cursor()
    lock_acquired = False
    summary = {'queued': 0, 'sent': 0, 'skipped': 0, 'failed': 0}
    try:
        cursor.execute("SELECT GET_LOCK('bubuchuhu_notification_worker', 0) AS acquired")
        lock_acquired = cursor.fetchone().get('acquired') == 1
        if not lock_acquired:
            return summary

        cursor.execute("""
            UPDATE notification_jobs SET status = 'retry', next_attempt_at = NOW()
            WHERE status = 'processing' AND updated_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
        """)
        _discover_activity_reminders(cursor)
        _discover_lottery_reminders(cursor)
        conn.commit()

        cursor.execute("""
            SELECT * FROM notification_jobs
            WHERE status IN ('pending', 'retry')
              AND scheduled_at <= NOW() AND next_attempt_at <= NOW()
            ORDER BY scheduled_at, id LIMIT %s
        """, (int(batch_size),))
        jobs = cursor.fetchall()
        summary['queued'] = len(jobs)

        for job in jobs:
            cursor.execute("""
                UPDATE notification_jobs SET status = 'processing', attempts = attempts + 1
                WHERE id = %s AND status IN ('pending', 'retry')
            """, (job['id'],))
            if cursor.rowcount != 1:
                conn.commit()
                continue
            conn.commit()

            cursor.execute("""
                SELECT available_count FROM notification_subscriptions
                WHERE user_openid = %s AND template_id = %s
            """, (job['recipient_openid'], job['template_id']))
            subscription = cursor.fetchone()
            if not subscription or int(subscription['available_count'] or 0) < 1:
                cursor.execute("""
                    UPDATE notification_jobs SET status = 'skipped', last_error = '无可用订阅额度'
                    WHERE id = %s
                """, (job['id'],))
                conn.commit()
                summary['skipped'] += 1
                continue

            try:
                result = _send_job(job)
                raw_errcode = result.get('errcode')
                errcode = int(raw_errcode) if raw_errcode is not None else -1
                errmsg = str(result.get('errmsg') or '')[:500]
            except Exception as exc:
                errcode = -1
                errmsg = f'{type(exc).__name__}: {exc}'[:500]

            if errcode == 0:
                cursor.execute("""
                    UPDATE notification_subscriptions
                    SET available_count = GREATEST(available_count - 1, 0),
                        sent_count = sent_count + 1, updated_at = NOW()
                    WHERE user_openid = %s AND template_id = %s
                """, (job['recipient_openid'], job['template_id']))
                cursor.execute("""
                    UPDATE notification_jobs SET status = 'sent', sent_at = NOW(), last_error = ''
                    WHERE id = %s
                """, (job['id'],))
                summary['sent'] += 1
                log_status = 'sent'
            elif errcode == 43101:
                cursor.execute("""
                    UPDATE notification_subscriptions
                    SET available_count = 0, last_response = 'expired', updated_at = NOW()
                    WHERE user_openid = %s AND template_id = %s
                """, (job['recipient_openid'], job['template_id']))
                cursor.execute("""
                    UPDATE notification_jobs SET status = 'skipped', last_error = %s WHERE id = %s
                """, (errmsg or '用户未订阅', job['id']))
                summary['skipped'] += 1
                log_status = 'skipped'
            elif int(job.get('attempts') or 0) + 1 < 3 and errcode not in (40037, 41030):
                cursor.execute("""
                    UPDATE notification_jobs
                    SET status = 'retry', next_attempt_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE),
                        last_error = %s WHERE id = %s
                """, (errmsg or str(errcode), job['id']))
                summary['failed'] += 1
                log_status = 'retry'
            else:
                cursor.execute("""
                    UPDATE notification_jobs SET status = 'failed', last_error = %s WHERE id = %s
                """, (errmsg or str(errcode), job['id']))
                summary['failed'] += 1
                log_status = 'failed'

            cursor.execute("""
                INSERT INTO notification_send_logs
                    (job_id, recipient_openid, template_id, status, errcode, errmsg)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                job['id'], job['recipient_openid'], job['template_id'],
                log_status, errcode, errmsg,
            ))
            conn.commit()
        return summary
    except Exception:
        conn.rollback()
        logging.exception('处理订阅消息任务失败')
        return summary
    finally:
        if lock_acquired:
            try:
                cursor.execute("SELECT RELEASE_LOCK('bubuchuhu_notification_worker')")
            except Exception:
                logging.exception('释放订阅消息任务锁失败')
        cursor.close()


def start_notification_worker(app):
    """在容器进程内启动轻量轮询；数据库锁保证多 worker 只发送一次。"""
    global _worker_started
    if os.environ.get('ENABLE_NOTIFICATION_SCHEDULER', '1') != '1':
        logging.info('订阅消息后台任务已禁用')
        return
    with _worker_start_lock:
        if _worker_started:
            return
        _worker_started = True

    interval = max(30, int(os.environ.get('NOTIFICATION_INTERVAL_SECONDS', '60')))

    def run():
        time.sleep(10)
        while True:
            try:
                with app.app_context():
                    process_notification_jobs()
            except Exception:
                logging.exception('订阅消息后台线程异常')
            time.sleep(interval)

    threading.Thread(target=run, name='notification-worker', daemon=True).start()
    logging.info('订阅消息后台任务已启动，间隔 %s 秒', interval)
