"""抽奖 v2：官方活动抽奖、固定概率、多次机会、奖品核销。"""
from datetime import date, datetime
import logging
import secrets

from flask import Blueprint, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from db_utils import get_db
from domain import (
    effective_lottery_status,
    lottery_activity_error,
    pick_lottery_prize,
    probability_percent_to_bps,
    validate_lottery_probabilities,
)
from middleware import check_admin, check_verified_and_blacklist


lottery_bp = Blueprint('lottery', __name__)


def _parse_minute(value):
    try:
        return datetime.strptime(str(value or ''), '%Y-%m-%d %H:%M')
    except (TypeError, ValueError):
        return None


def _format_minute(value):
    return value.strftime('%Y-%m-%d %H:%M') if value else ''


def _close(cursor):
    if cursor:
        cursor.close()


def _mask_openid(openid):
    text = str(openid or '')
    return f'{text[:7]}…{text[-5:]}' if len(text) > 14 else text


def _new_redeem_code():
    token = secrets.token_hex(4).upper()
    return f'BBCH-{token[:4]}-{token[4:]}'


def _prize_view(prize):
    item = dict(prize)
    item['probability'] = round(int(item.pop('probability_bps', 0)) / 100, 2)
    item['valid_until'] = _format_minute(item.get('valid_until'))
    return item


def _redemption_label(status):
    return {0: '待核销', 1: '已核销', 2: '已过期'}.get(int(status or 0), '待核销')


def _expire_redemptions(cursor, lottery_id=None, user_openid=None):
    conditions = ['rd.status = 0', 'p.valid_until IS NOT NULL', 'p.valid_until < NOW()']
    params = []
    if lottery_id:
        conditions.append('r.lottery_id = %s')
        params.append(lottery_id)
    if user_openid:
        conditions.append('r.user_openid = %s')
        params.append(user_openid)
    cursor.execute(f"""
        UPDATE lottery_redemptions rd
        JOIN lottery_records r ON rd.record_id = r.id
        JOIN lottery_prizes p ON r.prize_id = p.id
        SET rd.status = 2
        WHERE {' AND '.join(conditions)}
    """, tuple(params))


def _load_prizes(cursor, lottery_id, include_empty=True):
    stock_filter = '' if include_empty else ' AND remaining > 0'
    cursor.execute(f"""
        SELECT id, tier_name, tier_level, quantity, remaining, probability_bps,
               image_url, claim_instructions, pickup_location, valid_until
        FROM lottery_prizes
        WHERE lottery_id = %s {stock_filter}
        ORDER BY tier_level, id
    """, (lottery_id,))
    return [_prize_view(item) for item in cursor.fetchall()]


# ==================== 管理员接口 ====================
@lottery_bp.route('/admin/lottery/official-activities', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def list_lottery_official_activities():
    """创建抽奖只能引用官方活动；同一活动同一时间只保留一场未结束抽奖。"""
    cursor = None
    try:
        cursor = get_db().cursor()
        cursor.execute("""
            SELECT a.id, a.name, a.activity_time, a.status, a.cover_url, a.is_official
            FROM activities a
            WHERE a.is_official = 1
              AND a.status IN (1, 3, 4)
              AND NOT EXISTS (
                  SELECT 1 FROM activity_lotteries l
                  WHERE l.activity_id = a.id AND l.status <> 2 AND l.end_time >= NOW()
              )
            ORDER BY a.activity_time DESC, a.id DESC
            LIMIT 100
        """)
        return jsonify({'code': 200, 'data': cursor.fetchall()})
    except Exception:
        logging.exception('获取可创建抽奖的官方活动失败')
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/admin/lottery/create', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def create_lottery():
    data = request.get_json(silent=True) or {}
    activity_id = data.get('activity_id')
    lottery_name = str(data.get('lottery_name') or '活动幸运转盘').strip()
    password = str(data.get('password') or '').strip()
    start_time = _parse_minute(data.get('start_time'))
    end_time = _parse_minute(data.get('end_time'))
    prizes = data.get('prizes') or []

    if not activity_id or not lottery_name or not password or not start_time or not end_time or not prizes:
        return jsonify({'code': 400, 'msg': '请完整填写抽奖信息'})
    if len(lottery_name) > 100:
        return jsonify({'code': 400, 'msg': '抽奖名称不能超过100字'})
    if len(password) < 4 or len(password) > 32:
        return jsonify({'code': 400, 'msg': '抽奖口令长度需为4至32位'})
    if end_time <= start_time:
        return jsonify({'code': 400, 'msg': '结束时间必须晚于开始时间'})
    if end_time <= datetime.now():
        return jsonify({'code': 400, 'msg': '抽奖结束时间必须晚于当前时间'})
    if len(prizes) > 12:
        return jsonify({'code': 400, 'msg': '奖项不能超过12项'})

    normalized_prizes = []
    tier_levels = set()
    for index, prize in enumerate(prizes):
        tier_name = str(prize.get('tier_name') or '').strip()
        image_url = str(prize.get('image_url') or '').strip()
        claim_instructions = str(prize.get('claim_instructions') or '').strip()
        pickup_location = str(prize.get('pickup_location') or '').strip()
        valid_until = _parse_minute(prize.get('valid_until'))
        try:
            tier_level = int(prize.get('tier_level') or index + 1)
            quantity = int(prize.get('quantity'))
            probability_bps = probability_percent_to_bps(prize.get('probability'))
        except (TypeError, ValueError) as exc:
            return jsonify({'code': 400, 'msg': str(exc) or '奖品配置格式无效'})

        if not tier_name or len(tier_name) > 100 or tier_level < 1 or quantity < 1:
            return jsonify({'code': 400, 'msg': '奖项名称、等级或库存无效'})
        if tier_level in tier_levels:
            return jsonify({'code': 400, 'msg': '奖项等级不能重复'})
        if not claim_instructions or len(claim_instructions) > 500:
            return jsonify({'code': 400, 'msg': f'{tier_name}请填写500字以内的领奖说明'})
        if len(pickup_location) > 255:
            return jsonify({'code': 400, 'msg': f'{tier_name}领奖地点过长'})
        if not valid_until or valid_until < end_time:
            return jsonify({'code': 400, 'msg': f'{tier_name}领奖有效期不能早于抽奖结束时间'})
        if len(image_url) > 500 or (image_url and not image_url.startswith(('cloud://', 'https://'))):
            return jsonify({'code': 400, 'msg': f'{tier_name}奖品图片地址无效'})
        tier_levels.add(tier_level)
        normalized_prizes.append({
            'tier_name': tier_name,
            'tier_level': tier_level,
            'quantity': quantity,
            'probability_bps': probability_bps,
            'image_url': image_url,
            'claim_instructions': claim_instructions,
            'pickup_location': pickup_location,
            'valid_until': valid_until,
        })

    _, probability_error = validate_lottery_probabilities(normalized_prizes)
    if probability_error:
        return jsonify({'code': 400, 'msg': probability_error})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT id, status, is_official FROM activities WHERE id = %s FOR UPDATE',
            (activity_id,),
        )
        activity = cursor.fetchone()
        activity_error = lottery_activity_error(activity)
        if activity_error:
            conn.rollback()
            return jsonify({'code': 400, 'msg': activity_error})
        cursor.execute("""
            SELECT id FROM activity_lotteries
            WHERE activity_id = %s AND status <> 2 AND end_time >= NOW() FOR UPDATE
        """, (activity_id,))
        if cursor.fetchone():
            conn.rollback()
            return jsonify({'code': 400, 'msg': '该官方活动已有未结束的抽奖'})

        cursor.execute("""
            INSERT INTO activity_lotteries
                (activity_id, lottery_name, password_hash, start_time, end_time, status, created_by)
            VALUES (%s, %s, %s, %s, %s, 0, %s)
        """, (
            activity_id, lottery_name, generate_password_hash(password),
            start_time, end_time, g.openid,
        ))
        lottery_id = cursor.lastrowid
        cursor.executemany("""
            INSERT INTO lottery_prizes
                (lottery_id, tier_name, tier_level, quantity, remaining, probability_bps,
                 image_url, claim_instructions, pickup_location, valid_until)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, [(
            lottery_id, prize['tier_name'], prize['tier_level'], prize['quantity'],
            prize['quantity'], prize['probability_bps'], prize['image_url'],
            prize['claim_instructions'], prize['pickup_location'], prize['valid_until'],
        ) for prize in normalized_prizes])
        conn.commit()
        return jsonify({'code': 200, 'msg': '抽奖已发布', 'data': {'lottery_id': lottery_id}})
    except Exception:
        conn.rollback()
        logging.exception('创建抽奖失败')
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/admin/lottery/list', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def list_lotteries():
    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        _expire_redemptions(cursor)
        conn.commit()
        cursor.execute("""
            SELECT l.id, l.activity_id, l.lottery_name, l.status, l.start_time, l.end_time,
                   l.created_at, a.name AS activity_name,
                   (SELECT COUNT(*) FROM lottery_records r WHERE r.lottery_id = l.id) AS draw_count,
                   (SELECT COUNT(*) FROM lottery_records r WHERE r.lottery_id = l.id AND r.prize_id IS NOT NULL) AS winning_count,
                   (SELECT COUNT(*) FROM lottery_redemptions rd JOIN lottery_records r ON rd.record_id = r.id
                    WHERE r.lottery_id = l.id AND rd.status = 0) AS pending_redeem_count
            FROM activity_lotteries l
            JOIN activities a ON l.activity_id = a.id
            ORDER BY l.created_at DESC, l.id DESC
        """)
        lotteries = cursor.fetchall()
        now = datetime.now()
        for lottery in lotteries:
            lottery['status'] = effective_lottery_status(lottery, now)
            for field in ('start_time', 'end_time', 'created_at'):
                lottery[field] = _format_minute(lottery.get(field))
            lottery['prizes'] = _load_prizes(cursor, lottery['id'])
        return jsonify({'code': 200, 'data': lotteries})
    except Exception:
        logging.exception('获取抽奖列表失败')
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/admin/lottery/records', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def list_lottery_records():
    lottery_id = request.args.get('lottery_id', type=int)
    result_filter = str(request.args.get('result') or 'all')
    redemption_filter = str(request.args.get('redemption_status') or 'all')
    keyword = str(request.args.get('keyword') or '').strip()
    if not lottery_id:
        return jsonify({'code': 400, 'msg': '缺少抽奖ID'})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        _expire_redemptions(cursor, lottery_id=lottery_id)
        conn.commit()
        conditions = ['r.lottery_id = %s']
        params = [lottery_id]
        if result_filter == 'winner':
            conditions.append('r.prize_id IS NOT NULL')
        elif result_filter == 'loser':
            conditions.append('r.prize_id IS NULL')
        if redemption_filter in ('0', '1', '2'):
            conditions.append('rd.status = %s')
            params.append(int(redemption_filter))
        if keyword:
            conditions.append('(u.nickName LIKE %s OR u.wechatId LIKE %s OR r.user_openid LIKE %s OR rd.redeem_code LIKE %s)')
            like = f'%{keyword}%'
            params.extend([like, like, like, like])

        cursor.execute("""
            SELECT l.id, l.lottery_name, a.name AS activity_name
            FROM activity_lotteries l JOIN activities a ON l.activity_id = a.id
            WHERE l.id = %s
        """, (lottery_id,))
        lottery = cursor.fetchone()
        if not lottery:
            return jsonify({'code': 404, 'msg': '抽奖不存在'})
        cursor.execute(f"""
            SELECT r.id, r.user_openid, r.chance_no, r.drawn_at,
                   u.nickName AS nickname, u.avatarUrl AS avatar_url, u.wechatId AS wechat_id,
                   p.tier_name AS prize_name, p.image_url AS prize_image_url,
                   rd.redeem_code, rd.status AS redemption_status, rd.redeemed_at
            FROM lottery_records r
            LEFT JOIN users u ON r.user_openid = u.openId
            LEFT JOIN lottery_prizes p ON r.prize_id = p.id
            LEFT JOIN lottery_redemptions rd ON rd.record_id = r.id
            WHERE {' AND '.join(conditions)}
            ORDER BY r.drawn_at DESC, r.id DESC
            LIMIT 500
        """, tuple(params))
        records = cursor.fetchall()
        for record in records:
            record['drawn_at'] = _format_minute(record.get('drawn_at'))
            record['redeemed_at'] = _format_minute(record.get('redeemed_at'))
            record['display_id'] = _mask_openid(record.pop('user_openid', ''))
            record['nickname'] = record.get('nickname') or '匿名用户'
            record['is_winner'] = bool(record.get('prize_name'))
            record['prize_name'] = record.get('prize_name') or '谢谢参与'
            if record.get('redemption_status') is not None:
                record['redemption_label'] = _redemption_label(record['redemption_status'])
        cursor.execute("""
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN prize_id IS NOT NULL THEN 1 ELSE 0 END) AS winning_count
            FROM lottery_records WHERE lottery_id = %s
        """, (lottery_id,))
        summary = cursor.fetchone() or {}
        return jsonify({'code': 200, 'data': {
            'lottery_id': lottery_id,
            'lottery_name': lottery['lottery_name'],
            'activity_name': lottery['activity_name'],
            'total': int(summary.get('total') or 0),
            'winning_count': int(summary.get('winning_count') or 0),
            'list': records,
        }})
    except Exception:
        logging.exception('获取抽奖记录失败')
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/admin/lottery/participants', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def list_lottery_participants():
    lottery_id = request.args.get('lottery_id', type=int)
    keyword = str(request.args.get('keyword') or '').strip()
    if not lottery_id:
        return jsonify({'code': 400, 'msg': '缺少抽奖ID'})
    cursor = None
    try:
        cursor = get_db().cursor()
        conditions = ['l.id = %s', 'ap.status = 1']
        params = [lottery_id]
        if keyword:
            conditions.append('(u.nickName LIKE %s OR u.wechatId LIKE %s OR ap.user_openid LIKE %s)')
            like = f'%{keyword}%'
            params.extend([like, like, like])
        cursor.execute(f"""
            SELECT ap.user_openid, u.nickName AS nickname, u.avatarUrl AS avatar_url,
                   u.wechatId AS wechat_id,
                   COALESCE(s.chances_total, 1) AS chances_total,
                   COALESCE(s.chances_used, 0) AS chances_used
            FROM activity_lotteries l
            JOIN activity_participants ap ON ap.activity_id = l.activity_id
            LEFT JOIN users u ON ap.user_openid = u.openId
            LEFT JOIN lottery_user_states s
              ON s.lottery_id = l.id AND s.user_openid = ap.user_openid
            WHERE {' AND '.join(conditions)}
            ORDER BY ap.id DESC
            LIMIT 200
        """, tuple(params))
        users = cursor.fetchall()
        for user in users:
            user['openid'] = user['user_openid']
            user['display_id'] = _mask_openid(user.pop('user_openid', ''))
            user['nickname'] = user.get('nickname') or '匿名用户'
            user['chances_remaining'] = max(0, int(user['chances_total']) - int(user['chances_used']))
        return jsonify({'code': 200, 'data': users})
    except Exception:
        logging.exception('获取抽奖参与用户失败')
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/admin/lottery/grant-chance', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def grant_lottery_chance():
    data = request.get_json(silent=True) or {}
    lottery_id = data.get('lottery_id')
    user_openid = str(data.get('user_openid') or '').strip()
    reason = str(data.get('reason') or '管理员追加').strip()[:255]
    try:
        quantity = int(data.get('quantity') or 1)
    except (TypeError, ValueError):
        quantity = 0
    if not lottery_id or not user_openid or quantity < 1 or quantity > 10:
        return jsonify({'code': 400, 'msg': '单次只能追加1至10次机会'})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 1 FROM activity_lotteries l
            JOIN activity_participants ap ON ap.activity_id = l.activity_id
            WHERE l.id = %s AND ap.user_openid = %s AND ap.status = 1
        """, (lottery_id, user_openid))
        if not cursor.fetchone():
            conn.rollback()
            return jsonify({'code': 400, 'msg': '该用户没有报名此活动'})
        cursor.execute("""
            INSERT INTO lottery_user_states
                (lottery_id, user_openid, chances_total, chances_used)
            VALUES (%s, %s, %s, 0)
            ON DUPLICATE KEY UPDATE chances_total = chances_total + %s
        """, (lottery_id, user_openid, 1 + quantity, quantity))
        cursor.execute("""
            INSERT INTO lottery_chance_grants
                (lottery_id, user_openid, quantity, reason, created_by)
            VALUES (%s, %s, %s, %s, %s)
        """, (lottery_id, user_openid, quantity, reason, g.openid))
        cursor.execute("""
            SELECT chances_total, chances_used
            FROM lottery_user_states WHERE lottery_id = %s AND user_openid = %s
        """, (lottery_id, user_openid))
        state = cursor.fetchone()
        conn.commit()
        state['chances_remaining'] = max(0, state['chances_total'] - state['chances_used'])
        return jsonify({'code': 200, 'msg': '抽奖机会已追加', 'data': state})
    except Exception:
        conn.rollback()
        logging.exception('追加抽奖机会失败')
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/admin/lottery/redeem', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def redeem_lottery_prize():
    data = request.get_json(silent=True) or {}
    redeem_code = str(data.get('redeem_code') or '').strip().upper()
    if not redeem_code:
        return jsonify({'code': 400, 'msg': '请输入核销码'})
    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT rd.id, rd.status, rd.redeem_code,
                   p.tier_name AS prize_name, p.valid_until,
                   a.name AS activity_name, u.nickName AS nickname
            FROM lottery_redemptions rd
            JOIN lottery_records r ON rd.record_id = r.id
            JOIN lottery_prizes p ON r.prize_id = p.id
            JOIN activity_lotteries l ON r.lottery_id = l.id
            JOIN activities a ON l.activity_id = a.id
            LEFT JOIN users u ON r.user_openid = u.openId
            WHERE rd.redeem_code = %s FOR UPDATE
        """, (redeem_code,))
        redemption = cursor.fetchone()
        if not redemption:
            conn.rollback()
            return jsonify({'code': 404, 'msg': '核销码不存在'})
        if int(redemption['status']) == 1:
            conn.rollback()
            return jsonify({'code': 400, 'msg': '该奖品已经核销'})
        if int(redemption['status']) == 2 or (
            redemption.get('valid_until') and redemption['valid_until'] < datetime.now()
        ):
            cursor.execute('UPDATE lottery_redemptions SET status = 2 WHERE id = %s', (redemption['id'],))
            conn.commit()
            return jsonify({'code': 400, 'msg': '该奖品已过期'})
        cursor.execute("""
            UPDATE lottery_redemptions
            SET status = 1, redeemed_by = %s, redeemed_at = NOW()
            WHERE id = %s AND status = 0
        """, (g.openid, redemption['id']))
        conn.commit()
        return jsonify({'code': 200, 'msg': '核销成功', 'data': {
            'prize_name': redemption['prize_name'],
            'activity_name': redemption['activity_name'],
            'nickname': redemption.get('nickname') or '匿名用户',
        }})
    except Exception:
        conn.rollback()
        logging.exception('核销奖品失败')
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/admin/lottery/end', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def end_lottery():
    lottery_id = (request.get_json(silent=True) or {}).get('lottery_id')
    if not lottery_id:
        return jsonify({'code': 400, 'msg': '缺少抽奖ID'})
    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE activity_lotteries SET status = 2 WHERE id = %s AND status <> 2',
            (lottery_id,),
        )
        if cursor.rowcount == 0:
            conn.rollback()
            return jsonify({'code': 400, 'msg': '抽奖不存在或已结束'})
        conn.commit()
        return jsonify({'code': 200, 'msg': '抽奖已结束'})
    except Exception:
        conn.rollback()
        logging.exception('结束抽奖失败')
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


# ==================== 用户接口 ====================
def _activity_lottery_payload(cursor, lottery, user_openid):
    cursor.execute("""
        SELECT 1 FROM activity_participants
        WHERE activity_id = %s AND user_openid = %s AND status = 1
    """, (lottery['activity_id'], user_openid))
    eligible = bool(cursor.fetchone())
    cursor.execute("""
        SELECT password_attempts, attempts_date, chances_total, chances_used
        FROM lottery_user_states
        WHERE lottery_id = %s AND user_openid = %s
    """, (lottery['id'], user_openid))
    state = cursor.fetchone() or {
        'password_attempts': 0, 'attempts_date': None, 'chances_total': 1, 'chances_used': 0,
    }
    password_attempts = int(state['password_attempts'] or 0) if state.get('attempts_date') == date.today() else 0
    now = datetime.now()
    status = effective_lottery_status(lottery, now)
    phase = 'ended' if status == 2 else ('not_started' if now < lottery['start_time'] else 'active')
    chances_remaining = max(0, int(state['chances_total']) - int(state['chances_used']))
    payload = {
        'id': lottery['id'],
        'activity_id': lottery['activity_id'],
        'activity_name': lottery['activity_name'],
        'lottery_name': lottery['lottery_name'],
        'start_time': _format_minute(lottery['start_time']),
        'end_time': _format_minute(lottery['end_time']),
        'phase': phase,
        'eligible': eligible,
        'chances_total': int(state['chances_total']),
        'chances_used': int(state['chances_used']),
        'chances_remaining': chances_remaining,
        'remaining_attempts': max(0, 3 - password_attempts),
        'prizes': _load_prizes(cursor, lottery['id']),
    }
    cursor.execute("""
        SELECT COUNT(*) AS c FROM lottery_records
        WHERE lottery_id = %s AND user_openid = %s AND prize_id IS NOT NULL
    """, (lottery['id'], user_openid))
    payload['my_prize_count'] = int(cursor.fetchone()['c'] or 0)
    payload['can_draw'] = bool(
        eligible and phase == 'active' and chances_remaining > 0 and payload['remaining_attempts'] > 0
    )
    return payload


@lottery_bp.route('/lottery/activity-status', methods=['GET'])
@check_verified_and_blacklist
def activity_lottery_status():
    activity_id = request.args.get('activity_id', type=int)
    if not activity_id:
        return jsonify({'code': 400, 'msg': '缺少活动ID'})
    cursor = None
    try:
        cursor = get_db().cursor()
        cursor.execute("""
            SELECT l.*, a.name AS activity_name
            FROM activity_lotteries l JOIN activities a ON l.activity_id = a.id
            WHERE l.activity_id = %s ORDER BY l.id DESC LIMIT 1
        """, (activity_id,))
        lottery = cursor.fetchone()
        if not lottery:
            return jsonify({'code': 200, 'data': None})
        return jsonify({'code': 200, 'data': _activity_lottery_payload(cursor, lottery, g.openid)})
    except Exception:
        logging.exception('获取活动抽奖状态失败')
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/lottery/check', methods=['POST'])
@check_verified_and_blacklist
def check_lottery():
    """兼容首页主动提醒，只返回当前可参与且仍有机会的抽奖。"""
    cursor = None
    try:
        cursor = get_db().cursor()
        cursor.execute("""
            SELECT l.*, a.name AS activity_name
            FROM activity_lotteries l JOIN activities a ON l.activity_id = a.id
            WHERE l.status <> 2 AND NOW() BETWEEN l.start_time AND l.end_time
              AND EXISTS (
                  SELECT 1 FROM activity_participants p
                  WHERE p.activity_id = l.activity_id AND p.user_openid = %s AND p.status = 1
              )
            ORDER BY l.end_time, l.id
        """, (g.openid,))
        result = []
        for lottery in cursor.fetchall():
            payload = _activity_lottery_payload(cursor, lottery, g.openid)
            if payload['can_draw']:
                result.append(payload)
        return jsonify({'code': 200, 'data': result})
    except Exception:
        logging.exception('检查抽奖失败')
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
        return jsonify({'code': 400, 'msg': '请输入抽奖口令'})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT l.*, a.name AS activity_name
            FROM activity_lotteries l JOIN activities a ON l.activity_id = a.id
            WHERE l.id = %s AND l.status <> 2 AND NOW() BETWEEN l.start_time AND l.end_time
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
            return jsonify({'code': 403, 'msg': '只有已报名用户可以参与抽奖'})

        cursor.execute("""
            INSERT IGNORE INTO lottery_user_states
                (lottery_id, user_openid, chances_total, chances_used)
            VALUES (%s, %s, 1, 0)
        """, (lottery_id, g.openid))
        cursor.execute("""
            SELECT * FROM lottery_user_states
            WHERE lottery_id = %s AND user_openid = %s FOR UPDATE
        """, (lottery_id, g.openid))
        state = cursor.fetchone()
        attempts = int(state['password_attempts'] or 0) if state.get('attempts_date') == date.today() else 0
        if state.get('attempts_date') != date.today():
            cursor.execute("""
                UPDATE lottery_user_states SET password_attempts = 0, attempts_date = CURDATE()
                WHERE id = %s
            """, (state['id'],))
        if attempts >= 3:
            conn.rollback()
            return jsonify({'code': 403, 'msg': '今天的口令尝试次数已用完', 'remaining_attempts': 0})
        if int(state['chances_used']) >= int(state['chances_total']):
            conn.rollback()
            return jsonify({'code': 400, 'msg': '本次抽奖机会已用完', 'no_chance': True})

        try:
            password_ok = check_password_hash(lottery['password_hash'], password)
        except (TypeError, ValueError):
            password_ok = False
        if not password_ok:
            cursor.execute("""
                UPDATE lottery_user_states
                SET password_attempts = password_attempts + 1, attempts_date = CURDATE()
                WHERE id = %s
            """, (state['id'],))
            conn.commit()
            remaining_attempts = max(0, 2 - attempts)
            return jsonify({
                'code': 400,
                'msg': f'口令错误，今天还可尝试{remaining_attempts}次',
                'remaining_attempts': remaining_attempts,
            })

        cursor.execute("""
            SELECT id, tier_name, tier_level, quantity, remaining, probability_bps,
                   image_url, claim_instructions, pickup_location, valid_until
            FROM lottery_prizes WHERE lottery_id = %s
            ORDER BY tier_level, id FOR UPDATE
        """, (lottery_id,))
        prizes = cursor.fetchall()
        won_prize = pick_lottery_prize(prizes, secrets.randbelow(10000) + 1)
        if won_prize:
            cursor.execute("""
                UPDATE lottery_prizes SET remaining = remaining - 1
                WHERE id = %s AND remaining > 0
            """, (won_prize['id'],))
            if cursor.rowcount != 1:
                raise RuntimeError('奖品库存并发扣减失败')

        chance_no = int(state['chances_used']) + 1
        cursor.execute("""
            INSERT INTO lottery_records (lottery_id, user_openid, prize_id, chance_no)
            VALUES (%s, %s, %s, %s)
        """, (lottery_id, g.openid, won_prize['id'] if won_prize else None, chance_no))
        record_id = cursor.lastrowid
        cursor.execute(
            'UPDATE lottery_user_states SET chances_used = chances_used + 1 WHERE id = %s',
            (state['id'],),
        )

        redeem_code = ''
        if won_prize:
            for _ in range(3):
                redeem_code = _new_redeem_code()
                try:
                    cursor.execute("""
                        INSERT INTO lottery_redemptions (record_id, redeem_code)
                        VALUES (%s, %s)
                    """, (record_id, redeem_code))
                    break
                except Exception as exc:
                    if getattr(exc, 'args', [None])[0] != 1062:
                        raise
            else:
                raise RuntimeError('生成唯一核销码失败')

        conn.commit()
        chances_remaining = int(state['chances_total']) - chance_no
        return jsonify({'code': 200, 'data': {
            'record_id': record_id,
            'lottery_id': lottery_id,
            'lottery_name': lottery['lottery_name'],
            'activity_name': lottery['activity_name'],
            'prize_id': won_prize['id'] if won_prize else None,
            'prize_name': won_prize['tier_name'] if won_prize else '谢谢参与',
            'prize_image_url': won_prize['image_url'] if won_prize else '',
            'claim_instructions': won_prize['claim_instructions'] if won_prize else '',
            'pickup_location': won_prize['pickup_location'] if won_prize else '',
            'valid_until': _format_minute(won_prize.get('valid_until')) if won_prize else '',
            'redeem_code': redeem_code,
            'chances_remaining': max(0, chances_remaining),
        }})
    except Exception:
        conn.rollback()
        logging.exception('抽奖失败')
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/lottery/my-prizes', methods=['GET'])
@check_verified_and_blacklist
def my_lottery_prizes():
    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        _expire_redemptions(cursor, user_openid=g.openid)
        conn.commit()
        cursor.execute("""
            SELECT r.id AS record_id, r.drawn_at, l.id AS lottery_id, l.lottery_name,
                   a.id AS activity_id, a.name AS activity_name,
                   p.tier_name AS prize_name, p.image_url AS prize_image_url,
                   p.claim_instructions, p.pickup_location, p.valid_until,
                   rd.redeem_code, rd.status AS redemption_status, rd.redeemed_at
            FROM lottery_records r
            JOIN lottery_prizes p ON r.prize_id = p.id
            JOIN lottery_redemptions rd ON rd.record_id = r.id
            JOIN activity_lotteries l ON r.lottery_id = l.id
            JOIN activities a ON l.activity_id = a.id
            WHERE r.user_openid = %s
            ORDER BY r.drawn_at DESC, r.id DESC
        """, (g.openid,))
        prizes = cursor.fetchall()
        for prize in prizes:
            for field in ('drawn_at', 'valid_until', 'redeemed_at'):
                prize[field] = _format_minute(prize.get(field))
            prize['redemption_label'] = _redemption_label(prize['redemption_status'])
        return jsonify({'code': 200, 'data': prizes})
    except Exception:
        logging.exception('获取我的奖品失败')
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)


@lottery_bp.route('/lottery/my-result', methods=['GET'])
@check_verified_and_blacklist
def my_lottery_result():
    lottery_id = request.args.get('lottery_id', type=int)
    cursor = None
    try:
        cursor = get_db().cursor()
        conditions = ['r.user_openid = %s']
        params = [g.openid]
        if lottery_id:
            conditions.append('r.lottery_id = %s')
            params.append(lottery_id)
        cursor.execute(f"""
            SELECT r.id, r.lottery_id, r.prize_id, r.chance_no, r.drawn_at,
                   p.tier_name AS prize_name, p.image_url AS prize_image_url,
                   a.id AS activity_id, a.name AS activity_name,
                   rd.redeem_code, rd.status AS redemption_status
            FROM lottery_records r
            JOIN activity_lotteries l ON r.lottery_id = l.id
            JOIN activities a ON l.activity_id = a.id
            LEFT JOIN lottery_prizes p ON r.prize_id = p.id
            LEFT JOIN lottery_redemptions rd ON rd.record_id = r.id
            WHERE {' AND '.join(conditions)}
            ORDER BY r.drawn_at DESC, r.id DESC
        """, tuple(params))
        records = cursor.fetchall()
        for record in records:
            record['drawn_at'] = _format_minute(record.get('drawn_at'))
            record['prize_name'] = record.get('prize_name') or '谢谢参与'
        return jsonify({'code': 200, 'data': records})
    except Exception:
        logging.exception('获取抽奖结果失败')
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        _close(cursor)
