"""微信 API HTTPS 客户端配置。"""

import os

import requests


SYSTEM_CA_BUNDLE = '/etc/ssl/certs/ca-certificates.crt'


def _env_flag(environ, name, default=False):
    value = environ.get(name)
    if value is None:
        return default
    return str(value).strip().lower() in ('1', 'true', 'yes', 'on')


class WeChatTransportError(RuntimeError):
    """不携带请求 URL、code 或密钥的微信传输层异常。"""

    def __init__(self, kind):
        super().__init__(kind)
        self.kind = kind


class WeChatHTTPClient:
    """为微信接口固定证书链，并避免继承异常的环境代理。"""

    def __init__(self, environ=None, session=None, is_file=None):
        environ = environ if environ is not None else os.environ
        is_file = is_file if is_file is not None else os.path.isfile

        configured_bundle = str(environ.get('WX_CA_BUNDLE', '')).strip()
        if configured_bundle:
            if not is_file(configured_bundle):
                raise RuntimeError('WX_CA_BUNDLE 指向的证书文件不存在')
            self.verify = configured_bundle
        elif is_file(SYSTEM_CA_BUNDLE):
            self.verify = SYSTEM_CA_BUNDLE
        else:
            # 本地开发环境没有 Debian 系统证书路径时，交回 requests/certifi。
            self.verify = True

        self.session = session or requests.Session()
        # api.weixin.qq.com 不需要业务代理。默认绕开 HTTPS_PROXY 等环境变量，
        # 防止云运行环境中的自签名代理证书劫持微信登录请求。
        self.session.trust_env = _env_flag(environ, 'WX_TRUST_ENV_PROXY', False)

    def request(self, method, url, **kwargs):
        kwargs.setdefault('verify', self.verify)
        try:
            return self.session.request(method, url, **kwargs)
        except requests.exceptions.SSLError:
            raise WeChatTransportError('ssl') from None
        except requests.exceptions.Timeout:
            raise WeChatTransportError('timeout') from None
        except requests.exceptions.ConnectionError:
            raise WeChatTransportError('connection') from None
