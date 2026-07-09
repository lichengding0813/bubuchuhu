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
            "SELECT verified, isBlacklist, needVerify, isAdmin FROM users WHERE openId = %s",
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

        # 管理员跳过验证检查
        if user.get('isAdmin') == 1:
            g.openid = openid
            return f(*args, **kwargs)

        # 检查是否需要验证
        if user['needVerify'] == 1 or user['verified'] == 0:
            return jsonify({'code': 401, 'msg': '请先完成验证问答', 'needVerify': True})

        g.openid = openid
        return f(*args, **kwargs)

    return decorated_function


def check_admin(f):
    """管理员权限检查中间件 - 使用缓存避免重复查询"""
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
