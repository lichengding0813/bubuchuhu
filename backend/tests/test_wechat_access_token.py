"""隔离网络验证 token 复用、失效重试、图片流及订阅消息发送。"""
import ast
from concurrent.futures import ThreadPoolExecutor
import copy
import json
import logging
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock


BACKEND = Path(__file__).resolve().parents[1]
BASE = 'https://wechat.test'
CONFIG = {'WX_API_BASE': BASE, 'WX_APPID': 'test-app', 'WX_SECRET': 'test-secret'}


def response(payload):
    return SimpleNamespace(json=lambda: copy.deepcopy(payload), raise_for_status=lambda: None)


def functions(path, names, scope):
    tree = ast.parse(path.read_text())
    nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
    for node in nodes:
        node.decorator_list = []
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), 'exec'), scope)


class TokenFixture:
    def setUp(self):
        self.requests = SimpleNamespace(post=Mock(), RequestException=ConnectionError)
        tree = ast.parse((BACKEND / 'wechat_access_token.py').read_text())
        # 使用实际模块代码，替换唯一外部依赖，绝不请求生产微信接口。
        tree.body = [node for node in tree.body if not
                     (isinstance(node, ast.Import) and any(item.name == 'requests' for item in node.names))]
        self.scope = {'requests': self.requests}
        exec(compile(tree, str(BACKEND / 'wechat_access_token.py'), 'exec'), self.scope)
        self.now = 1000
        self.scope['time'] = SimpleNamespace(time=lambda: self.now)
        self.get = lambda: self.scope['get_access_token'](BASE, 'test-app', 'test-secret')
        self.call = lambda send: self.scope['call_with_access_token'](send, BASE, 'test-app', 'test-secret')
        self.invalidate = lambda token: self.scope['invalidate_access_token'](BASE, 'test-app', 'test-secret', token)

    def token_response(self, token='test-token'):
        return response({'access_token': token, 'expires_in': 7200})


class WechatTokenTests(TokenFixture, unittest.TestCase):
    def test_legacy_official_http_configuration_uses_https_and_shared_cache(self):
        self.requests.post.return_value = self.token_response()
        get = self.scope['get_access_token']
        self.assertEqual(get('http://api.weixin.qq.com/', 'test-app', 'test-secret'), 'test-token')
        self.assertEqual(get('https://api.weixin.qq.com', 'test-app', 'test-secret'), 'test-token')
        self.assertEqual(self.requests.post.call_count, 1)
        self.assertEqual(self.requests.post.call_args.args[0], 'https://api.weixin.qq.com/cgi-bin/stable_token')

    def test_stable_token_is_cached_and_never_force_refreshed(self):
        self.requests.post.return_value = self.token_response()
        self.assertEqual(self.get(), 'test-token')
        self.assertEqual(self.get(), 'test-token')
        self.requests.post.assert_called_once_with(BASE + '/cgi-bin/stable_token', json={
            'grant_type': 'client_credential', 'appid': 'test-app', 'secret': 'test-secret', 'force_refresh': False,
        }, timeout=10)

    def test_expiry_refresh_uses_server_lifetime(self):
        self.requests.post.side_effect = [response({'access_token': 'old', 'expires_in': 600}), self.token_response('new')]
        self.assertEqual(self.get(), 'old')
        self.now += 301
        self.assertEqual(self.get(), 'new')

    def test_expired_token_error_refreshes_and_retries_exactly_once(self):
        for code in (40001, 40014, 42001):
            with self.subTest(code=code):
                self.scope['_cache'].clear()
                self.requests.post.reset_mock()
                self.requests.post.side_effect = [self.token_response('old'), self.token_response('new')]
                send = Mock(side_effect=[{'errcode': code}, {'errcode': 0}])
                self.assertEqual(self.call(send), {'errcode': 0})
                self.assertEqual([c.args[0] for c in send.call_args_list], ['old', 'new'])
                self.assertEqual(self.requests.post.call_count, 2)

    def test_persistent_token_error_is_bounded_and_invalidates_last_token(self):
        self.requests.post.side_effect = [self.token_response('old'), self.token_response('new'), self.token_response('third')]
        send = Mock(return_value={'errcode': 40001})
        self.assertEqual(self.call(send), {'errcode': 40001})
        self.assertEqual(send.call_count, 2)
        self.assertEqual(self.get(), 'third')

    def test_other_errors_and_network_failure_are_not_retried(self):
        self.requests.post.return_value = self.token_response()
        for code in (87014, 45009, 43101):
            send = Mock(return_value={'errcode': code})
            self.assertEqual(self.call(send), {'errcode': code})
            send.assert_called_once()
        send = Mock(side_effect=ConnectionError('simulated timeout'))
        with self.assertRaises(ConnectionError):
            self.call(send)
        send.assert_called_once()

    def test_old_failed_response_cannot_evict_new_token(self):
        self.requests.post.side_effect = [self.token_response('old'), self.token_response('new')]
        self.get()
        self.invalidate('old')
        self.assertEqual(self.get(), 'new')
        self.invalidate('old')
        self.assertEqual(self.get(), 'new')
        self.assertEqual(self.requests.post.call_count, 2)

    def test_concurrent_callers_share_one_token_fetch(self):
        self.requests.post.return_value = self.token_response()
        with ThreadPoolExecutor(max_workers=8) as workers:
            results = list(workers.map(lambda _: self.get(), range(16)))
        self.assertEqual(results, ['test-token'] * 16)
        self.requests.post.assert_called_once()

    def test_token_failure_does_not_cache_or_expose_response_details(self):
        self.requests.post.return_value = response({'errcode': 40125, 'errmsg': 'test-secret private details'})
        with self.assertRaisesRegex(RuntimeError, '40125') as error:
            self.get()
        self.assertNotIn('test-secret', str(error.exception))
        self.assertEqual(self.scope['_cache'], {})


class WechatSecurityFlowTests(TokenFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.app_scope = {
            'app': SimpleNamespace(config=CONFIG.copy()), 'requests': self.requests,
            'call_with_access_token': self.scope['call_with_access_token'], 'logging': logging, 'os': os,
            'api_base_url': self.scope['api_base_url'],
        }
        functions(BACKEND / 'app.py', {'check_text_security', 'check_image_security', 'check_image_url'}, self.app_scope)

    def test_text_refresh_then_risky_result_is_rejected(self):
        self.requests.post.side_effect = [self.token_response('old'), response({'errcode': 40001}),
                                         self.token_response('new'), response({'errcode': 0, 'result': {'suggest': 'risky', 'label': 100}})]
        result = self.app_scope['check_text_security']('测试文本', 'test-only', scene=2, title='题目')
        self.assertFalse(result[0])
        self.assertIn('违规', result[1])
        calls = self.requests.post.call_args_list
        self.assertEqual(calls[1].kwargs['params'], {'access_token': 'old'})
        self.assertEqual(calls[3].kwargs['params'], {'access_token': 'new'})
        self.assertEqual(calls[1].kwargs['json'], calls[3].kwargs['json'])
        self.assertEqual(calls[3].kwargs['json']['scene'], 2)

    def test_image_retry_reopens_full_file_and_cleans_temporary_file(self):
        image = b'test-image-bytes'
        uploaded, paths = [], []
        tokens = iter(('old', 'new'))

        def post(url, **kwargs):
            if url.endswith('/stable_token'):
                return self.token_response(next(tokens))
            media = kwargs['files']['media']
            uploaded.append((kwargs['params']['access_token'], media.read()))
            paths.append(media.name)
            return response({'errcode': 40001 if len(uploaded) == 1 else 0})

        self.requests.post.side_effect = post
        self.assertEqual(self.app_scope['check_image_security'](image, 'test-only'), (True, ''))
        self.assertEqual(uploaded, [('old', image), ('new', image)])
        self.assertTrue(all(not Path(path).exists() for path in paths))

    def test_persistent_token_error_is_not_reported_as_detection_success(self):
        for name, content in [('check_text_security', '测试文本'), ('check_image_security', b'test-image')]:
            with self.subTest(name=name):
                self.scope['_cache'].clear()
                self.requests.post.side_effect = [self.token_response('old'), response({'errcode': 40001}),
                                                 self.token_response('new'), response({'errcode': 40001})]
                with self.assertLogs(level='WARNING'):
                    passed, message = self.app_scope[name](content, 'test-only')
                self.assertFalse(passed)
                self.assertIn('稍后重试', message)

    def test_network_or_token_acquisition_failure_does_not_skip_detection(self):
        for result in (ConnectionError('simulated timeout'), response({'errcode': 40125})):
            for name, content in [('check_text_security', '测试文本'), ('check_image_security', b'test-image')]:
                self.scope['_cache'].clear()
                self.requests.post.side_effect = [result]
                with self.assertLogs(level='ERROR'):
                    passed, message = self.app_scope[name](content, 'test-only')
                self.assertFalse(passed)
                self.assertIn('稍后重试', message)

    def test_text_pass_empty_content_and_explicit_rejection(self):
        self.assertEqual(self.app_scope['check_text_security']('  ', 'test-only'), (True, ''))
        self.requests.post.assert_not_called()
        self.requests.post.side_effect = [self.token_response(), response({'errcode': 0, 'result': {'suggest': 'pass'}}),
                                         response({'errcode': 87014})]
        self.assertEqual(self.app_scope['check_text_security']('测试文本', 'test-only'), (True, ''))
        self.assertFalse(self.app_scope['check_text_security']('测试文本', 'test-only')[0])

    def test_image_route_returns_failure_instead_of_detection_passed(self):
        self.requests.post.return_value = response({'errcode': 40125})
        self.app_scope.update({'g': SimpleNamespace(openid='test-only'), 'jsonify': lambda result: result,
                               'request': SimpleNamespace(get_json=lambda silent=True: {'url': 'https://image.test/a.png'}),
                               '_download_allowed_image': lambda _: b'test-image'})
        with self.assertLogs(level='ERROR'):
            result = self.app_scope['check_image_url']()
        self.assertEqual(result['code'], 400)
        self.assertIn('稍后重试', result['msg'])

    def test_notification_retries_only_rejected_token_and_keeps_message(self):
        scope = {'requests': self.requests, 'call_with_access_token': self.scope['call_with_access_token'],
                 'api_base_url': self.scope['api_base_url'],
                 'WX_API_BASE': BASE, 'WX_APPID': 'test-app', 'WX_SECRET': 'test-secret', 'json': json, 'os': os}
        functions(BACKEND / 'notification_service.py', {'_send_job'}, scope)
        self.requests.post.side_effect = [self.token_response('old'), response({'errcode': 40001}),
                                         self.token_response('new'), response({'errcode': 0})]
        job = {'recipient_openid': 'test-only', 'template_id': 'test-template', 'page_path': 'pages/details/details?id=1',
               'payload_json': json.dumps({'thing1': {'value': '活动提醒'}})}
        self.assertEqual(scope['_send_job'](job), {'errcode': 0})
        calls = self.requests.post.call_args_list
        self.assertEqual(calls[1].kwargs['json'], calls[3].kwargs['json'])
        self.assertEqual(calls[3].kwargs['json']['touser'], 'test-only')
        # 内容检测继续复用同一份 token，不再次取 token 或影响订阅额度。
        self.requests.post.side_effect = None
        self.requests.post.return_value = response({'errcode': 0, 'result': {'suggest': 'pass'}})
        self.assertEqual(self.app_scope['check_text_security']('测试文本', 'test-only'), (True, ''))
        self.assertEqual(self.requests.post.call_count, 5)


if __name__ == '__main__':
    unittest.main()
