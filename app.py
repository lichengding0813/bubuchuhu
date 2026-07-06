from flask import Flask, request, jsonify, g
from flask.json.provider import DefaultJSONProvider
import requests
from datetime import datetime
import os
import random
import time
import logging
from dotenv import load_dotenv

# ==================== 验证问题列表 ====================
VERIFY_QUESTIONS = [
    {
        'question': '你问我全世界是哪里最美？答案是——',
        'answers': ['你身边']
    },
    {
        'question': '玛莎的全名是？',
        'answers': ['蔡升晏']
    },
    {
        'question': '五月天中谁不是师大附中的学生？',
        'answers': ['冠佑', '刘冠佑', '刘谚明']
    },
    {
        'question': '五月天中谁放弃了律师的家业？',
        'answers': ['怪兽', '温尚翊']
    }
]

# 加载 .env 文件（本地开发时生效，云托管时通过环境变量注入）
load_dotenv()

# 导入路由蓝图
from routes.activity_routes import activity_bp
from routes.admin_routes import admin_bp
from routes.review_bp import review_bp
from db_utils import init_db_config, close_db, get_db

# ==================== 自定义 JSON 序列化 ====================
# 将 datetime 统一序列化为 "YYYY-MM-DD HH:MM:SS" 字符串，避免前端时区解析问题
class BeijingTimeJSONProvider(DefaultJSONProvider):
    def default(self, o):
        if isinstance(o, datetime):
            return o.strftime('%Y-%m-%d %H:%M:%S')
        return super().default(o)

app = Flask(__name__)
app.json = BeijingTimeJSONProvider(app)

# ==================== 配置信息 ====================
db_config = {
    'host': os.environ.get('DB_HOST', '10.13.111.246'),
    'port': int(os.environ.get('DB_PORT', 3306)),
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', ''),
    'database': os.environ.get('DB_NAME', 'flask_demo'),
    'charset': 'utf8mb4'
}
app.config['DB_CONFIG'] = db_config
# 同步到 db_utils 模块
init_db_config(db_config)

# 微信小程序配置
app.config['WX_APPID'] = os.environ.get('WX_APPID', 'wxd1a366672ab0f5ef')
app.config['WX_SECRET'] = os.environ.get('WX_SECRET', '')

# 默认头像
app.config['DEFAULT_AVATAR'] = os.environ.get('DEFAULT_AVATAR', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/魔魔胡胡胡蘿蔔.png')

# 配置静态文件服务（用于访问上传的图片）
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 限制16MB

# ==================== access_token 缓存 ====================
_access_token_cache = {
    'token': None,
    'expires_at': 0  # 过期时间戳
}

def get_access_token():
    """获取微信接口调用凭据 access_token，带内存缓存"""
    now = time.time()
    # 缓存未过期直接返回
    if _access_token_cache['token'] and _access_token_cache['expires_at'] > now + 300:
        return _access_token_cache['token']

    try:
        url = 'http://api.weixin.qq.com/cgi-bin/token'
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
    """
    调用微信 security.msgSecCheck 检测文本内容是否合规
    - content: 要检测的文本内容
    - openid: 用户openid
    - scene: 场景值 1=资料 2=评论 3=论坛 4=社交日志
    - title: 可选的标题
    返回: (is_safe: bool, msg: str)
    """
    if not content or not content.strip():
        return True, ''

    access_token = get_access_token()
    if not access_token:
        # access_token 获取失败时不阻断业务，记录日志并放行
        logging.warning("access_token获取失败，跳过内容安全检测")
        return True, ''

    try:
        url = f'http://api.weixin.qq.com/wxa/msg_sec_check?access_token={access_token}'
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
            # errcode=0 还需检查 result.suggest
            result = data.get('result', {})
            suggest = result.get('suggest', '')
            if suggest == 'risky':
                label = result.get('label', 100)
                return False, f'内容包含违规信息(类型{label})，请修改后重新提交'
            return True, ''
        elif data.get('errcode') == 87014:
            return False, '内容含有违法违规内容，请修改后重新提交'
        else:
            # 其他错误不阻断，记录日志
            logging.warning(f"内容安全检测接口返回: {data}")
            return True, ''
    except Exception as e:
        logging.error(f"内容安全检测异常: {e}")
        # 异常时放行，避免阻塞用户操作
        return True, ''

def check_image_security(image_data, openid):
    """
    调用微信 security.imgSecCheck 检测图片内容是否合规
    - image_data: 图片二进制数据
    - openid: 用户openid（用于v2版本）
    返回: (is_safe: bool, msg: str)
    """
    if not image_data:
        return True, ''

    access_token = get_access_token()
    if not access_token:
        logging.warning("access_token获取失败，跳过图片安全检测")
        return True, ''

    import tempfile
    temp_path = None
    try:
        # 保存到临时文件（imgSecCheck 需要 multipart/form-data）
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
            f.write(image_data)
            temp_path = f.name

        url = f'http://api.weixin.qq.com/wxa/img_sec_check?access_token={access_token}'
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
            except:
                pass

# ==================== 图片安全检测接口（通过云存储 URL） ====================
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
        # 下载图片数据
        res = requests.get(file_url, timeout=30)
        if res.status_code != 200:
            return jsonify({'code': 400, 'msg': '图片下载失败'})

        image_data = res.content
        if len(image_data) > 10 * 1024 * 1024:
            return jsonify({'code': 400, 'msg': '图片大小不能超过10MB'})

    except Exception as e:
        logging.error(f"下载图片失败: {e}")
        return jsonify({'code': 400, 'msg': '图片下载失败'})

    is_safe, msg = check_image_security(image_data, openid)
    if not is_safe:
        return jsonify({'code': 400, 'msg': msg})

    return jsonify({'code': 200, 'msg': '图片检测通过'})

# ==================== 注册蓝图 ====================
app.register_blueprint(activity_bp, url_prefix='/api/activity')
app.register_blueprint(admin_bp, url_prefix='/api/admin')  # 确保这行存在
app.register_blueprint(review_bp)

# ==================== 数据库连接钩子 ====================
@app.teardown_appcontext
def teardown_db(e=None):
    close_db(e)

# ==================== 唯一接口：登录/注册 ====================
@app.route('/login', methods=['POST'])
def login():
    """用户登录/注册接口"""
    data = request.get_json()
    code = data.get('code')

    if not code:
        return jsonify({'code': 400, 'msg': '缺少code参数'})

    # 通过code获取openid
    try:
        url = 'http://api.weixin.qq.com/sns/jscode2session'
        params = {
            'appid': app.config['WX_APPID'],
            'secret': app.config['WX_SECRET'],
            'js_code': code,
            'grant_type': 'authorization_code'
        }
        res = requests.get(url, params=params)
        wx_data = res.json()

        if 'openid' not in wx_data:
            return jsonify({'code': 401, 'msg': f"微信登录失败: {wx_data.get('errmsg', '未知错误')}"})

        openid = wx_data['openid']
    except Exception as e:
        return jsonify({'code': 500, 'msg': f"调用微信接口失败: {str(e)}"})

    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # 查询用户是否存在
        cursor.execute("SELECT * FROM users WHERE openId = %s", (openid,))
        user = cursor.fetchone()

        now = datetime.now()

        if user:
            # 用户存在：更新登录次数和时间
            cursor.execute("""
                UPDATE users 
                SET loginCount = loginCount + 1, lastLoginTime = %s
                WHERE openId = %s
            """, (now, openid))
            conn.commit()

            cursor.execute("SELECT * FROM users WHERE openId = %s", (openid,))
            user = cursor.fetchone()

            # 如果需要验证，随机分配一道验证题
            response_data = {'code': 200, 'msg': '登录成功', 'data': user}
            if user.get('needVerify') == 1 and user.get('isBlacklist') == 0:
                q_idx = random.randint(0, len(VERIFY_QUESTIONS) - 1)
                response_data['verifyQuestion'] = VERIFY_QUESTIONS[q_idx]['question']
                response_data['verifyQuestionIdx'] = q_idx

            return jsonify(response_data)
        else:
            # 用户不存在：创建新用户
            nickname = f"魔魔胡胡胡蘿蔔{openid[-4:] if len(openid) >= 4 else '0000'}"

            cursor.execute("""
                INSERT INTO users (
                    openId, nickName, avatarUrl, phoneNumber, loginCount,
                    isBlacklist, verifyAttempts, needVerify, verified, 
                    createTime, lastLoginTime
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                openid, nickname, app.config['DEFAULT_AVATAR'], '', 1,
                0, 0, 1, 0, now, now
            ))
            conn.commit()

            cursor.execute("SELECT * FROM users WHERE openId = %s", (openid,))
            user = cursor.fetchone()

            # 新用户需要验证，随机分配一道验证题
            response_data = {'code': 200, 'msg': '注册成功', 'data': user}
            if user.get('needVerify') == 1 and user.get('isBlacklist') == 0:
                q_idx = random.randint(0, len(VERIFY_QUESTIONS) - 1)
                response_data['verifyQuestion'] = VERIFY_QUESTIONS[q_idx]['question']
                response_data['verifyQuestionIdx'] = q_idx

            return jsonify(response_data)

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
    finally:
        if cursor:
            cursor.close()

# ==================== 验证答案接口 ====================
@app.route('/verify', methods=['POST'])
def verify_answer():
    """验证用户回答"""
    openid = request.headers.get('X-Wx-OpenId')
    if not openid:
        return jsonify({'code': 401, 'msg': '未获取到用户身份'})

    data = request.get_json()
    answer = data.get('answer')
    if not answer:
        return jsonify({'code': 400, 'msg': '缺少answer参数'})

    question_idx = data.get('question_idx', 0)

    # 根据问题索引获取正确答案列表
    if 0 <= question_idx < len(VERIFY_QUESTIONS):
        correct_answers = VERIFY_QUESTIONS[question_idx]['answers']
    else:
        correct_answers = ['大鸡腿']  # 向后兼容

    # 检查答案是否匹配（忽略首尾空格，不区分大小写）
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
            cursor.execute("""
                UPDATE users 
                SET needVerify = 0, verified = 1, verifyAttempts = 0
                WHERE openId = %s
            """, (openid,))
            conn.commit()
            msg = '验证通过'
        else:
            new_attempt = user['verifyAttempts'] + 1
            if new_attempt >= 3:
                cursor.execute("""
                    UPDATE users 
                    SET verifyAttempts = %s, isBlacklist = 1
                    WHERE openId = %s
                """, (new_attempt, openid))
                msg = '验证失败次数过多，账户已锁定'
            else:
                cursor.execute("""
                    UPDATE users 
                    SET verifyAttempts = %s
                    WHERE openId = %s
                """, (new_attempt, openid))
                msg = f'答案错误，还剩 {3 - new_attempt} 次机会'

            conn.commit()

        cursor.execute("SELECT * FROM users WHERE openId = %s", (openid,))
        user = cursor.fetchone()

        response_data = {
            'code': 200,
            'msg': msg,
            'data': user
        }

        # 如果验证未通过且未被锁定，继续返回当前验证题
        if not is_correct and user.get('isBlacklist') == 0 and user.get('needVerify') == 1:
            response_data['verifyQuestion'] = VERIFY_QUESTIONS[question_idx]['question']
            response_data['verifyQuestionIdx'] = question_idx

        return jsonify(response_data)

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
    finally:
        if cursor:
            cursor.close()

# ==================== 更新用户资料接口 ====================
@app.route('/update_profile', methods=['POST'])
def update_profile():
    """更新用户资料"""
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
        return jsonify({
            'code': 200,
            'msg': '更新成功',
            'data': user
        })
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'code': 500, 'msg': f'数据库错误: {str(e)}'})
    finally:
        if cursor:
            cursor.close()

# ==================== 健康检查 ====================
@app.route('/', methods=['GET'])
def health():
    return jsonify({'code': 200, 'msg': '服务正常运行'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)