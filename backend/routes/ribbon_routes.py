import logging

from flask import Blueprint, g, jsonify, request

from db_utils import get_db
from middleware import check_admin, check_verified_and_blacklist
from ribbon_domain import (
    normalize_ribbon_ids,
    normalize_ribbon_payload,
    normalize_wall_payload,
)


ribbon_bp = Blueprint('ribbon_wall', __name__)


def _rollback_response(conn, code, message):
    """End the current transaction before returning a validation response."""
    conn.rollback()
    return jsonify({'code': code, 'msg': message})


def _wall_config(cursor, include_inactive=False):
    wall_where = '' if include_inactive else 'WHERE w.is_active = 1'
    cursor.execute(f"""
        SELECT w.id, w.title, w.subtitle, w.sort_order, w.is_active,
               w.created_at, w.updated_at
        FROM ribbon_walls w
        {wall_where}
        ORDER BY w.sort_order ASC, w.id ASC
    """)
    walls = cursor.fetchall()
    if not walls:
        return []

    wall_ids = [wall['id'] for wall in walls]
    placeholders = ','.join(['%s'] * len(wall_ids))
    ribbon_active = '' if include_inactive else 'AND r.is_active = 1'
    cursor.execute(f"""
        SELECT i.wall_id, i.slot_index, r.id, r.name, r.description,
               r.image_url, r.is_active, r.created_at, r.updated_at
        FROM ribbon_wall_items i
        JOIN ribbons r ON r.id = i.ribbon_id
        WHERE i.wall_id IN ({placeholders}) {ribbon_active}
        ORDER BY i.wall_id ASC, i.slot_index ASC
    """, tuple(wall_ids))
    items = cursor.fetchall()

    cursor.execute(f"""
        SELECT wall_id, slot_index, image_url
        FROM ribbon_wall_charms
        WHERE wall_id IN ({placeholders})
        ORDER BY wall_id ASC, slot_index ASC
    """, tuple(wall_ids))
    charms = cursor.fetchall()

    by_wall = {wall_id: [] for wall_id in wall_ids}
    for item in items:
        item['is_active'] = int(item.get('is_active') or 0)
        by_wall[item['wall_id']].append(item)
    charms_by_wall = {wall_id: [] for wall_id in wall_ids}
    for charm in charms:
        charms_by_wall[charm['wall_id']].append(charm)

    result = []
    for wall in walls:
        wall['is_active'] = int(wall.get('is_active') or 0)
        wall['ribbons'] = by_wall.get(wall['id'], [])
        wall['charms'] = charms_by_wall.get(wall['id'], [])
        result.append(wall)
    return result


@ribbon_bp.route('', methods=['GET'])
@check_verified_and_blacklist
def get_collection():
    """Return all published walls together with the current user's state."""
    cursor = None
    try:
        cursor = get_db().cursor()
        walls = _wall_config(cursor, include_inactive=False)
        cursor.execute("""
            SELECT ribbon_id
            FROM user_ribbons
            WHERE user_openid = %s AND owned_status = 1
        """, (g.openid,))
        owned_ids = {row['ribbon_id'] for row in cursor.fetchall()}
        cursor.execute('SELECT isAdmin FROM users WHERE openId = %s', (g.openid,))
        user = cursor.fetchone() or {}
        visible_ids = set()
        for wall in walls:
            for ribbon in wall['ribbons']:
                visible_ids.add(ribbon['id'])
                ribbon['owned_status'] = ribbon['id'] in owned_ids
        return jsonify({
            'code': 200,
            'data': {
                'walls': walls,
                'total': len(visible_ids),
                'lit_count': len(visible_ids & owned_ids),
                'can_manage': int(user.get('isAdmin') or 0) == 1,
            },
        })
    except Exception:
        logging.exception('获取飘带墙失败')
        return jsonify({'code': 500, 'msg': '飘带墙加载失败，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


@ribbon_bp.route('/ribbons/<int:ribbon_id>/owned', methods=['PUT'])
@check_verified_and_blacklist
def set_owned_status(ribbon_id):
    data = request.get_json(silent=True) or {}
    value = data.get('owned_status')
    if value not in (True, False, 0, 1, '0', '1'):
        return jsonify({'code': 400, 'msg': '点亮状态无效'})
    owned_status = 1 if value in (True, 1, '1') else 0

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT r.id
            FROM ribbons r
            JOIN ribbon_wall_items i ON i.ribbon_id = r.id
            JOIN ribbon_walls w ON w.id = i.wall_id
            WHERE r.id = %s AND r.is_active = 1 AND w.is_active = 1
            LIMIT 1
        """, (ribbon_id,))
        if not cursor.fetchone():
            return _rollback_response(conn, 404, '飘带不存在或尚未发布')

        cursor.execute("""
            INSERT INTO user_ribbons (user_openid, ribbon_id, owned_status)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE owned_status = VALUES(owned_status), updated_at = CURRENT_TIMESTAMP
        """, (g.openid, ribbon_id, owned_status))
        conn.commit()
        return jsonify({
            'code': 200,
            'msg': '已点亮' if owned_status else '已取消点亮',
            'data': {'ribbon_id': ribbon_id, 'owned_status': owned_status},
        })
    except Exception:
        conn.rollback()
        logging.exception('更新飘带点亮状态失败')
        return jsonify({'code': 500, 'msg': '状态保存失败，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


@ribbon_bp.route('/admin/config', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def get_admin_config():
    cursor = None
    try:
        cursor = get_db().cursor()
        walls = _wall_config(cursor, include_inactive=True)
        cursor.execute("""
            SELECT id, name, description, image_url, sort_order, is_active,
                   created_at, updated_at
            FROM ribbons
            ORDER BY sort_order ASC, id ASC
        """)
        ribbons = cursor.fetchall()
        for ribbon in ribbons:
            ribbon['is_active'] = int(ribbon.get('is_active') or 0)
        return jsonify({'code': 200, 'data': {'walls': walls, 'ribbons': ribbons}})
    except Exception:
        logging.exception('获取飘带墙管理配置失败')
        return jsonify({'code': 500, 'msg': '配置加载失败，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


@ribbon_bp.route('/admin/walls', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def create_wall():
    try:
        payload = normalize_wall_payload(request.get_json(silent=True) or {})
    except ValueError as exc:
        return jsonify({'code': 400, 'msg': str(exc)})
    if payload['is_active'] == 1:
        return jsonify({'code': 400, 'msg': '请先创建草稿并配置 4 条飘带，再发布墙面'})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM ribbon_walls')
        sort_order = int(cursor.fetchone()['max_order'] or 0) + 1
        cursor.execute("""
            INSERT INTO ribbon_walls
                (title, subtitle, sort_order, is_active, created_by, updated_by)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            payload['title'], payload['subtitle'], sort_order,
            payload['is_active'], g.openid, g.openid,
        ))
        wall_id = cursor.lastrowid
        for index, image_url in enumerate(payload.get('charm_urls') or [], start=1):
            if image_url:
                cursor.execute("""
                    INSERT INTO ribbon_wall_charms (wall_id, slot_index, image_url)
                    VALUES (%s, %s, %s)
                """, (wall_id, index, image_url))
        conn.commit()
        return jsonify({'code': 200, 'msg': '墙面已创建', 'data': {'id': wall_id}})
    except Exception:
        conn.rollback()
        logging.exception('创建飘带墙失败')
        return jsonify({'code': 500, 'msg': '墙面创建失败，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


@ribbon_bp.route('/admin/walls/save', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def save_wall_configuration():
    """Atomically save wall metadata, charms, and its ordered ribbon slots."""
    data = request.get_json(silent=True) or {}
    try:
        payload = normalize_wall_payload(data)
        ribbon_ids = normalize_ribbon_ids(data.get('ribbon_ids'))
        wall_id = int(data.get('id') or 0)
        if wall_id < 0:
            raise ValueError('墙面编号无效')
    except (TypeError, ValueError) as exc:
        return jsonify({'code': 400, 'msg': str(exc) or '墙面配置无效'})

    if payload['is_active'] == 1 and len(ribbon_ids) != 4:
        return jsonify({'code': 400, 'msg': '发布墙面前需要配置 4 条已启用飘带'})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        if wall_id:
            cursor.execute('SELECT id FROM ribbon_walls WHERE id = %s FOR UPDATE', (wall_id,))
            if not cursor.fetchone():
                return _rollback_response(conn, 404, '墙面不存在')
        else:
            cursor.execute('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM ribbon_walls')
            sort_order = int(cursor.fetchone()['max_order'] or 0) + 1
            cursor.execute("""
                INSERT INTO ribbon_walls
                    (title, subtitle, sort_order, is_active, created_by, updated_by)
                VALUES (%s, %s, %s, 0, %s, %s)
            """, (payload['title'], payload['subtitle'], sort_order, g.openid, g.openid))
            wall_id = cursor.lastrowid

        if ribbon_ids:
            placeholders = ','.join(['%s'] * len(ribbon_ids))
            cursor.execute(
                f'SELECT id FROM ribbons WHERE id IN ({placeholders}) AND is_active = 1',
                tuple(ribbon_ids),
            )
            found = {row['id'] for row in cursor.fetchall()}
            if found != set(ribbon_ids):
                return _rollback_response(conn, 400, '所选飘带不存在或已停用')
            cursor.execute(f"""
                SELECT w.title
                FROM ribbon_wall_items i
                JOIN ribbon_walls w ON w.id = i.wall_id
                WHERE i.ribbon_id IN ({placeholders})
                  AND i.wall_id <> %s
                  AND w.is_active = 1
                LIMIT 1
            """, tuple(ribbon_ids) + (wall_id,))
            occupied = cursor.fetchone()
            if occupied:
                return _rollback_response(
                    conn,
                    400,
                    f"所选飘带仍在已发布墙面“{occupied['title']}”中，请先下线原墙面",
                )
            cursor.execute(
                f'DELETE FROM ribbon_wall_items WHERE ribbon_id IN ({placeholders})',
                tuple(ribbon_ids),
            )

        cursor.execute('DELETE FROM ribbon_wall_items WHERE wall_id = %s', (wall_id,))
        for slot_index, ribbon_id in enumerate(ribbon_ids, start=1):
            cursor.execute("""
                INSERT INTO ribbon_wall_items (wall_id, ribbon_id, slot_index)
                VALUES (%s, %s, %s)
            """, (wall_id, ribbon_id, slot_index))

        cursor.execute("""
            UPDATE ribbon_walls
            SET title = %s, subtitle = %s, is_active = %s, updated_by = %s
            WHERE id = %s
        """, (
            payload['title'], payload['subtitle'], payload['is_active'],
            g.openid, wall_id,
        ))

        cursor.execute('DELETE FROM ribbon_wall_charms WHERE wall_id = %s', (wall_id,))
        for index, image_url in enumerate(payload.get('charm_urls') or [], start=1):
            if image_url:
                cursor.execute("""
                    INSERT INTO ribbon_wall_charms (wall_id, slot_index, image_url)
                    VALUES (%s, %s, %s)
                """, (wall_id, index, image_url))

        conn.commit()
        return jsonify({'code': 200, 'msg': '墙面已保存', 'data': {'id': wall_id}})
    except Exception:
        conn.rollback()
        logging.exception('保存完整飘带墙配置失败')
        return jsonify({'code': 500, 'msg': '墙面保存失败，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


@ribbon_bp.route('/admin/walls/<int:wall_id>', methods=['PUT'])
@check_verified_and_blacklist
@check_admin
def update_wall(wall_id):
    try:
        payload = normalize_wall_payload(request.get_json(silent=True) or {}, partial=True)
    except ValueError as exc:
        return jsonify({'code': 400, 'msg': str(exc)})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT id, is_active FROM ribbon_walls WHERE id = %s FOR UPDATE', (wall_id,))
        if not cursor.fetchone():
            return _rollback_response(conn, 404, '墙面不存在')

        if payload.get('is_active') == 1:
            cursor.execute("""
                SELECT COUNT(*) AS total
                FROM ribbon_wall_items i
                JOIN ribbons r ON r.id = i.ribbon_id AND r.is_active = 1
                WHERE i.wall_id = %s
            """, (wall_id,))
            if int(cursor.fetchone()['total'] or 0) != 4:
                return _rollback_response(conn, 400, '发布墙面前需要配置 4 条已启用飘带')

        assignments = []
        params = []
        for field in ('title', 'subtitle', 'is_active'):
            if field in payload:
                assignments.append(f'{field} = %s')
                params.append(payload[field])
        assignments.append('updated_by = %s')
        params.append(g.openid)
        params.append(wall_id)
        cursor.execute(
            f"UPDATE ribbon_walls SET {', '.join(assignments)} WHERE id = %s",
            tuple(params),
        )

        if 'charm_urls' in payload:
            cursor.execute('DELETE FROM ribbon_wall_charms WHERE wall_id = %s', (wall_id,))
            for index, image_url in enumerate(payload['charm_urls'], start=1):
                if image_url:
                    cursor.execute("""
                        INSERT INTO ribbon_wall_charms (wall_id, slot_index, image_url)
                        VALUES (%s, %s, %s)
                    """, (wall_id, index, image_url))
        conn.commit()
        return jsonify({'code': 200, 'msg': '墙面已保存'})
    except Exception:
        conn.rollback()
        logging.exception('更新飘带墙失败')
        return jsonify({'code': 500, 'msg': '墙面保存失败，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


@ribbon_bp.route('/admin/walls/<int:wall_id>/ribbons', methods=['PUT'])
@check_verified_and_blacklist
@check_admin
def replace_wall_ribbons(wall_id):
    data = request.get_json(silent=True) or {}
    try:
        ribbon_ids = normalize_ribbon_ids(data.get('ribbon_ids'))
    except ValueError as exc:
        return jsonify({'code': 400, 'msg': str(exc)})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT id, is_active FROM ribbon_walls WHERE id = %s FOR UPDATE', (wall_id,))
        wall = cursor.fetchone()
        if not wall:
            return _rollback_response(conn, 404, '墙面不存在')
        if int(wall.get('is_active') or 0) == 1 and len(ribbon_ids) != 4:
            return _rollback_response(conn, 400, '已发布墙面必须保留 4 条飘带；请先下线墙面')

        if ribbon_ids:
            placeholders = ','.join(['%s'] * len(ribbon_ids))
            cursor.execute(
                f'SELECT id FROM ribbons WHERE id IN ({placeholders}) AND is_active = 1',
                tuple(ribbon_ids),
            )
            found = {row['id'] for row in cursor.fetchall()}
            if found != set(ribbon_ids):
                return _rollback_response(conn, 400, '所选飘带不存在或已停用')
            cursor.execute(f"""
                SELECT i.ribbon_id, w.title
                FROM ribbon_wall_items i
                JOIN ribbon_walls w ON w.id = i.wall_id
                WHERE i.ribbon_id IN ({placeholders})
                  AND i.wall_id <> %s
                  AND w.is_active = 1
                LIMIT 1
            """, tuple(ribbon_ids) + (wall_id,))
            occupied = cursor.fetchone()
            if occupied:
                return _rollback_response(
                    conn,
                    400,
                    f"所选飘带仍在已发布墙面“{occupied['title']}”中，请先下线原墙面",
                )
            cursor.execute(
                f'DELETE FROM ribbon_wall_items WHERE ribbon_id IN ({placeholders})',
                tuple(ribbon_ids),
            )

        cursor.execute('DELETE FROM ribbon_wall_items WHERE wall_id = %s', (wall_id,))
        for slot_index, ribbon_id in enumerate(ribbon_ids, start=1):
            cursor.execute("""
                INSERT INTO ribbon_wall_items (wall_id, ribbon_id, slot_index)
                VALUES (%s, %s, %s)
            """, (wall_id, ribbon_id, slot_index))
        cursor.execute(
            'UPDATE ribbon_walls SET updated_by = %s WHERE id = %s',
            (g.openid, wall_id),
        )
        conn.commit()
        return jsonify({'code': 200, 'msg': '墙面飘带已保存'})
    except Exception:
        conn.rollback()
        logging.exception('更新墙面飘带失败')
        return jsonify({'code': 500, 'msg': '飘带配置保存失败，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


@ribbon_bp.route('/admin/ribbons', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def create_ribbon():
    try:
        payload = normalize_ribbon_payload(request.get_json(silent=True) or {})
    except ValueError as exc:
        return jsonify({'code': 400, 'msg': str(exc)})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM ribbons')
        sort_order = int(cursor.fetchone()['max_order'] or 0) + 1
        cursor.execute("""
            INSERT INTO ribbons
                (name, description, image_url, sort_order, is_active, created_by, updated_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            payload['name'], payload['description'], payload['image_url'],
            sort_order, payload['is_active'], g.openid, g.openid,
        ))
        ribbon_id = cursor.lastrowid
        conn.commit()
        return jsonify({'code': 200, 'msg': '飘带已创建', 'data': {'id': ribbon_id}})
    except Exception:
        conn.rollback()
        logging.exception('创建飘带失败')
        return jsonify({'code': 500, 'msg': '飘带创建失败，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


@ribbon_bp.route('/admin/ribbons/<int:ribbon_id>', methods=['PUT'])
@check_verified_and_blacklist
@check_admin
def update_ribbon(ribbon_id):
    try:
        payload = normalize_ribbon_payload(request.get_json(silent=True) or {}, partial=True)
    except ValueError as exc:
        return jsonify({'code': 400, 'msg': str(exc)})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM ribbons WHERE id = %s FOR UPDATE', (ribbon_id,))
        if not cursor.fetchone():
            return _rollback_response(conn, 404, '飘带不存在')
        if payload.get('is_active') == 0:
            cursor.execute("""
                SELECT w.id
                FROM ribbon_wall_items i
                JOIN ribbon_walls w ON w.id = i.wall_id
                WHERE i.ribbon_id = %s AND w.is_active = 1
                LIMIT 1
            """, (ribbon_id,))
            if cursor.fetchone():
                return _rollback_response(conn, 400, '请先下线所在墙面，再停用这条飘带')
        assignments = []
        params = []
        for field in ('name', 'description', 'image_url', 'is_active'):
            if field in payload:
                assignments.append(f'{field} = %s')
                params.append(payload[field])
        assignments.append('updated_by = %s')
        params.extend([g.openid, ribbon_id])
        cursor.execute(
            f"UPDATE ribbons SET {', '.join(assignments)} WHERE id = %s",
            tuple(params),
        )
        conn.commit()
        return jsonify({'code': 200, 'msg': '飘带已保存'})
    except Exception:
        conn.rollback()
        logging.exception('更新飘带失败')
        return jsonify({'code': 500, 'msg': '飘带保存失败，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
