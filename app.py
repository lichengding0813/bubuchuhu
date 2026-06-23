from flask import Flask, request, jsonify, g
import requests
from datetime import datetime
import os
from dotenv import load_dotenv

# 加载 .env 文件（本地开发时生效，云托管时通过环境变量注入）
load_dotenv()

# 导入路由蓝图
from routes.activity_routes import activity_bp
from routes.admin_routes import admin_bp
from routes.review_bp import review_bp
from db_utils import init_db_config, close_db

app = Flask(__name__)

# ==================== 配置信息（统一从环境变量读取）====================
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
app.config['WX_APPID'] = os.environ.get('WX_APPID', '')
app.config['WX_SECRET'] = os.environ.get('WX_SECRET', '')

# 默认头像
app.config['DEFAULT_AVATAR'] = os.environ.get('DEFAULT_AVATAR', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/魔魔胡胡胡蘿蔔.png')

# 配置静态文件服务（用于访问上传的图片）
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 限制16MB

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

            return jsonify({
                'code': 200,
                'msg': '登录成功',
                'data': user
            })
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

            return jsonify({
                'code': 200,
                'msg': '注册成功',
                'data': user
            })

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

    CORRECT_ANSWER = '大鸡腿'

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

        if answer == CORRECT_ANSWER:
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

        return jsonify({
            'code': 200,
            'msg': msg,
            'data': user
        })

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