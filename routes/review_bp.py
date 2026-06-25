from flask import Blueprint, request, jsonify, g
from datetime import datetime
from db_utils import get_db
from middleware import check_verified_and_blacklist, check_admin
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
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
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
            SELECT id, name, time, location, difficulty, distance, climb,
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
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
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
    data = request.get_json()
    required_fields = ['name', 'time', 'location']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'code': 400, 'msg': f'缺少字段: {field}'})

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

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # 插入主表（增加了 cover3）
        cursor.execute("""
            INSERT INTO activity_reviews
            (name, time, location, difficulty, distance, climb, participants,
             summary, summary_time, cover, cover2, cover3, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
            g.openid
        ))
        review_id = cursor.lastrowid

        # 插入照片墙
        photos = data.get('photos', [])
        for idx, photo in enumerate(photos):
            cursor.execute("""
                INSERT INTO review_photos (review_id, url, uploader, sort_order)
                VALUES (%s, %s, %s, %s)
            """, (review_id, photo['url'], photo.get('uploader', '管理员'), idx))

        conn.commit()
        return jsonify({'code': 200, 'msg': '创建成功', 'data': {'id': review_id}})
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
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
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
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
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()