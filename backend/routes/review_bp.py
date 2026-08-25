from flask import Blueprint, request, jsonify, g
from datetime import datetime
import logging
from db_utils import get_db
from middleware import check_verified_and_blacklist, check_admin
from domain import format_review_date
import uuid
import os
import pymysql.cursors

review_bp = Blueprint('review', __name__, url_prefix='/api/reviews')

# 允许的图片格式
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# -------------------- 上传图片接口（通用） --------------------
@review_bp.route('/upload', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def upload_image():
    """上传图片，返回图片URL（需要配置上传目录）"""
    if 'file' not in request.files:
        return jsonify({'code': 400, 'msg': '没有文件'})
    file = request.files['file']
    if file.filename == '':
        return jsonify({'code': 400, 'msg': '文件名为空'})
    if not allowed_file(file.filename):
        return jsonify({'code': 400, 'msg': '不支持的图片格式'})

    # ==================== 图片安全检测 ====================
    from app import check_image_security
    openid_for_check = g.openid
    image_data = file.read()
    is_safe, msg = check_image_security(image_data, openid_for_check)
    if not is_safe:
        return jsonify({'code': 400, 'msg': msg})
    # 重置文件指针，以便后续 save 操作
    file.seek(0)
    # ==================== 图片安全检测结束 ====================

    ext = file.filename.rsplit('.', 1)[1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    upload_dir = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)
    filepath = os.path.join(upload_dir, filename)
    file.save(filepath)

    url = f"/static/uploads/{filename}"
    return jsonify({'code': 200, 'msg': '上传成功', 'data': {'url': url}})


# -------------------- 获取可创建回顾的官方活动（管理员） --------------------
@review_bp.route('/official-activities', methods=['GET'])
@check_verified_and_blacklist
@check_admin
def get_review_official_activities():
    """返回尚未创建有效回顾的官方活动，用于新建回顾时导入基础信息。"""
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.id, a.name, a.activity_time, a.location, a.difficulty,
                   a.distance, a.climb, a.cover_url, a.status,
                   COALESCE(pc.participant_count, 0) AS participant_count
            FROM activities a
            LEFT JOIN (
                SELECT activity_id, SUM(companion_count + 1) AS participant_count
                FROM activity_participants
                WHERE status = 1
                GROUP BY activity_id
            ) pc ON pc.activity_id = a.id
            WHERE a.is_official = 1
              AND a.status IN (1, 3, 4)
              AND NOT EXISTS (
                  SELECT 1
                  FROM activity_reviews r
                  WHERE r.activity_id = a.id AND r.status = 1
              )
            ORDER BY
              CASE a.status WHEN 4 THEN 0 WHEN 3 THEN 1 ELSE 2 END,
              a.activity_time DESC,
              a.created_at DESC
            LIMIT 200
        """)
        activities = cursor.fetchall()
        for activity in activities:
            activity['time'] = format_review_date(activity.pop('activity_time', None))
        return jsonify({
            'code': 200,
            'data': {
                'list': activities,
                'total': len(activities),
            }
        })
    except Exception:
        logging.exception("获取回顾可选官方活动失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# -------------------- 获取活动回顾列表 --------------------
@review_bp.route('', methods=['GET'])
def get_review_list():
    """获取已发布的活动回顾列表（status=1），按创建时间倒序"""
    page = int(request.args.get('page', 1))
    size = int(request.args.get('size', 20))
    offset = (page - 1) * size

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor(pymysql.cursors.DictCursor)

        cursor.execute("SELECT COUNT(*) as total FROM activity_reviews WHERE status = 1")
        total = cursor.fetchone()['total']

        cursor.execute("""
            SELECT id, name, time, location, participants, cover
            FROM activity_reviews
            WHERE status = 1
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        """, (size, offset))
        reviews = cursor.fetchall()

        return jsonify({
            'code': 200,
            'data': {
                'list': reviews,
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
        if conn:
            conn.close()


# -------------------- 获取单条活动回顾详情 --------------------
@review_bp.route('/<int:review_id>', methods=['GET'])
def get_review_detail(review_id):
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor(pymysql.cursors.DictCursor)

        # 查询主表（增加了 cover3）
        cursor.execute("""
            SELECT id, activity_id, name, time, location, difficulty, distance, climb,
                   participants, summary, summary_time, cover, cover2, cover3
            FROM activity_reviews
            WHERE id = %s AND status = 1
        """, (review_id,))
        review = cursor.fetchone()
        if not review:
            return jsonify({'code': 404, 'msg': '活动回顾不存在'})

        # 查询照片墙
        cursor.execute("""
            SELECT url, uploader
            FROM review_photos
            WHERE review_id = %s
            ORDER BY sort_order, id
        """, (review_id,))
        photos = cursor.fetchall()
        review['photos'] = photos

        return jsonify({'code': 200, 'data': review})
    except Exception as e:
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# -------------------- 新建活动回顾（管理员） --------------------
@review_bp.route('', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def create_review():
    data = request.get_json(silent=True) or {}
    try:
        activity_id = int(data.get('activity_id'))
        if activity_id <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({'code': 400, 'msg': '请先选择一个官方活动'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # 锁定来源活动，确保并发创建时同一活动只生成一条有效回顾。
        cursor.execute("""
            SELECT id, name, activity_time, location, difficulty, distance,
                   climb, cover_url
            FROM activities
            WHERE id = %s AND is_official = 1 AND status IN (1, 3, 4)
            FOR UPDATE
        """, (activity_id,))
        activity = cursor.fetchone()
        if not activity:
            return jsonify({'code': 400, 'msg': '所选活动不是可用的官方活动'})

        cursor.execute(
            "SELECT id FROM activity_reviews WHERE activity_id = %s AND status = 1 LIMIT 1",
            (activity_id,)
        )
        if cursor.fetchone():
            return jsonify({'code': 409, 'msg': '该官方活动已经创建过回顾'})

        cursor.execute("""
            SELECT COALESCE(SUM(companion_count + 1), 0) AS participant_count
            FROM activity_participants
            WHERE activity_id = %s AND status = 1
        """, (activity_id,))
        participant_row = cursor.fetchone() or {}
        source_difficulty = activity.get('difficulty')
        source_difficulty = f'{source_difficulty}⭐' if source_difficulty else '待定'
        review_data = {
            'name': data.get('name') or activity.get('name'),
            'time': data.get('time') or format_review_date(activity.get('activity_time')),
            'location': data.get('location') or activity.get('location'),
            'difficulty': data.get('difficulty') or source_difficulty,
            'distance': data.get('distance') if data.get('distance') not in (None, '') else activity.get('distance', 0),
            'climb': data.get('climb') if data.get('climb') not in (None, '') else activity.get('climb', 0),
            'participants': data.get('participants') if data.get('participants') not in (None, '') else participant_row.get('participant_count', 0),
            'summary': data.get('summary', ''),
            # 活动封面不等于回顾中的人合照，必须由创建者单独上传。
            'cover': data.get('cover', ''),
            'cover2': data.get('cover2', ''),
            'cover3': data.get('cover3', ''),
            'photos': data.get('photos', []),
        }

        for field in ('name', 'time', 'location'):
            if not review_data.get(field):
                return jsonify({'code': 400, 'msg': f'缺少字段: {field}'})

        # ==================== 内容安全检测 ====================
        from app import check_text_security
        texts_to_check = [
            (review_data['name'], '回顾标题'),
            (review_data['location'], '活动地点'),
            (review_data['summary'], '活动总结'),
        ]
        for text, field_label in texts_to_check:
            if text and str(text).strip():
                is_safe, msg = check_text_security(
                    text,
                    g.openid,
                    scene=2,
                    title=review_data['name'],
                )
                if not is_safe:
                    return jsonify({'code': 400, 'msg': f'{field_label}{msg}'})
        # ==================== 内容安全检测结束 ====================

        # 插入主表（增加了 cover3）
        cursor.execute("""
            INSERT INTO activity_reviews
            (activity_id, name, time, location, difficulty, distance, climb, participants,
             summary, summary_time, cover, cover2, cover3, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            activity_id,
            review_data['name'], review_data['time'], review_data['location'],
            review_data['difficulty'],
            review_data['distance'],
            review_data['climb'],
            review_data['participants'],
            review_data['summary'],
            datetime.now().strftime('%Y.%m.%d %H:%M'),
            review_data['cover'],
            review_data['cover2'],
            review_data['cover3'],
            g.openid
        ))
        review_id = cursor.lastrowid

        # 插入照片墙
        photos = review_data['photos']
        for idx, photo in enumerate(photos):
            cursor.execute("""
                INSERT INTO review_photos (review_id, url, uploader, sort_order)
                VALUES (%s, %s, %s, %s)
            """, (review_id, photo['url'], photo.get('uploader', '管理员'), idx))

        conn.commit()
        return jsonify({
            'code': 200,
            'msg': '创建成功',
            'data': {'id': review_id, 'activity_id': activity_id}
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


# -------------------- 编辑活动回顾（管理员） --------------------
@review_bp.route('/<int:review_id>', methods=['PUT'])
@check_verified_and_blacklist
@check_admin
def update_review(review_id):
    data = request.get_json()
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM activity_reviews WHERE id = %s AND status = 1", (review_id,))
        if not cursor.fetchone():
            return jsonify({'code': 404, 'msg': '活动回顾不存在'})

        # ==================== 内容安全检测 ====================
        from app import check_text_security
        openid_for_check = g.openid
        texts_to_check = [
            ('name', data.get('name', ''), '回顾标题'),
            ('location', data.get('location', ''), '活动地点'),
            ('summary', data.get('summary', ''), '活动总结'),
        ]
        for field_name, text, field_label in texts_to_check:
            if text and text.strip():
                is_safe, msg = check_text_security(text, openid_for_check, scene=2, title=data.get('name', ''))
                if not is_safe:
                    return jsonify({'code': 400, 'msg': f'{field_label}{msg}'})
        # ==================== 内容安全检测结束 ====================

        # 更新主表（增加了 cover3）
        cursor.execute("""
            UPDATE activity_reviews SET
                name = %s, time = %s, location = %s,
                difficulty = %s, distance = %s, climb = %s, participants = %s,
                summary = %s, summary_time = %s, cover = %s, cover2 = %s, cover3 = %s
            WHERE id = %s
        """, (
            data['name'], data['time'], data['location'],
            data.get('difficulty', '中等'),
            data.get('distance', 0),
            data.get('climb', 0),
            data.get('participants', 0),
            data.get('summary', ''),
            datetime.now().strftime('%Y.%m.%d %H:%M'),
            data.get('cover', ''),
            data.get('cover2', ''),
            data.get('cover3', ''),   # 新增 cover3
            review_id
        ))

        # 照片墙处理：先删除旧照片，再插入新照片
        cursor.execute("DELETE FROM review_photos WHERE review_id = %s", (review_id,))
        photos = data.get('photos', [])
        for idx, photo in enumerate(photos):
            cursor.execute("""
                INSERT INTO review_photos (review_id, url, uploader, sort_order)
                VALUES (%s, %s, %s, %s)
            """, (review_id, photo['url'], photo.get('uploader', '管理员'), idx))

        conn.commit()
        return jsonify({'code': 200, 'msg': '更新成功'})
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


# -------------------- 删除活动回顾（软删除） --------------------
@review_bp.route('/<int:review_id>', methods=['DELETE'])
@check_verified_and_blacklist
@check_admin
def delete_review(review_id):
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("UPDATE activity_reviews SET status = 0 WHERE id = %s", (review_id,))
        if cursor.rowcount == 0:
            return jsonify({'code': 404, 'msg': '活动回顾不存在'})
        conn.commit()
        return jsonify({'code': 200, 'msg': '删除成功'})
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
