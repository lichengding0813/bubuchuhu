"""内容检测与订阅消息共用稳定版 token，失效后最多重试一次。"""
import threading
import time

import requests


TOKEN_INVALID_CODES = {40001, 40014, 42001}
_cache = {}
_lock = threading.Lock()


def api_base_url(api_base):
    base = api_base.rstrip('/')
    return 'https://api.weixin.qq.com' if base == 'http://api.weixin.qq.com' else base


def _cache_key(api_base, appid, secret):
    return (api_base_url(api_base), appid, secret)


def get_access_token(api_base, appid, secret):
    key = _cache_key(api_base, appid, secret)
    with _lock:
        now = time.time()
        cached = _cache.get(key)
        if cached and cached['expires_at'] > now + 300:
            return cached['token']

        response = requests.post(f'{key[0]}/cgi-bin/stable_token', json={
            'grant_type': 'client_credential',
            'appid': appid,
            'secret': secret,
            'force_refresh': False,
        }, timeout=10)
        response.raise_for_status()
        result = response.json()
        token = result.get('access_token')
        if not token:
            # 只记录错误码，不把微信响应中的凭证或请求地址写入日志。
            raise RuntimeError(f"获取access_token失败，错误码：{result.get('errcode')}")
        _cache[key] = {
            'token': token,
            'expires_at': now + int(result.get('expires_in') or 7200),
        }
        return token


def invalidate_access_token(api_base, appid, secret, rejected_token):
    key = _cache_key(api_base, appid, secret)
    with _lock:
        cached = _cache.get(key)
        # 过期请求不能清掉其他线程刚取得的新 token。
        if cached and cached['token'] == rejected_token:
            _cache.pop(key, None)


def call_with_access_token(send, api_base, appid, secret):
    token = get_access_token(api_base, appid, secret)
    result = send(token)
    if result.get('errcode') not in TOKEN_INVALID_CODES:
        return result

    invalidate_access_token(api_base, appid, secret, token)
    token = get_access_token(api_base, appid, secret)
    result = send(token)
    if result.get('errcode') in TOKEN_INVALID_CODES:
        invalidate_access_token(api_base, appid, secret, token)
    return result
