from functools import wraps
from flask import request, jsonify, g
from db_utils import get_db


def check_verified_and_blacklist(f):
    """验证中间件：检查用户是否已验证、是否在黑名单"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        openid = request.headers.get('X-Wx-OpenId')

        # 登录和验证接口不需要检查
        if request.path in ['/login', '/verify']:
            return f(*args, **kwargs)

        if not openid:
            return jsonify({'code': 401, 'msg': '未获取到用户身份'})

        conn = None
        cursor = None
        try:
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT verified, isBlacklist, needVerify FROM users WHERE openId = %s", (openid,))
            user = cursor.fetchone()

            if not user:
                return jsonify({'code': 404, 'msg': '用户不存在'})

            # 检查黑名单
            if user['isBlacklist'] == 1:
                return jsonify({'code': 403, 'msg': '账户已被锁定，请联系管理员'})

            # 检查是否需要验证
            if user['needVerify'] == 1 or user['verified'] == 0:
                return jsonify({'code': 401, 'msg': '请先完成验证问答', 'needVerify': True})

            g.openid = openid
            return f(*args, **kwargs)

        except Exception as e:
            return jsonify({'code': 500, 'msg': f'验证失败: {str(e)}'})
        finally:
            if cursor:
                cursor.close()

    return decorated_function


def check_admin(f):
    """管理员权限检查中间件"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        openid = request.headers.get('X-Wx-OpenId')
        if not openid:
            return jsonify({'code': 401, 'msg': '未获取到用户身份'})

        # 从数据库查询是否为管理员（建议在 users 表添加 is_admin 字段）
        # 如果没有 is_admin 字段，可以使用硬编码或单独的管理员表
        conn = None
        cursor = None
        try:
            conn = get_db()
            cursor = conn.cursor()
            # 方案1：如果 users 表有 is_admin 字段
            # cursor.execute("SELECT is_admin FROM users WHERE openId = %s", (openid,))
            # user = cursor.fetchone()
            # if not user or user.get('is_admin') != 1:
            #     return jsonify({'code': 403, 'msg': '无权限访问'})

            # 方案2：硬编码管理员列表（临时方案）
            admin_openids = ['admin_openid_1', 'admin_openid_2']  # 替换为实际的管理员openid
            if openid not in admin_openids:
                return jsonify({'code': 403, 'msg': '无权限访问'})

            return f(*args, **kwargs)
        except Exception as e:
            return jsonify({'code': 500, 'msg': f'权限检查失败: {str(e)}'})
        finally:
            if cursor:
                cursor.close()

    return decorated_function