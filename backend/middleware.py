"""
中间件模块
- check_verified_and_blacklist: 验证用户状态（含缓存）
- check_admin: 管理员权限检查（含缓存）
"""
from functools import wraps
from flask import request, jsonify, g
from db_utils import get_db
import logging
import time

# ==================== 用户状态缓存 ====================
# 简单 TTL 缓存，避免每次请求都查数据库
_cache = {}
_CACHE_TTL = 30  # 缓存 30 秒


def _get_user_cached(openid):
    """带缓存的用户查询"""
    now = time.time()
    if openid in _cache:
        entry = _cache[openid]
        if now - entry['ts'] < _CACHE_TTL:
            return entry['data']

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT verified, isBlacklist, needVerify, isAdmin, isOfficial FROM users WHERE openId = %s",
            (openid,)
        )
        user = cursor.fetchone()
        if user:
            _cache[openid] = {'data': user, 'ts': now}
        return user
    except Exception:
        logging.exception("缓存用户查询失败")
        return None
    finally:
        if cursor:
            cursor.close()


def _invalidate_user_cache(openid):
    """清除用户缓存（用户状态变更时调用）"""
    _cache.pop(openid, None)


def _clear_user_cache():
    """管理员批量修改用户状态后清空缓存。"""
    _cache.clear()


# ==================== 中间件装饰器 ====================

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

        user = _get_user_cached(openid)

        if not user:
            return jsonify({'code': 404, 'msg': '用户不存在'})

        # 检查黑名单
        if user['isBlacklist'] == 1:
            return jsonify({'code': 403, 'msg': '账户已被锁定，请联系管理员'})

        # 超级管理员和官方账号承担后台业务，均跳过普通用户验证。
        if user.get('isAdmin') == 1 or user.get('isOfficial') == 1:
            g.openid = openid
            return f(*args, **kwargs)

        # 检查是否需要验证
        if user['needVerify'] == 1 or user['verified'] == 0:
            return jsonify({'code': 401, 'msg': '请先完成验证问答', 'needVerify': True})

        g.openid = openid
        return f(*args, **kwargs)

    return decorated_function


def check_admin(f):
    """超级管理员权限检查：仅允许 isAdmin=1 的账号。"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        openid = request.headers.get('X-Wx-OpenId')
        if not openid:
            return jsonify({'code': 401, 'msg': '未获取到用户身份'})

        user = _get_user_cached(openid)

        if not user:
            return jsonify({'code': 404, 'msg': '用户不存在'})

        if user.get('isAdmin') != 1:
            return jsonify({'code': 403, 'msg': '无管理员权限'})

        return f(*args, **kwargs)

    return decorated_function


def check_staff(f):
    """业务管理权限：超级管理员或官方账号均可使用。"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        openid = request.headers.get('X-Wx-OpenId')
        if not openid:
            return jsonify({'code': 401, 'msg': '未获取到用户身份'})

        user = _get_user_cached(openid)
        if not user:
            return jsonify({'code': 404, 'msg': '用户不存在'})

        if user.get('isAdmin') != 1 and user.get('isOfficial') != 1:
            return jsonify({'code': 403, 'msg': '无业务管理权限'})

        return f(*args, **kwargs)

    return decorated_function
