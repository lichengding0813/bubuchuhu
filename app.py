# app.py
from flask import Flask, request, jsonify
import pymysql
import pymysql.cursors
import requests
from datetime import datetime
import os

app = Flask(__name__)

# ==================== 配置信息 ====================
# 云数据库配置
DB_CONFIG = {
    'host': 'sh-cynosdbmysql-grp-1khjmoc4.sql.tencentcdb.com',  # 例如：'sh-cynosdbmysql-grp-xxx.sql.tencentcdb.com'
    'port': 20599,  # 你的数据库端口
    'user': 'root',
    'password': 'fNau8XqS',
    'database': 'flask_demo',
    'charset': 'utf8mb4'
}

# 微信小程序配置
WX_APPID = 'wxd1a366672ab0f5ef'
WX_SECRET = ''

# 默认头像
DEFAULT_AVATAR = 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/魔魔胡胡胡蘿蔔.png'

# ==================== 数据库连接 ====================
def get_db():
    """获取数据库连接"""
    return pymysql.connect(
        host=DB_CONFIG['host'],
        port=DB_CONFIG['port'],
        user=DB_CONFIG['user'],
        password=DB_CONFIG['password'],
        database=DB_CONFIG['database'],
        charset=DB_CONFIG['charset'],
        cursorclass=pymysql.cursors.DictCursor
    )


# ==================== 唯一接口：登录/注册 ====================
@app.route('/login', methods=['POST'])
def login():
    """
    用户登录/注册接口
    请求体: {"code": "微信登录code"}
    """
    # 1. 获取请求参数
    data = request.get_json()
    code = data.get('code')

    if not code:
        return jsonify({'code': 400, 'msg': '缺少code参数'})

    # 2. 通过code获取openid
    try:
        url = 'http://api.weixin.qq.com/sns/jscode2session'
        params = {
            'appid': WX_APPID,
            'secret': WX_SECRET,
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

    # 3. 连接数据库处理用户
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # 4. 查询用户是否存在
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

            # 重新获取用户信息
            cursor.execute("SELECT * FROM users WHERE openId = %s", (openid,))
            user = cursor.fetchone()

            return jsonify({
                'code': 200,
                'msg': '登录成功',
                'data': user
            })
        else:
            # 用户不存在：创建新用户
            # 生成昵称：魔魔胡胡胡蘿蔔 + openid后四位
            nickname = f"魔魔胡胡胡蘿蔔{openid[-4:] if len(openid) >= 4 else '0000'}"

            cursor.execute("""
                INSERT INTO users (
                    openId, nickName, avatarUrl, phoneNumber, loginCount,
                    isBlacklist, verifyAttempts, needVerify, verified, 
                    createTime, lastLoginTime
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                openid, nickname, DEFAULT_AVATAR, '', 1,
                0, 0, 1, 0, now, now
            ))
            conn.commit()

            # 获取新用户信息
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
        if conn:
            conn.close()


# ==================== 健康检查（用于验证服务是否正常） ====================
@app.route('/', methods=['GET'])
def health():
    return jsonify({'code': 200, 'msg': '服务正常运行'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)