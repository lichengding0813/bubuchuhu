import pymysql
import pymysql.cursors
from flask import g
import logging

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
    """安全关闭数据库连接"""
    db = g.pop('db', None)
    if db is not None:
        try:
            # 检查连接是否已经关闭
            if hasattr(db, 'open') and db.open:
                db.close()
            elif hasattr(db, '_closed') and not db._closed:
                db.close()
            else:
                # 尝试关闭，捕获 Already closed 错误
                try:
                    db.close()
                except pymysql.err.Error as e:
                    if "Already closed" not in str(e):
                        logging.error(f"关闭数据库连接时出错: {e}")
        except Exception as e:
            logging.error(f"关闭数据库连接时未知错误: {e}")


def execute_query(sql, params=None, fetch_one=False):
    """执行查询的辅助函数"""
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(sql, params or ())

        if sql.strip().upper().startswith('SELECT'):
            if fetch_one:
                return cursor.fetchone()
            return cursor.fetchall()
        else:
            conn.commit()
            return cursor.lastrowid
    except Exception as e:
        if conn:
            conn.rollback()
        logging.error(f"执行查询时出错: {e}, SQL: {sql}, 参数: {params}")
        raise e
    finally:
        if cursor:
            cursor.close()
        # 注意：不在这里关闭 conn，让 teardown 处理