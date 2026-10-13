"""隔离执行验证题读取、图片配置和答题路由，验证确认快照不误扣次数。"""
import ast
import logging
from pathlib import Path
import random
import sqlite3
import sys
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verification_domain import DEFAULT_QUESTION_IMAGE, normalize_question_image, question_metadata, question_submission_changed
from test_achievement_settlement import SqliteCursor


class Cursor(SqliteCursor):
    def close(self):
        self.cursor.close()


class VerificationFlowTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.addCleanup(self.db.close)
        self.db.executescript('''
            CREATE TABLE verify_questions (id INTEGER PRIMARY KEY, question TEXT, answers TEXT,
                image_url TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
                created_at TEXT, updated_at TEXT);
            INSERT INTO verify_questions (id, question, answers, image_url, sort_order) VALUES
                (1, '当前题目', '正确答案,另一个答案', '', 1),
                (2, '换一道题', '新答案', 'cloud://prod/second.png', 2);
            CREATE TABLE users (openId TEXT PRIMARY KEY, isBlacklist INTEGER DEFAULT 0,
                needVerify INTEGER DEFAULT 1, verified INTEGER DEFAULT 0, verifyAttempts INTEGER DEFAULT 0,
                blacklistSource TEXT, blacklistedAt TEXT, blacklistedBy TEXT);
            INSERT INTO users (openId) VALUES ('user');
            CREATE TABLE verification_attempt_logs (user_openid TEXT, question_id INTEGER,
                question_text TEXT, submitted_answer TEXT, is_correct INTEGER, created_at TEXT);
        ''')
        self.db.commit()
        self.payload = {}
        self.connection = SimpleNamespace(cursor=lambda: Cursor(self.db), commit=self.db.commit, rollback=self.db.rollback)
        self.scope = {
            'get_db': lambda: self.connection, 'jsonify': lambda value: value,
            'request': SimpleNamespace(get_json=lambda silent=True: self.payload, headers={'X-Wx-OpenId': 'user'}),
            'logging': logging, 'random': random,
            'question_metadata': question_metadata, 'question_submission_changed': question_submission_changed,
            'normalize_question_image': normalize_question_image,
            'queue_blacklist_notice': lambda *args: None, '_invalidate_user_cache': lambda *args: None,
        }
        backend = Path(__file__).resolve().parents[1]
        for path, names in [(backend / 'app.py', {'get_verify_questions', 'verify_answer'}),
                            (backend / 'routes/admin_routes.py', {'get_verify_questions', 'add_verify_question', 'update_verify_question'})]:
            module = ast.parse(path.read_text())
            functions = [node for node in module.body if isinstance(node, ast.FunctionDef) and node.name in names]
            for node in functions:
                node.decorator_list = []
            if path.name == 'admin_routes.py':
                # 管理和公开读取同名，保存公开读取供答题路由调用。
                self.public_questions = self.scope['get_verify_questions']
            exec(compile(ast.Module(body=functions, type_ignores=[]), str(path), 'exec'), self.scope)
        self.admin_questions = self.scope['get_verify_questions']
        self.scope['get_verify_questions'] = self.public_questions

    def verify(self, answer='正确答案', text='当前题目', question_id=1):
        self.payload = {'answer': answer, 'question_idx': question_id, 'question_text': text}
        return self.scope['verify_answer']()

    def attempts(self):
        return self.db.execute('SELECT verifyAttempts FROM users').fetchone()[0]

    def logs(self):
        return self.db.execute('SELECT COUNT(*) FROM verification_attempt_logs').fetchone()[0]

    def test_existing_questions_use_default_and_custom_image_metadata(self):
        questions = self.public_questions()
        self.assertEqual(question_metadata(questions[0])['verifyQuestionImage'], DEFAULT_QUESTION_IMAGE)
        self.assertEqual(question_metadata(questions[1])['verifyQuestionImage'], 'cloud://prod/second.png')
        self.assertEqual(self.admin_questions()['data'][1]['image_url'], 'cloud://prod/second.png')

    def test_image_validation_allows_default_and_cloud_files_only(self):
        self.assertEqual(normalize_question_image(''), DEFAULT_QUESTION_IMAGE)
        self.assertEqual(normalize_question_image(' cloud://prod/one.png '), 'cloud://prod/one.png')
        for value in (None, 123, 'https://example.com/image.png', 'cloud://' + 'a' * 500):
            with self.subTest(value=str(value)[:30]), self.assertRaises(ValueError):
                normalize_question_image(value)

    def test_changed_text_does_not_consume_attempt_or_record_wrong_answer(self):
        response = self.verify(text='用户此前看到的旧题目')
        self.assertEqual(response['code'], 409)
        self.assertEqual(response['verifyQuestion'], '当前题目')
        self.assertEqual(response['verifyQuestionImage'], DEFAULT_QUESTION_IMAGE)
        self.assertEqual(self.attempts(), 0)
        self.assertEqual(self.logs(), 0)

    def test_deleted_or_disabled_question_returns_fresh_question_without_penalty(self):
        self.db.execute('UPDATE verify_questions SET is_active = 0 WHERE id = 1')
        response = self.verify()
        self.assertEqual(response['code'], 409)
        self.assertEqual(response['verifyQuestionIdx'], 2)
        self.assertEqual(response['verifyQuestionImage'], 'cloud://prod/second.png')
        self.assertEqual(self.attempts(), 0)
        self.assertEqual(self.logs(), 0)

    def test_confirmed_current_question_is_verified(self):
        response = self.verify()
        self.assertEqual(response['code'], 200)
        self.assertEqual(response['data']['needVerify'], 0)
        self.assertEqual(response['data']['verified'], 1)
        self.assertEqual(self.logs(), 1)

    def test_wrong_answer_uses_original_three_attempt_rule_and_new_picture(self):
        original = self.scope['random']
        self.scope['random'] = SimpleNamespace(choice=lambda rows: next(row for row in rows if row['id'] == 2))
        try:
            response = self.verify(answer='错误答案')
        finally:
            self.scope['random'] = original
        self.assertEqual(self.attempts(), 1)
        self.assertEqual(self.logs(), 1)
        self.assertEqual(response['verifyQuestionIdx'], 2)
        self.assertEqual(response['verifyQuestionImage'], 'cloud://prod/second.png')
        for _ in range(2):
            response = self.verify(answer='错误答案')
        self.assertEqual(response['data']['isBlacklist'], 1)
        self.assertEqual(self.attempts(), 3)

    def test_previous_client_without_question_snapshot_still_works(self):
        self.payload = {'answer': '正确答案', 'question_idx': 1}
        response = self.scope['verify_answer']()
        self.assertEqual(response['data']['verified'], 1)

    def test_new_question_default_and_image_edit_toggle_preserves_picture(self):
        self.payload = {'question': '新题', 'answers': '答案'}
        self.assertEqual(self.scope['add_verify_question']()['code'], 200)
        image = self.db.execute("SELECT image_url FROM verify_questions WHERE question='新题'").fetchone()[0]
        self.assertEqual(image, DEFAULT_QUESTION_IMAGE)
        self.payload = {'question': '当前题目', 'answers': '正确答案', 'image_url': 'cloud://prod/replaced.png'}
        self.assertEqual(self.scope['update_verify_question'](1)['code'], 200)
        self.payload = {'question': '当前题目', 'answers': '正确答案', 'is_active': 0}
        self.assertEqual(self.scope['update_verify_question'](1)['code'], 200)
        self.assertEqual(self.db.execute('SELECT image_url FROM verify_questions WHERE id=1').fetchone()[0], 'cloud://prod/replaced.png')
        self.payload = {'question': '当前题目', 'answers': '正确答案', 'image_url': ''}
        self.assertEqual(self.scope['update_verify_question'](1)['code'], 200)
        self.assertEqual(self.db.execute('SELECT image_url FROM verify_questions WHERE id=1').fetchone()[0], DEFAULT_QUESTION_IMAGE)

    def test_bad_image_url_does_not_change_question(self):
        self.payload = {'question': '恶意变更', 'answers': '答案', 'image_url': 'https://example.com/remote.png'}
        self.assertEqual(self.scope['update_verify_question'](1)['code'], 400)
        self.assertEqual(self.db.execute('SELECT question FROM verify_questions WHERE id=1').fetchone()[0], '当前题目')

    def test_image_initialization_is_rerunnable_without_replacing_custom_pictures(self):
        source = (Path(__file__).resolve().parents[1] / 'migration_20261013_verify_question_images.sql').read_text()
        statement = source[source.index('UPDATE verify_questions'):source.index(';', source.index('UPDATE verify_questions'))]
        statement = statement.replace('@default_verify_image', '?')
        self.db.execute(statement, (DEFAULT_QUESTION_IMAGE,))
        self.assertEqual(self.db.execute('SELECT image_url FROM verify_questions WHERE id=1').fetchone()[0], DEFAULT_QUESTION_IMAGE)
        self.db.execute("UPDATE verify_questions SET image_url='cloud://prod/user-replacement.png' WHERE id=1")
        self.db.execute(statement, (DEFAULT_QUESTION_IMAGE,))
        self.assertEqual([row[0] for row in self.db.execute('SELECT image_url FROM verify_questions ORDER BY id')],
                         ['cloud://prod/user-replacement.png', 'cloud://prod/second.png'])

    def test_old_schema_keeps_current_questions_before_image_migration(self):
        self.db.execute('ALTER TABLE verify_questions DROP COLUMN image_url')
        class OldCursor(Cursor):
            def execute(self, sql, params=()):
                try:
                    return super().execute(sql, params)
                except sqlite3.OperationalError as exc:
                    if 'no such column: image_url' in str(exc):
                        raise Exception(1054, 'unknown column') from exc
                    raise
        self.connection.cursor = lambda: OldCursor(self.db)
        questions = self.public_questions()
        self.assertEqual(questions[0]['question'], '当前题目')
        self.assertEqual(questions[0]['answers'], ['正确答案', '另一个答案'])
        self.assertEqual(question_metadata(questions[0])['verifyQuestionImage'], DEFAULT_QUESTION_IMAGE)


if __name__ == '__main__':
    unittest.main()
