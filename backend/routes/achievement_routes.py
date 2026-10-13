"""成就中心：用户成就墙与超级管理员彩蛋徽章配置。"""
import logging
import secrets
from datetime import datetime

from flask import Blueprint, g, jsonify, request

from achievement_domain import (
    MILESTONE_TYPE,
    normalize_event_badge_payload,
    progress_for_threshold,
)
from db_utils import get_db
from achievement_service import count_valid_attendance
from middleware import check_admin, check_verified_and_blacklist


achievement_bp = Blueprint('achievement_center', __name__)


def _close(cursor):
    if cursor:
        cursor.close()


def _decorate_badge(item, attendance_count):
    result = dict(item)
    result['achievement_type'] = int(result.get('achievement_type') or 0)
    result['threshold_count'] = int(result.get('threshold_count') or 0)
    result['is_physical'] = int(result.get('is_physical') or 0)
    result['is_active'] = int(result.get('is_active') or 0)
    result['unlocked'] = bool(result.pop('user_achievement_id', None))
    result['reward_status'] = (
        int(result['reward_status'])
        if result.get('reward_status') is not None else None
    )
    if isinstance(result.get('obtained_at'), datetime):
        result['obtained_at'] = result['obtained_at'].strftime('%Y-%m-%d %H:%M')
    if result['achievement_type'] == MILESTONE_TYPE:
        result['unlocked'] = result['unlocked'] and attendance_count >= result['threshold_count']
        result['progress'] = progress_for_threshold(
            attendance_count, result['threshold_count'],
        )
    else:
        result['progress'] = None
    return result


@achievement_bp.route('', methods=['GET'])
@check_verified_and_blacklist
def get_achievement_center():
    cursor = None
    try:
        cursor = get_db().cursor()
        attendance_count = count_valid_attendance(cursor, g.openid)

        cursor.execute("""
            SELECT d.id, d.code, d.achievement_type, d.name, d.description,
                   d.image_url, d.threshold_count, d.is_physical,
                   d.reward_name, d.is_active, d.sort_order,
                   ua.id AS user_achievement_id, ua.obtained_at,
                   ua.source_activity_id, a.name AS source_activity_name,
                   ar.id AS reward_id, ar.status AS reward_status
            FROM achievement_definitions d
            LEFT JOIN user_achievements ua
              ON ua.achievement_id = d.id AND ua.user_openid = %s
            LEFT JOIN activities a ON a.id = ua.source_activity_id
            LEFT JOIN achievement_rewards ar
              ON ar.achievement_id = d.id AND ar.user_openid = %s
            WHERE d.achievement_type = 1 AND d.is_active = 1
            ORDER BY d.threshold_count ASC, d.id ASC
        """, (g.openid, g.openid))
        milestones = [
            _decorate_badge(item, attendance_count) for item in cursor.fetchall()
        ]

        cursor.execute("""
            SELECT d.id, d.code, d.achievement_type, d.name, d.description,
                   d.image_url, d.threshold_count, d.is_physical,
                   d.reward_name, d.is_active, d.sort_order,
                   ua.id AS user_achievement_id, ua.obtained_at,
                   ua.source_activity_id, a.name AS source_activity_name,
                   ar.id AS reward_id, ar.status AS reward_status
            FROM user_achievements ua
            JOIN achievement_definitions d ON d.id = ua.achievement_id
            LEFT JOIN activities a ON a.id = ua.source_activity_id
            LEFT JOIN achievement_rewards ar
              ON ar.achievement_id = d.id AND ar.user_openid = ua.user_openid
            WHERE ua.user_openid = %s AND d.achievement_type = 2
              AND a.is_official = 1 AND a.status IN (1, 3, 4)
              AND EXISTS (
                  SELECT 1 FROM achievement_attendance aa
                  WHERE aa.user_openid = ua.user_openid AND aa.activity_id = a.id AND aa.status = 1
              )
            ORDER BY ua.obtained_at DESC, d.sort_order ASC, d.id ASC
        """, (g.openid,))
        event_badges = [
            _decorate_badge(item, attendance_count) for item in cursor.fetchall()
        ]

        milestone_unlocked = sum(1 for item in milestones if item['unlocked'])
        next_milestone = next(
            (item for item in milestones if not item['unlocked']), None,
        )
        cursor.execute('SELECT isAdmin FROM users WHERE openId = %s', (g.openid,))
        user = cursor.fetchone() or {}
        return jsonify({'code': 200, 'data': {
            'attendance_count': attendance_count,
            'milestone_unlocked': milestone_unlocked,
            'milestone_total': len(milestones),
            'event_unlocked': len(event_badges),
            'next_milestone': next_milestone,
            'milestones': milestones,
            'event_badges': event_badges,
            'can_manage': int(user.get('isAdmin') or 0) == 1,
        }})
    except Exception:
        logging.exception('获取成就中心失败')
        return jsonify({'code': 500, 'msg': '成就中心加载失败，请稍后重试'})
    finally:
        _close(cursor)


def _admin_config(cursor):
    cursor.execute("""
        SELECT d.id, d.code, d.achievement_type, d.name, d.description,
               d.image_url, d.threshold_count, d.is_physical,
               d.reward_name, d.claim_instructions, d.pickup_location,
               d.is_active, d.sort_order, d.created_at, d.updated_at,
               (SELECT COUNT(*) FROM user_achievements ua
                WHERE ua.achievement_id = d.id AND (
                    (d.achievement_type = 1 AND d.threshold_count <= (
                        SELECT COUNT(*) FROM achievement_attendance aa
                        JOIN activities valid_activity ON valid_activity.id = aa.activity_id
                        WHERE aa.user_openid = ua.user_openid AND aa.status = 1
                          AND valid_activity.is_official = 1 AND valid_activity.status IN (1, 3, 4)
                    )) OR (d.achievement_type = 2 AND EXISTS (
                        SELECT 1 FROM achievement_attendance aa
                        JOIN activities valid_activity ON valid_activity.id = aa.activity_id
                        WHERE aa.user_openid = ua.user_openid AND aa.activity_id = ua.source_activity_id
                          AND aa.status = 1 AND valid_activity.is_official = 1
                          AND valid_activity.status IN (1, 3, 4)
                    ))
                )) AS unlocked_count
        FROM achievement_definitions d
        ORDER BY d.achievement_type ASC, d.sort_order ASC,
                 d.threshold_count ASC, d.id ASC
    """)
    badges = cursor.fetchall()

    cursor.execute("""
        SELECT achievement_id, activity_id
        FROM achievement_activity_relations
        WHERE is_active = 1
        ORDER BY achievement_id, activity_id
    """)
    activity_ids = {}
    for relation in cursor.fetchall():
        activity_ids.setdefault(relation['achievement_id'], []).append(
            relation['activity_id'],
        )
    for badge in badges:
        badge['achievement_type'] = int(badge.get('achievement_type') or 0)
        badge['threshold_count'] = int(badge.get('threshold_count') or 0)
        badge['is_physical'] = int(badge.get('is_physical') or 0)
        badge['is_active'] = int(badge.get('is_active') or 0)
        badge['unlocked_count'] = int(badge.get('unlocked_count') or 0)
        badge['activity_ids'] = activity_ids.get(badge['id'], [])

    cursor.execute("""
        SELECT id, name, activity_time, status, cover_url
        FROM activities
        WHERE is_official = 1 AND status IN (1, 3, 4)
        ORDER BY activity_time DESC, id DESC
        LIMIT 200
    """)
    activities = cursor.fetchall()
    for activity in activities:
        if isinstance(activity.get('activity_time'), datetime):
            activity['activity_time'] = activity['activity_time'].strftime('%Y-%m-%d %H:%M')
    return {'badges': badges, 'activities': activities}


@achievement_bp.route('/admin/config', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def get_admin_config():
    cursor = None
    try:
        cursor = get_db().cursor()
        return jsonify({'code': 200, 'data': _admin_config(cursor)})
    except Exception:
        logging.exception('获取成就管理配置失败')
        return jsonify({'code': 500, 'msg': '配置加载失败，请稍后重试'})
    finally:
        _close(cursor)


def _save_relations(cursor, achievement_id, activity_ids, operator_openid):
    if activity_ids:
        placeholders = ','.join(['%s'] * len(activity_ids))
        cursor.execute(f"""
            SELECT id FROM activities
            WHERE is_official = 1 AND status IN (1, 3, 4) AND id IN ({placeholders})
        """, tuple(activity_ids))
        valid_ids = {item['id'] for item in cursor.fetchall()}
        if valid_ids != set(activity_ids):
            raise ValueError('只能关联有效的官方活动')

    cursor.execute(
        'DELETE FROM achievement_activity_relations WHERE achievement_id = %s',
        (achievement_id,),
    )
    if activity_ids:
        cursor.executemany("""
            INSERT INTO achievement_activity_relations
                (achievement_id, activity_id, is_active, created_by)
            VALUES (%s, %s, 1, %s)
        """, [
            (achievement_id, activity_id, operator_openid)
            for activity_id in activity_ids
        ])


@achievement_bp.route('/admin/badges', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def create_event_badge():
    try:
        payload = normalize_event_badge_payload(request.get_json(silent=True) or {})
    except ValueError as exc:
        return jsonify({'code': 400, 'msg': str(exc)})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        code = f"EVENT_{secrets.token_hex(6).upper()}"
        cursor.execute("""
            INSERT INTO achievement_definitions
                (code, achievement_type, name, description, image_url,
                 threshold_count, is_physical, sort_order, is_active,
                 created_by, updated_by)
            VALUES (%s, 2, %s, %s, %s, NULL, 0, %s, %s, %s, %s)
        """, (
            code, payload['name'], payload['description'], payload['image_url'],
            payload['sort_order'], payload['is_active'], g.openid, g.openid,
        ))
        badge_id = cursor.lastrowid
        _save_relations(cursor, badge_id, payload['activity_ids'], g.openid)
        conn.commit()
        return jsonify({'code': 200, 'msg': '彩蛋徽章已创建', 'data': {'id': badge_id}})
    except ValueError as exc:
        conn.rollback()
        return jsonify({'code': 400, 'msg': str(exc)})
    except Exception:
        conn.rollback()
        logging.exception('创建彩蛋徽章失败')
        return jsonify({'code': 500, 'msg': '保存失败，请稍后重试'})
    finally:
        _close(cursor)


@achievement_bp.route('/admin/badges/<int:badge_id>', methods=['PUT'])
@check_verified_and_blacklist
@check_admin
def update_event_badge(badge_id):
    try:
        payload = normalize_event_badge_payload(request.get_json(silent=True) or {})
    except ValueError as exc:
        return jsonify({'code': 400, 'msg': str(exc)})

    conn = get_db()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id FROM achievement_definitions
            WHERE id = %s AND achievement_type = 2 FOR UPDATE
        """, (badge_id,))
        if not cursor.fetchone():
            conn.rollback()
            return jsonify({'code': 404, 'msg': '彩蛋徽章不存在'})
        cursor.execute("""
            UPDATE achievement_definitions
            SET name = %s, description = %s, image_url = %s,
                sort_order = %s, is_active = %s, updated_by = %s
            WHERE id = %s AND achievement_type = 2
        """, (
            payload['name'], payload['description'], payload['image_url'],
            payload['sort_order'], payload['is_active'], g.openid, badge_id,
        ))
        _save_relations(cursor, badge_id, payload['activity_ids'], g.openid)
        conn.commit()
        return jsonify({'code': 200, 'msg': '彩蛋徽章已保存'})
    except ValueError as exc:
        conn.rollback()
        return jsonify({'code': 400, 'msg': str(exc)})
    except Exception:
        conn.rollback()
        logging.exception('更新彩蛋徽章失败')
        return jsonify({'code': 500, 'msg': '保存失败，请稍后重试'})
    finally:
        _close(cursor)
