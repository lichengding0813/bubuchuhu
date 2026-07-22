from flask import Flask, request, jsonify, g
from flask.json.provider import DefaultJSONProvider
import requests
from datetime import datetime
import os
import random
import time
import logging

from dotenv import load_dotenv
load_dotenv()

# 强制进程时区为北京时间，与 db_utils 中 SET time_zone='+8:00' 对齐，
# 避免 datetime.now() 使用容器默认 UTC 导致时间字段差 8 小时
os.environ.setdefault('TZ', 'Asia/Shanghai')
try:
    time.tzset()
except AttributeError:
    pass  # Windows 无 tzset，部署环境为 Linux 不受影响

# ==================== 集中配置 ====================
from config import (
    DB_CONFIG, WX_APPID, WX_SECRET, WX_API_BASE,
    DEFAULT_AVATAR, UPLOAD_FOLDER, MAX_CONTENT_LENGTH, FLASK_DEBUG,
    validate_config,
)

# 启动时校验必要配置
try:
    validate_config()
except RuntimeError as e:
    logging.critical(f"配置验证失败: {e}")
    raise

# ==================== 验证问题（从数据库动态加载） ====================
def get_verify_questions():
    """从数据库获取启用的验证问题列表"""
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, question, answers FROM verify_questions WHERE is_active = 1 ORDER BY sort_order ASC"
        )
        rows = cursor.fetchall()
        if not rows:
            # 数据库无数据时回退到内置问题（防止表未初始化导致登录失败）
            return [
                {'id': 0, 'question': '你问我全世界是哪里最美？答案是——', 'answers': ['你身边']},
                {'id': 1, 'question': '玛莎的全名是？', 'answers': ['蔡升晏']},
            ]
        return [{
            'id': row['id'],
            'question': row['question'],
            'answers': [a.strip() for a in row['answers'].split(',')]
        } for row in rows]
    except Exception:
        logging.exception("加载验证问题失败，使用内置问题")
        return [
            {'id': 0, 'question': '你问我全世界是哪里最美？答案是——', 'answers': ['你身边']},
            {'id': 1, 'question': '玛莎的全名是？', 'answers': ['蔡升晏']},
        ]
    finally:
        if cursor:
            cursor.close()
        # 不关闭 conn —— 由 Flask 请求级 teardown (close_db) 统一归还连接池
        # 提前 close 会导致 g.db 指向已归还的失效连接，后续 get_db() 拿到的是坏连接

# ==================== 导入路由蓝图 ====================
from routes.activity_routes import activity_bp
from routes.admin_routes import admin_bp
from routes.review_bp import review_bp
from db_utils import init_db_config, close_db, get_db

# ==================== 自定义 JSON 序列化 ====================
class BeijingTimeJSONProvider(DefaultJSONProvider):
    def default(self, o):
        if isinstance(o, datetime):
            return o.strftime('%Y-%m-%d %H:%M:%S')
        return super().default(o)

app = Flask(__name__)
app.json = BeijingTimeJSONProvider(app)

# ==================== 注入配置 ====================
app.config['DB_CONFIG'] = DB_CONFIG
init_db_config(DB_CONFIG)

app.config['WX_APPID'] = WX_APPID
app.config['WX_SECRET'] = WX_SECRET
app.config['WX_API_BASE'] = WX_API_BASE
app.config['DEFAULT_AVATAR'] = DEFAULT_AVATAR
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# ==================== 速率限制 ====================
# 注意：云托管环境下所有请求经过同一代理，get_remote_address() 对所有人相同。
# 因此 default_limits 使用全局配额会导致误伤，改为仅对特定路由精确限流。
# 使用 X-Forwarded-For 获取真实客户端 IP（云托管代理会设置此头）。
try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address

    def get_openid_key():
        """优先使用 openId 区分用户，否则用真实 IP（云托管代理提供的 X-Forwarded-For）"""
        return (request.headers.get('X-Wx-OpenId')
                or request.headers.get('X-Forwarded-For')
                or get_remote_address())

    limiter = Limiter(
        key_func=get_openid_key,
        app=app,
        default_limits=[],  # 不设全局默认限制，仅对关键路由精确限流
        storage_uri="memory://",
    )
    logging.info("速率限制器已启用")
except ImportError:
    limiter = None
    logging.warning("flask_limiter 未安装，速率限制已禁用。安装: pip install flask-limiter")

# ==================== access_token 缓存 ====================
_access_token_cache = {
    'token': None,
    'expires_at': 0
}

def get_access_token():
    """获取微信接口调用凭据 access_token，带内存缓存"""
    now = time.time()
    if _access_token_cache['token'] and _access_token_cache['expires_at'] > now + 300:
        return _access_token_cache['token']

    try:
        base_url = app.config.get('WX_API_BASE', 'https://api.weixin.qq.com')
        url = f'{base_url}/cgi-bin/token'
        params = {
            'grant_type': 'client_credential',
            'appid': app.config['WX_APPID'],
            'secret': app.config['WX_SECRET']
        }
        res = requests.get(url, params=params, timeout=10)
        data = res.json()

        if 'access_token' not in data:
            logging.error(f"获取access_token失败: {data}")
            return None

        _access_token_cache['token'] = data['access_token']
        _access_token_cache['expires_at'] = now + data.get('expires_in', 7200)
        return data['access_token']
    except Exception as e:
        logging.error(f"获取access_token异常: {e}")
        return None


def check_text_security(content, openid, scene=1, title=''):
    """调用微信 security.msgSecCheck 检测文本内容是否合规"""
    if not content or not content.strip():
        return True, ''

    access_token = get_access_token()
    if not access_token:
        logging.warning("access_token获取失败，跳过内容安全检测")
        return True, ''

    try:
        base_url = app.config.get('WX_API_BASE', 'https://api.weixin.qq.com')
        url = f'{base_url}/wxa/msg_sec_check?access_token={access_token}'
        body = {
            'content': content,
            'version': 2,
            'scene': scene,
            'openid': openid
        }
        if title:
            body['title'] = title

        res = requests.post(url, json=body, timeout=10)
        data = res.json()

        if data.get('errcode') == 0:
            result = data.get('result', {})
            suggest = result.get('suggest', '')
            if suggest == 'risky':
                label = result.get('label', 100)
                return False, f'内容包含违规信息(类型{label})，请修改后重新提交'
            return True, ''
        elif data.get('errcode') == 87014:
            return False, '内容含有违法违规内容，请修改后重新提交'
        else:
            logging.warning(f"内容安全检测接口返回: {data}")
            return True, ''
    except Exception as e:
        logging.error(f"内容安全检测异常: {e}")
        return True, ''


def check_image_security(image_data, openid):
    """调用微信 security.imgSecCheck 检测图片内容是否合规"""
    if not image_data:
        return True, ''

    access_token = get_access_token()
    if not access_token:
        logging.warning("access_token获取失败，跳过图片安全检测")
        return True, ''

    import tempfile
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
            f.write(image_data)
            temp_path = f.name

        base_url = app.config.get('WX_API_BASE', 'https://api.weixin.qq.com')
        url = f'{base_url}/wxa/img_sec_check?access_token={access_token}'
        with open(temp_path, 'rb') as f:
            res = requests.post(url, files={'media': f}, timeout=30)

        data = res.json()
        if data.get('errcode') == 0:
            return True, ''
        elif data.get('errcode') == 87014:
            return False, '图片包含违规内容，请更换图片后重新提交'
        else:
            logging.warning(f"图片安全检测接口返回: {data}")
            return True, ''
    except Exception as e:
        logging.error(f"图片安全检测异常: {e}")
        return True, ''
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except Exception:
                pass


# ==================== 通用错误响应 ====================
def error_response(code, msg, internal_msg=None):
    """统一错误响应格式，生产环境不泄露内部错误"""
    if internal_msg:
        logging.error(f"[{code}] {internal_msg}")
    # 500 错误不在响应中暴露细节
    if code == 500:
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    return jsonify({'code': code, 'msg': msg})


# ==================== 图片安全检测（通过云存储 URL） ====================
@app.route('/check-image-url', methods=['POST'])
def check_image_url():
    """前端上传图片到云存储后，用文件URL调用后端检测"""
    openid = request.headers.get('X-Wx-OpenId')
    if not openid:
        return jsonify({'code': 401, 'msg': '未获取到用户身份'})

    data = request.get_json()
    file_url = data.get('url', '')
    if not file_url:
        return jsonify({'code': 400, 'msg': '缺少图片URL'})

    try:
        res = requests.get(file_url, timeout=30)
        if res.status_code != 200:
            return jsonify({'code': 400, 'msg': '图片下载失败'})

        image_data = res.content
        if len(image_data) > 10 * 1024 * 1024:
            return jsonify({'code': 400, 'msg': '图片大小不能超过10MB'})
    except Exception:
        logging.exception("下载图片失败")
        return jsonify({'code': 400, 'msg': '图片下载失败'})

    is_safe, msg = check_image_security(image_data, openid)
    if not is_safe:
        return jsonify({'code': 400, 'msg': msg})

    return jsonify({'code': 200, 'msg': '图片检测通过'})


# ==================== 注册蓝图 ====================
app.register_blueprint(activity_bp, url_prefix='/api/activity')
app.register_blueprint(admin_bp, url_prefix='/api/admin')
app.register_blueprint(review_bp)


# ==================== 数据库连接钩子 ====================
@app.teardown_appcontext
def teardown_db(e=None):
    close_db(e)


# ==================== 条件速率限制装饰器 ====================
def rate_limit(limit_string):
    """条件装饰器：仅在 limiter 可用时应用速率限制"""
    if limiter is not None:
        return limiter.limit(limit_string)
    else:
        def noop_dec(f):
            return f
        return noop_dec


# ==================== 登录/注册 ====================
@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    code = data.get('code')

    if not code:
        return jsonify({'code': 400, 'msg': '缺少code参数'})

    try:
        base_url = app.config.get('WX_API_BASE', 'https://api.weixin.qq.com')
        url = f'{base_url}/sns/jscode2session'
        params = {
            'appid': app.config['WX_APPID'],
            'secret': app.config['WX_SECRET'],
            'js_code': code,
            'grant_type': 'authorization_code'
        }
        res = requests.get(url, params=params, timeout=10)
        wx_data = res.json()

        if 'openid' not in wx_data:
            logging.error(f"微信登录失败: errcode={wx_data.get('errcode')}, errmsg={wx_data.get('errmsg')}")
            return jsonify({'code': 401, 'msg': '微信登录失败，请重试'})

        openid = wx_data['openid']
    except requests.exceptions.SSLError as e:
        logging.error(f"微信API SSL证书验证失败（Docker镜像可能缺少CA证书）: {e}")
        return jsonify({'code': 500, 'msg': '服务暂时不可用，请稍后重试'})
    except requests.exceptions.Timeout:
        logging.error("微信API请求超时")
        return jsonify({'code': 500, 'msg': '服务暂时不可用，请稍后重试'})
    except requests.exceptions.ConnectionError as e:
        logging.error(f"微信API连接失败（网络/DNS问题）: {e}")
        return jsonify({'code': 500, 'msg': '服务暂时不可用，请稍后重试'})
    except Exception:
        logging.exception("调用微信接口失败")
        return jsonify({'code': 500, 'msg': '服务暂时不可用，请稍后重试'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE openId = %s", (openid,))
        user = cursor.fetchone()
        now = datetime.now()

        if user:
            cursor.execute(
                "UPDATE users SET loginCount = loginCount + 1, lastLoginTime = %s WHERE openId = %s",
                (now, openid)
            )
            conn.commit()
            cursor.execute("SELECT * FROM users WHERE openId = %s", (openid,))
            user = cursor.fetchone()

            response_data = {'code': 200, 'msg': '登录成功', 'data': user}
            if user.get('needVerify') == 1 and user.get('isBlacklist') == 0:
                questions = get_verify_questions()
                q = random.choice(questions)
                response_data['verifyQuestion'] = q['question']
                response_data['verifyQuestionIdx'] = q['id']

            return jsonify(response_data)
        else:
            nickname = f"魔魔胡胡胡蘿蔔{openid[-4:] if len(openid) >= 4 else '0000'}"
            avatar = app.config.get('DEFAULT_AVATAR', '')
            cursor.execute("""
                INSERT INTO users (
                    openId, nickName, avatarUrl, phoneNumber, loginCount,
                    isBlacklist, verifyAttempts, needVerify, verified,
                    createTime, lastLoginTime
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (openid, nickname, avatar, '', 1, 0, 0, 1, 0, now, now))
            conn.commit()
            cursor.execute("SELECT * FROM users WHERE openId = %s", (openid,))
            user = cursor.fetchone()

            response_data = {'code': 200, 'msg': '注册成功', 'data': user}
            if user.get('needVerify') == 1 and user.get('isBlacklist') == 0:
                questions = get_verify_questions()
                q = random.choice(questions)
                response_data['verifyQuestion'] = q['question']
                response_data['verifyQuestionIdx'] = q['id']

            return jsonify(response_data)

    except Exception:
        if conn:
            conn.rollback()
        logging.exception("登录过程数据库错误")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


# ==================== 验证答案接口 ====================
@app.route('/verify', methods=['POST'])
def verify_answer():
    openid = request.headers.get('X-Wx-OpenId')
    if not openid:
        return jsonify({'code': 401, 'msg': '未获取到用户身份'})

    data = request.get_json()
    answer = data.get('answer')
    if not answer:
        return jsonify({'code': 400, 'msg': '缺少answer参数'})

    question_idx = data.get('question_idx', 0)
    questions = get_verify_questions()
    # 按 id 查找对应的问题
    matched_q = next((q for q in questions if q['id'] == question_idx), None)
    if matched_q:
        correct_answers = matched_q['answers']
        current_question = matched_q
    else:
        correct_answers = ['大鸡腿']
        current_question = None

    answer_trimmed = answer.strip()
    is_correct = any(answer_trimmed == ans or answer_trimmed.lower() == ans.lower()
                     for ans in correct_answers)

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE openId = %s", (openid,))
        user = cursor.fetchone()
        if not user:
            return jsonify({'code': 404, 'msg': '用户不存在'})

        if user['isBlacklist'] == 1:
            return jsonify({'code': 403, 'msg': '账户已被锁定', 'data': user})

        if is_correct:
            cursor.execute(
                "UPDATE users SET needVerify = 0, verified = 1, verifyAttempts = 0 WHERE openId = %s",
                (openid,)
            )
            conn.commit()
            msg = '验证通过'
        else:
            new_attempt = user['verifyAttempts'] + 1
            if new_attempt >= 3:
                cursor.execute(
                    "UPDATE users SET verifyAttempts = %s, isBlacklist = 1 WHERE openId = %s",
                    (new_attempt, openid)
                )
                msg = '验证失败次数过多，账户已锁定'
            else:
                cursor.execute(
                    "UPDATE users SET verifyAttempts = %s WHERE openId = %s",
                    (new_attempt, openid)
                )
                msg = f'答案错误，还剩 {3 - new_attempt} 次机会'
            conn.commit()

        cursor.execute("SELECT * FROM users WHERE openId = %s", (openid,))
        user = cursor.fetchone()

        response_data = {'code': 200, 'msg': msg, 'data': user}
        if not is_correct and user.get('isBlacklist') == 0 and user.get('needVerify') == 1:
            # 答错后重新随机出一道题
            new_q = random.choice(questions) if questions else None
            if new_q:
                response_data['verifyQuestion'] = new_q['question']
                response_data['verifyQuestionIdx'] = new_q['id']
        return jsonify(response_data)

    except Exception:
        if conn:
            conn.rollback()
        logging.exception("验证过程数据库错误")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


# ==================== 用户徒步统计 ====================
@app.route('/user/stats', methods=['GET'])
def user_stats():
    openid = request.headers.get('X-Wx-OpenId')
    if not openid:
        return jsonify({'code': 401, 'msg': '请先登录'})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                COUNT(DISTINCT p.activity_id) as total_activities,
                COALESCE(SUM(a.distance), 0) as total_distance,
                COALESCE(SUM(a.climb), 0) as total_climb
            FROM activity_participants p
            JOIN activities a ON p.activity_id = a.id
            WHERE p.user_openid = %s AND p.status = 1
        """, (openid,))
        stats = cursor.fetchone()
        return jsonify({
            'code': 200,
            'data': {
                'total_activities': stats['total_activities'] or 0,
                'total_distance': int(stats['total_distance'] or 0),
                'total_climb': int(stats['total_climb'] or 0)
            }
        })
    except Exception:
        logging.exception("获取用户统计失败")
        return jsonify({'code': 500, 'msg': '服务器内部错误'})
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# ==================== 更新用户资料 ====================
@app.route('/update_profile', methods=['POST'])
def update_profile():
    openid = request.headers.get('X-Wx-OpenId')
    if not openid:
        return jsonify({'code': 401, 'msg': '未获取到用户身份'})

    data = request.get_json()
    update_fields = []
    params = []

    if 'nickName' in data:
        update_fields.append("nickName = %s")
        params.append(data['nickName'])
    if 'avatarUrl' in data:
        update_fields.append("avatarUrl = %s")
        params.append(data['avatarUrl'])
    if 'phoneNumber' in data:
        update_fields.append("phoneNumber = %s")
        params.append(data['phoneNumber'])
    if 'wechatId' in data:
        update_fields.append("wechatId = %s")
        params.append(data['wechatId'])

    if not update_fields:
        return jsonify({'code': 400, 'msg': '没有提供要更新的字段'})

    params.append(openid)
    sql = f"UPDATE users SET {', '.join(update_fields)} WHERE openId = %s"

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(sql, params)
        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({'code': 404, 'msg': '用户不存在或没有变化'})

        cursor.execute("SELECT * FROM users WHERE openId = %s", (openid,))
        user = cursor.fetchone()
        return jsonify({'code': 200, 'msg': '更新成功', 'data': user})
    except Exception:
        if conn:
            conn.rollback()
        logging.exception("更新用户资料异常")
        return jsonify({'code': 500, 'msg': '服务器内部错误，请稍后重试'})
    finally:
        if cursor:
            cursor.close()


# ==================== 健康检查 ====================
@app.route('/', methods=['GET'])
def health():
    return jsonify({'code': 200, 'msg': '服务正常运行'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=FLASK_DEBUG)
