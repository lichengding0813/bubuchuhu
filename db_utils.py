import pymysql
import pymysql.cursors
from flask import g

# 从主配置导入
DB_CONFIG = {
    'host': '10.13.111.246',
    'port': 3306,
    'user': 'root',
    'password': 'fNau8XqS',
    'database': 'flask_demo',
    'charset': 'utf8mb4'
}

def get_db():
    """获取数据库连接（支持请求级别的连接复用）"""
    if 'db' not in g:
        g.db = pymysql.connect(
            host=DB_CONFIG['host'],
            port=DB_CONFIG['port'],
            user=DB_CONFIG['user'],
            password=DB_CONFIG['password'],
            database=DB_CONFIG['database'],
            charset=DB_CONFIG['charset'],
            cursorclass=pymysql.cursors.DictCursor
        )
    return g.db

def close_db(e=None):
    """关闭数据库连接"""
    db = g.pop('db', None)
    if db is not None:
        db.close()

def execute_query(sql, params=None, fetch_one=False):
    """执行查询的辅助函数"""
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(sql, params or ())
        if fetch_one:
            return cursor.fetchone()
        return cursor.fetchall()
    finally:
        cursor.close()