"""活动抽奖接口：按时间开放、口令哈希存储，并发安全地扣减奖品库存。"""
from datetime import datetime
import hashlib
import hmac
import logging
import random

from flask import Blueprint, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from db_utils import get_db
from domain import effective_lottery_status, lottery_activity_error
from middleware import check_admin, check_verified_and_blacklist


lottery_bp = Blueprint('lottery', __name__)
_secure_random = random.SystemRandom()


def _parse_minute(value):
    try:
        return datetime.strptime(value, '%Y-%m-%d %H:%M')
    except (TypeError, ValueError):
        return None


def _password_matches(stored_hash, password):
    """支持迁移前的短暂明文数据，并在成功验证后由调用方升级。"""
    if not stored_hash:
        return False, False
    if str(stored_hash).startswith('sha256$'):
        digest = hashlib.sha256(password.encode('utf-8')).hexdigest()
        return hmac.compare_digest(str(stored_hash)[7:], digest), True
    if ':' not in str(stored_hash) or '$' not in str(stored_hash):
        return hmac.compare_digest(str(stored_hash), password), True
    try:
        return check_password_hash(stored_hash, password), False
    except (ValueError, TypeError):
        return hmac.compare_digest(str(stored_hash), password), True


def _close(cursor):
    if cursor:
        cursor.close()


# ==================== 管理员接口 ====================
@lottery_bp.route('/admin/lottery/official-activities', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def list_lottery_official_activities():
    """返回尚无进行中抽奖的官方活动，供创建抽奖时选择。"""
    cursor = None
    try:
        cursor = get_db().cursor()
        cursor.execute("""
            SELECT a.id, a.name, a.activity_time, a.status, a.cover_url, a.is_official
            FROM activities a
            WHERE a.is_official = 1
              AND a.status IN (1, 3, 4)
              AND NOT EXISTS (
                  SELECT 1
                  FROM activity_lotteries l
                  WHERE l.activity_id = a.id
                    AND l.status <> 2
                    AND l.end_time >= NOW()
              )
            ORDER BY a.activity_time DESC, a.id DESC
            LIMIT 100
        """)
        return jsonify({'code': 200, 'data': cursor.fetchall()})
    except Exception:
        logging.exception("获取可创建抽奖的官方活动失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/admin/lottery/create', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def create_lottery():
    data = request.get_json(silent=True) or {}
    activity_id = data.get('activity_id')
    password = str(data.get('password') or '').strip()
    start_time = _parse_minute(data.get('start_time'))
    end_time = _parse_minute(data.get('end_time'))
    prizes = data.get('prizes') or []

    if not activity_id or not password or not start_time or not end_time or not prizes:
        return jsonify({'code': 400, 'msg': '参数不完整'})
    if len(password) < 4 or len(password) > 32:
        return jsonify({'code': 400, 'msg': '抽奖口令长度需为4至32位'})
    if end_time <= start_time:
        return jsonify({'code': 400, 'msg': '结束时间必须晚于开始时间'})
    if end_time <= datetime.now():
        return jsonify({'code': 400, 'msg': '抽奖结束时间必须晚于当前时间'})
    if len(prizes) > 20:
        return jsonify({'code': 400, 'msg': '奖项不能超过20项'})

    normalized_prizes = []
    tier_levels = set()
    for prize in prizes:
        tier_name = str(prize.get('tier_name') or '').strip()
        image_url = str(prize.get('image_url') or '').strip()
        try:
            tier_level = int(prize.get('tier_level'))
            quantity = int(prize.get('quantity'))
        except (TypeError, ValueError):
            return jsonify({'code': 400, 'msg': '奖项等级和数量必须是整数'})
        if not tier_name or len(tier_name) > 100 or tier_level < 1 or quantity < 1:
            return jsonify({'code': 400, 'msg': '奖项名称、等级或数量无效'})
        if len(image_url) > 500 or (image_url and not image_url.startswith(('cloud://', 'https://'))):
            return jsonify({'code': 400, 'msg': '奖品图片地址无效'})
        if tier_level in tier_levels:
            return jsonify({'code': 400, 'msg': '奖项等级不能重复'})
        tier_levels.add(tier_level)
        normalized_prizes.append((tier_name, tier_level, quantity, image_url))

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, status, is_official FROM activities WHERE id = %s FOR UPDATE",
            (activity_id,)
        )
        activity = cursor.fetchone()
        if not activity:
            return jsonify({'code': 404, 'msg': '活动不存在'})
        activity_error = lottery_activity_error(activity)
        if activity_error:
            return jsonify({'code': 400, 'msg': activity_error})

        cursor.execute(
            "SELECT id FROM activity_lotteries "
            "WHERE activity_id = %s AND status <> 2 AND end_time >= NOW() FOR UPDATE",
            (activity_id,)
        )
        if cursor.fetchone():
            return jsonify({'code': 400, 'msg': '该活动已有未结束的抽奖'})

        cursor.execute("""
            INSERT INTO activity_lotteries
                (activity_id, password_hash, start_time, end_time, status, created_by, created_at)
            VALUES (%s, %s, %s, %s, 0, %s, NOW())
        """, (activity_id, generate_password_hash(password), start_time, end_time, g.openid))
        lottery_id = cursor.lastrowid

        cursor.executemany("""
            INSERT INTO lottery_prizes
                (lottery_id, tier_name, tier_level, quantity, remaining, image_url)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, [
            (lottery_id, name, level, quantity, quantity, image_url)
            for name, level, quantity, image_url in normalized_prizes
        ])
        conn.commit()
        return jsonify({'code': 200, 'msg': '抽奖已创建', 'data': {'lottery_id': lottery_id}})
    except Exception:
        conn.rollback()
        logging.exception("创建抽奖失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/admin/lottery/list', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def list_lotteries():
    cursor = None
    try:
        cursor = get_db().cursor()
        cursor.execute("""
            SELECT l.id, l.activity_id, l.status, l.start_time, l.end_time, l.created_at,
                   a.name AS activity_name
            FROM activity_lotteries l
            JOIN activities a ON l.activity_id = a.id
            ORDER BY l.created_at DESC
        """)
        lotteries = cursor.fetchall()
        now = datetime.now()
        for lottery in lotteries:
            lottery['status'] = effective_lottery_status(lottery, now)
            for field in ('start_time', 'end_time', 'created_at'):
                if lottery.get(field):
                    lottery[field] = lottery[field].strftime('%Y-%m-%d %H:%M')
            cursor.execute(
                "SELECT id, tier_name, tier_level, quantity, remaining, image_url "
                "FROM lottery_prizes WHERE lottery_id = %s ORDER BY tier_level",
                (lottery['id'],)
            )
            lottery['prizes'] = cursor.fetchall()
            cursor.execute(
                "SELECT COUNT(*) AS c FROM lottery_records "
                "WHERE lottery_id = %s AND draw_status = 1",
                (lottery['id'],)
            )
            lottery['draw_count'] = cursor.fetchone()['c']
        return jsonify({'code': 200, 'data': lotteries})
    except Exception:
        logging.exception("获取抽奖列表失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/admin/lottery/end', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def end_lottery():
    data = request.get_json(silent=True) or {}
    lottery_id = data.get('lottery_id')
    if not lottery_id:
        return jsonify({'code': 400, 'msg': '缺少抽奖ID'})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE activity_lotteries SET status = 2 WHERE id = %s AND status <> 2",
            (lottery_id,)
        )
        if cursor.rowcount == 0:
            conn.rollback()
            return jsonify({'code': 400, 'msg': '抽奖不存在或已结束'})
        conn.commit()
        return jsonify({'code': 200, 'msg': '抽奖已结束'})
    except Exception:
        conn.rollback()
        logging.exception("结束抽奖失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


# ==================== 用户接口 ====================
@lottery_bp.route('/lottery/check', methods=['POST'])
@check_verified_and_blacklist
def check_lottery():
    cursor = None
    try:
        cursor = get_db().cursor()
        cursor.execute("""
            SELECT l.id, l.activity_id, l.start_time, l.end_time, a.name AS activity_name,
                   COALESCE(r.password_attempts, 0) AS password_attempts
            FROM activity_lotteries l
            JOIN activities a ON l.activity_id = a.id
            LEFT JOIN lottery_records r
                ON r.lottery_id = l.id AND r.user_openid = %s
            WHERE l.status <> 2
              AND NOW() BETWEEN l.start_time AND l.end_time
              AND EXISTS (
                  SELECT 1 FROM activity_participants p
                  WHERE p.activity_id = l.activity_id
                    AND p.user_openid = %s AND p.status = 1
              )
              AND (r.id IS NULL OR r.draw_status = 0)
        """, (g.openid, g.openid))
        lotteries = cursor.fetchall()
        result = []
        for lottery in lotteries:
            if lottery['password_attempts'] >= 3:
                continue
            for field in ('start_time', 'end_time'):
                lottery[field] = lottery[field].strftime('%Y-%m-%d %H:%M')
            cursor.execute(
                "SELECT id, tier_name, tier_level, quantity, remaining, image_url "
                "FROM lottery_prizes WHERE lottery_id = %s ORDER BY tier_level",
                (lottery['id'],)
            )
            lottery['prizes'] = cursor.fetchall()
            lottery['remaining_attempts'] = 3 - lottery.pop('password_attempts')
            result.append(lottery)
        return jsonify({'code': 200, 'data': result})
    except Exception:
        logging.exception("检查抽奖失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/lottery/draw', methods=['POST'])
@check_verified_and_blacklist
def draw_lottery():
    data = request.get_json(silent=True) or {}
    lottery_id = data.get('lottery_id')
    password = str(data.get('password') or '')
    if not lottery_id or not password:
        return jsonify({'code': 400, 'msg': '缺少抽奖ID或口令'})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        # 主表行锁把同一场抽奖的资格判断、口令验证和库存扣减串成一个事务。
        cursor.execute("""
            SELECT l.*, a.name AS activity_name
            FROM activity_lotteries l
            JOIN activities a ON l.activity_id = a.id
            WHERE l.id = %s AND l.status <> 2
              AND NOW() BETWEEN l.start_time AND l.end_time
            FOR UPDATE
        """, (lottery_id,))
        lottery = cursor.fetchone()
        if not lottery:
            conn.rollback()
            return jsonify({'code': 400, 'msg': '抽奖未开始、不存在或已结束'})

        cursor.execute("""
            SELECT 1 FROM activity_participants
            WHERE activity_id = %s AND user_openid = %s AND status = 1
        """, (lottery['activity_id'], g.openid))
        if not cursor.fetchone():
            conn.rollback()
            return jsonify({'code': 403, 'msg': '您没有参与该活动，无资格抽奖'})

        cursor.execute("""
            SELECT id, prize_id, password_attempts, draw_status
            FROM lottery_records
            WHERE lottery_id = %s AND user_openid = %s
            FOR UPDATE
        """, (lottery_id, g.openid))
        record = cursor.fetchone()
        if record and record['draw_status'] == 1:
            conn.rollback()
            return jsonify({'code': 400, 'msg': '您已参与过此抽奖', 'already_drawn': True})

        attempts = record['password_attempts'] if record else 0
        if attempts >= 3:
            conn.rollback()
            return jsonify({
                'code': 403,
                'msg': '口令错误次数已达上限，无法抽奖',
                'remaining_attempts': 0,
            })

        password_ok, is_legacy_plaintext = _password_matches(lottery['password_hash'], password)
        if not password_ok:
            if record:
                cursor.execute(
                    "UPDATE lottery_records SET password_attempts = password_attempts + 1 WHERE id = %s",
                    (record['id'],)
                )
            else:
                cursor.execute("""
                    INSERT INTO lottery_records
                        (lottery_id, user_openid, prize_id, password_attempts, draw_status)
                    VALUES (%s, %s, NULL, 1, 0)
                """, (lottery_id, g.openid))
            conn.commit()
            remaining = 3 - attempts - 1
            return jsonify({
                'code': 400,
                'msg': f'口令错误，还剩{remaining}次机会',
                'remaining_attempts': remaining,
            })

        if is_legacy_plaintext:
            cursor.execute(
                "UPDATE activity_lotteries SET password_hash = %s WHERE id = %s",
                (generate_password_hash(password), lottery_id)
            )

        cursor.execute("""
            SELECT id, tier_name, tier_level, remaining, image_url
            FROM lottery_prizes
            WHERE lottery_id = %s AND remaining > 0 AND tier_level <> 99
            ORDER BY tier_level
            FOR UPDATE
        """, (lottery_id,))
        prizes = cursor.fetchall()

        won_prize = None
        total_remaining = sum(prize['remaining'] for prize in prizes)
        if prizes and _secure_random.random() < min(total_remaining / (total_remaining + 5), 0.7):
            ticket = _secure_random.randint(1, total_remaining)
            for prize in prizes:
                ticket -= prize['remaining']
                if ticket <= 0:
                    won_prize = prize
                    break

        prize_id = won_prize['id'] if won_prize else None
        prize_name = won_prize['tier_name'] if won_prize else '谢谢参与'
        prize_image_url = won_prize.get('image_url') if won_prize else ''
        if won_prize:
            cursor.execute(
                "UPDATE lottery_prizes SET remaining = remaining - 1 "
                "WHERE id = %s AND remaining > 0",
                (prize_id,)
            )
            if cursor.rowcount != 1:
                raise RuntimeError('奖品库存并发扣减失败')

        if record:
            cursor.execute("""
                UPDATE lottery_records
                SET prize_id = %s, draw_status = 1, drawn_at = NOW()
                WHERE id = %s AND draw_status = 0
            """, (prize_id, record['id']))
        else:
            cursor.execute("""
                INSERT INTO lottery_records
                    (lottery_id, user_openid, prize_id, password_attempts, draw_status, drawn_at)
                VALUES (%s, %s, %s, 0, 1, NOW())
            """, (lottery_id, g.openid, prize_id))
        conn.commit()

        return jsonify({'code': 200, 'data': {
            'prize_name': prize_name,
            'prize_image_url': prize_image_url,
            'prize_id': prize_id,
            'activity_name': lottery['activity_name'],
            'lottery_id': lottery_id,
        }})
    except Exception:
        conn.rollback()
        logging.exception("抽奖失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/lottery/my-result', methods=['GET'])
@check_verified_and_blacklist
def my_lottery_result():
    lottery_id = request.args.get('lottery_id')
    cursor = None
    try:
        cursor = get_db().cursor()
        params = [g.openid]
        lottery_filter = ''
        if lottery_id:
            lottery_filter = ' AND r.lottery_id = %s'
            params.append(lottery_id)
        cursor.execute(f"""
            SELECT r.id, r.lottery_id, r.prize_id, r.password_attempts, r.drawn_at,
                   p.tier_name AS prize_name, p.image_url AS prize_image_url,
                   a.name AS activity_name
            FROM lottery_records r
            JOIN activity_lotteries l ON r.lottery_id = l.id
            JOIN activities a ON l.activity_id = a.id
            LEFT JOIN lottery_prizes p ON r.prize_id = p.id
            WHERE r.user_openid = %s AND r.draw_status = 1 {lottery_filter}
            ORDER BY r.drawn_at DESC
        """, tuple(params))
        records = cursor.fetchall()
        for record in records:
            if record.get('drawn_at'):
                record['drawn_at'] = record['drawn_at'].strftime('%Y-%m-%d %H:%M')
            if not record.get('prize_name'):
                record['prize_name'] = '谢谢参与'
        return jsonify({'code': 200, 'data': records})
    except Exception:
        logging.exception("获取抽奖结果失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)
