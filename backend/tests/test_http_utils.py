"""微信 HTTPS 配置的回归测试。"""

from pathlib import Path
import sys
import types
import unittest

try:
    import requests
except ModuleNotFoundError:
    class _RequestError(Exception):
        pass

    requests = types.SimpleNamespace(
        Session=lambda: None,
        exceptions=types.SimpleNamespace(
            SSLError=type('SSLError', (_RequestError,), {}),
            Timeout=type('Timeout', (_RequestError,), {}),
            ConnectionError=type('ConnectionError', (_RequestError,), {}),
        ),
    )
    sys.modules['requests'] = requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from http_utils import SYSTEM_CA_BUNDLE, WeChatHTTPClient, WeChatTransportError


class FakeSession:
    def __init__(self, error=None):
        self.error = error
        self.trust_env = True
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        if self.error:
            raise self.error
        return object()


class WeChatHTTPClientTests(unittest.TestCase):
    def test_uses_system_ca_and_bypasses_environment_proxy_by_default(self):
        session = FakeSession()
        client = WeChatHTTPClient(
            environ={},
            session=session,
            is_file=lambda path: path == SYSTEM_CA_BUNDLE,
        )

        client.request('GET', 'https://api.weixin.qq.com/test', timeout=10)

        self.assertFalse(session.trust_env)
        self.assertEqual(session.calls[0][2]['verify'], SYSTEM_CA_BUNDLE)

    def test_proxy_can_be_enabled_explicitly(self):
        session = FakeSession()
        client = WeChatHTTPClient(
            environ={'WX_TRUST_ENV_PROXY': '1'},
            session=session,
            is_file=lambda _: False,
        )
        self.assertTrue(session.trust_env)
        self.assertIs(client.verify, True)

    def test_ssl_error_is_sanitized(self):
        session = FakeSession(requests.exceptions.SSLError('sensitive request URL'))
        client = WeChatHTTPClient(environ={}, session=session, is_file=lambda _: False)

        with self.assertRaises(WeChatTransportError) as context:
            client.request('GET', 'https://api.weixin.qq.com/test')

        self.assertEqual(context.exception.kind, 'ssl')
        self.assertNotIn('sensitive', str(context.exception))

    def test_invalid_explicit_ca_bundle_fails_fast(self):
        with self.assertRaisesRegex(RuntimeError, '证书文件不存在'):
            WeChatHTTPClient(
                environ={'WX_CA_BUNDLE': '/missing/ca.pem'},
                session=FakeSession(),
                is_file=lambda _: False,
            )


if __name__ == '__main__':
    unittest.main()
