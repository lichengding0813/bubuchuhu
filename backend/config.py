"""
集中配置模块
从环境变量加载所有配置，无硬编码默认值
"""
import os
import logging

# ==================== 数据库配置 ====================
DB_CONFIG = {
    'host': os.environ.get('DB_HOST'),
    'port': int(os.environ.get('DB_PORT', '3306')),
    'user': os.environ.get('DB_USER'),
    'password': os.environ.get('DB_PASSWORD'),
    'database': os.environ.get('DB_NAME'),
    'charset': 'utf8mb4',
}

# 启动时验证关键配置
def validate_config():
    """验证必要的配置项是否存在，缺失则报错退出"""
    required = {
        'DB_HOST': os.environ.get('DB_HOST'),
        'DB_USER': os.environ.get('DB_USER'),
        'DB_PASSWORD': os.environ.get('DB_PASSWORD'),
        'DB_NAME': os.environ.get('DB_NAME'),
        'WX_APPID': os.environ.get('WX_APPID'),
        'WX_SECRET': os.environ.get('WX_SECRET'),
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        msg = f"缺少必要的环境变量: {', '.join(missing)}"
        logging.error(msg)
        raise RuntimeError(msg)

# ==================== 微信配置 ====================
WX_APPID = os.environ.get('WX_APPID')
WX_SECRET = os.environ.get('WX_SECRET')
WX_API_BASE = os.environ.get('WX_API_BASE', 'https://api.weixin.qq.com')

# ==================== 应用配置 ====================
DEFAULT_AVATAR = os.environ.get('DEFAULT_AVATAR', '')
UPLOAD_FOLDER = 'static/uploads'
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB
FLASK_DEBUG = os.environ.get('FLASK_DEBUG', '0') == '1'
