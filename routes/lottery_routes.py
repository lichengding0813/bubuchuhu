from flask import Blueprint, request, jsonify
from datetime import datetime
import logging
import random
from db_utils import get_db
from middleware import check_verified_and_blacklist, check_admin

lottery_bp = Blueprint('lottery', __name__)


# ==================== 管理员：创建抽奖 ====================
@lottery_bp.route('/admin/lottery/create', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def create_lottery():
    data = request.get_json()
    activity_id = data.get('activity_id')
    password = data.get('password', '')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    prizes = data.get('prizes', [])
    openid = request.headers.get('X-Wx-OpenId')

    if not activity_id or not password or not start_time or not end_time or not prizes:
        return jsonify({'code': 400, 'msg': '参数不完整'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM activities WHERE id = %s", (activity_id,))
        if not cursor.fetchone():
            return jsonify({'code': 404, 'msg': '活动不存在'})

        cursor.execute("SELECT id FROM activity_lotteries WHERE activity_id = %s AND status IN (0,1)", (activity_id,))
        if cursor.fetchone():
            return jsonify({'code': 400, 'msg': '该活动已有进行中的抽奖'})

        now = datetime.now()
        st = datetime.strptime(start_time, '%Y-%m-%d %H:%M')
        et = datetime.strptime(end_time, '%Y-%m-%d %H:%M')
        status = 1 if st <= now <= et else 0

        cursor.execute("""
            INSERT INTO activity_lotteries (activity_id, password, start_time, end_time, status, created_by, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
        """, (activity_id, password, st, et, status, openid))
        lottery_id = cursor.lastrowid

        for p in prizes:
            cursor.execute("""
                INSERT INTO lottery_prizes (lottery_id, tier_name, tier_level, quantity, remaining)
                VALUES (%s, %s, %s, %s, %s)
            """, (lottery_id, p.get('tier_name', ''), p.get('tier_level', 99), p.get('quantity', 0), p.get('quantity', 0)))

        cursor.execute("""
            INSERT INTO lottery_prizes (lottery_id, tier_name, tier_level, quantity, remaining)
            VALUES (%s, '谢谢参与', 99, 99999, 99999)
        """, (lottery_id,))

        conn.commit()
        return jsonify({'code': 200, 'msg': '抽奖已创建', 'data': {'lottery_id': lottery_id}})
    except Exception:
        logging.exception("创建抽奖失败")
        if conn: conn.rollback()
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ==================== 管理员：抽奖列表 ====================
@lottery_bp.route('/admin/lottery/list', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def list_lotteries():
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT l.id, l.activity_id, l.status, l.start_time, l.end_time, l.created_at,
                   a.name as activity_name
            FROM activity_lotteries l
            JOIN activities a ON l.activity_id = a.id
            ORDER BY l.created_at DESC
        """)
        lotteries = cursor.fetchall()
        for lot in lotteries:
            if lot.get('start_time'):
                lot['start_time'] = lot['start_time'].strftime('%Y-%m-%d %H:%M')
            if lot.get('end_time'):
                lot['end_time'] = lot['end_time'].strftime('%Y-%m-%d %H:%M')
            if lot.get('created_at'):
                lot['created_at'] = lot['created_at'].strftime('%Y-%m-%d %H:%M')
            cursor.execute("SELECT * FROM lottery_prizes WHERE lottery_id = %s ORDER BY tier_level", (lot['id'],))
            lot['prizes'] = cursor.fetchall()
            cursor.execute("SELECT COUNT(*) as c FROM lottery_records WHERE lottery_id = %s", (lot['id'],))
            lot['draw_count'] = cursor.fetchone()['c']
        return jsonify({'code': 200, 'data': lotteries})
    except Exception:
        logging.exception("获取抽奖列表失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ==================== 管理员：结束抽奖 ====================
@lottery_bp.route('/admin/lottery/end', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def end_lottery():
    data = request.get_json()
    lottery_id = data.get('lottery_id')
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("UPDATE activity_lotteries SET status = 2 WHERE id = %s AND status IN (0,1)", (lottery_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({'code': 400, 'msg': '抽奖不存在或已结束'})
        return jsonify({'code': 200, 'msg': '抽奖已结束'})
    except Exception:
        logging.exception("结束抽奖失败")
        if conn: conn.rollback()
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ==================== 用户：检查是否有可参与的抽奖 ====================
@lottery_bp.route('/lottery/check', methods=['POST'])
def check_lottery():
    data = request.get_json()
    openid = request.headers.get('X-Wx-OpenId')
    if not openid:
        return jsonify({'code': 401, 'msg': '请先登录'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT l.id, l.activity_id, l.password, l.start_time, l.end_time,
                   a.name as activity_name
            FROM activity_lotteries l
            JOIN activities a ON l.activity_id = a.id
            WHERE l.status = 1
            AND NOW() BETWEEN l.start_time AND l.end_time
            AND EXISTS (
                SELECT 1 FROM activity_participants p
                WHERE p.activity_id = l.activity_id
                AND p.user_openid = %s AND p.status = 1
            )
            AND NOT EXISTS (
                SELECT 1 FROM lottery_records r
                WHERE r.lottery_id = l.id AND r.user_openid = %s
            )
        """, (openid, openid))
        lotteries = cursor.fetchall()

        result = []
        for lot in lotteries:
            if lot.get('start_time'):
                lot['start_time'] = lot['start_time'].strftime('%Y-%m-%d %H:%M')
            if lot.get('end_time'):
                lot['end_time'] = lot['end_time'].strftime('%Y-%m-%d %H:%M')
            lot.pop('password', None)
            result.append(lot)

        return jsonify({'code': 200, 'data': result})
    except Exception:
        logging.exception("检查抽奖失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ==================== 用户：抽奖 ====================
@lottery_bp.route('/lottery/draw', methods=['POST'])
def draw_lottery():
    data = request.get_json()
    openid = request.headers.get('X-Wx-OpenId')
    lottery_id = data.get('lottery_id')
    password = data.get('password', '')

    if not openid:
        return jsonify({'code': 401, 'msg': '请先登录'})
    if not lottery_id:
        return jsonify({'code': 400, 'msg': '缺少抽奖ID'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # 查抽奖信息
        cursor.execute("""
            SELECT l.*, a.name as activity_name
            FROM activity_lotteries l
            JOIN activities a ON l.activity_id = a.id
            WHERE l.id = %s AND l.status = 1
            AND NOW() BETWEEN l.start_time AND l.end_time
        """, (lottery_id,))
        lottery = cursor.fetchone()
        if not lottery:
            return jsonify({'code': 400, 'msg': '抽奖不存在或已结束'})

        # 查是否已抽过
        cursor.execute("SELECT id, prize_id, password_attempts FROM lottery_records WHERE lottery_id = %s AND user_openid = %s", (lottery_id, openid))
        existing = cursor.fetchone()
        if existing and existing['prize_id'] is not None:
            return jsonify({'code': 400, 'msg': '您已参与过此抽奖', 'already_drawn': True})

        # 查参与记录
        cursor.execute("""
            SELECT 1 FROM activity_participants
            WHERE activity_id = %s AND user_openid = %s AND status = 1
        """, (lottery['activity_id'], openid))
        if not cursor.fetchone():
            return jsonify({'code': 403, 'msg': '您没有参与该活动，无资格抽奖'})

        # 校验口令
        attempts = 0
        if existing:
            attempts = existing['password_attempts']

        if attempts >= 3:
            return jsonify({'code': 403, 'msg': '口令错误次数已达上限，无法抽奖'})

        if password != lottery['password']:
            if existing:
                cursor.execute("UPDATE lottery_records SET password_attempts = password_attempts + 1 WHERE id = %s", (existing['id'],))
            else:
                cursor.execute("""
                    INSERT INTO lottery_records (lottery_id, user_openid, prize_id, password_attempts)
                    VALUES (%s, %s, NULL, 1)
                """, (lottery_id, openid))
            conn.commit()
            remaining = 3 - (attempts + 1)
            return jsonify({'code': 400, 'msg': f'口令错误，还剩{remaining}次机会'})

        # 口令正确，执行抽奖
        cursor.execute("""
            SELECT id, tier_name, tier_level, remaining FROM lottery_prizes
            WHERE lottery_id = %s AND remaining > 0 AND tier_level != 99
            ORDER BY tier_level
        """, (lottery_id,))
        real_prizes = cursor.fetchall()

        won_prize = None
        if real_prizes:
            total_remaining = sum(p['remaining'] for p in real_prizes)
            if random.random() < min(total_remaining / (total_remaining + 5), 0.7):
                weighted = []
                for p in real_prizes:
                    weighted.extend([p] * p['remaining'])
                won_prize = random.choice(weighted) if weighted else None

        prize_id = None
        prize_name = '谢谢参与'
        if won_prize:
            prize_id = won_prize['id']
            prize_name = won_prize['tier_name']
            cursor.execute("UPDATE lottery_prizes SET remaining = remaining - 1 WHERE id = %s", (prize_id,))

        if existing:
            cursor.execute("UPDATE lottery_records SET prize_id = %s, password_attempts = password_attempts + 1 WHERE id = %s", (prize_id, existing['id']))
        else:
            cursor.execute("""
                INSERT INTO lottery_records (lottery_id, user_openid, prize_id, password_attempts)
                VALUES (%s, %s, %s, 1)
            """, (lottery_id, openid, prize_id))

        conn.commit()

        return jsonify({'code': 200, 'data': {
            'prize_name': prize_name,
            'prize_id': prize_id,
            'activity_name': lottery['activity_name'],
            'lottery_id': lottery_id
        }})
    except Exception:
        logging.exception("抽奖失败")
        if conn: conn.rollback()
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ==================== 用户：查看抽奖结果 ====================
@lottery_bp.route('/lottery/my-result', methods=['GET'])
def my_lottery_result():
    openid = request.headers.get('X-Wx-OpenId')
    lottery_id = request.args.get('lottery_id')
    if not openid:
        return jsonify({'code': 401, 'msg': '请先登录'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        if lottery_id:
            cursor.execute("""
                SELECT r.id, r.lottery_id, r.prize_id, r.password_attempts, r.created_at,
                       p.tier_name as prize_name,
                       a.name as activity_name
                FROM lottery_records r
                JOIN activity_lotteries l ON r.lottery_id = l.id
                JOIN activities a ON l.activity_id = a.id
                LEFT JOIN lottery_prizes p ON r.prize_id = p.id
                WHERE r.lottery_id = %s AND r.user_openid = %s
            """, (lottery_id, openid))
        else:
            cursor.execute("""
                SELECT r.id, r.lottery_id, r.prize_id, r.password_attempts, r.created_at,
                       p.tier_name as prize_name,
                       a.name as activity_name
                FROM lottery_records r
                JOIN activity_lotteries l ON r.lottery_id = l.id
                JOIN activities a ON l.activity_id = a.id
                LEFT JOIN lottery_prizes p ON r.prize_id = p.id
                WHERE r.user_openid = %s AND r.prize_id IS NOT NULL
                ORDER BY r.created_at DESC
            """, (openid,))

        records = cursor.fetchall()
        for r in records:
            if r.get('created_at'):
                r['created_at'] = r['created_at'].strftime('%Y-%m-%d %H:%M')
            if not r.get('prize_name'):
                r['prize_name'] = '谢谢参与'

        return jsonify({'code': 200, 'data': records})
    except Exception:
        logging.exception("获取抽奖结果失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        if cursor: cursor.close()
        if conn: conn.close()
