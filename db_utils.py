"""
数据库工具模块
- 使用 DBUtils.PooledDB 管理连接池
- 请求级别的连接复用（通过 Flask g 对象）
- 连接池自动处理连接超时、重连
"""
import pymysql
import pymysql.cursors
from flask import g
import logging

try:
    from dbutils.pooled_db import PooledDB
    _HAS_DBUTILS = True
except ImportError:
    _HAS_DBUTILS = False
    logging.warning("DBUtils 未安装，回退到普通连接模式。安装: pip install DBUtils")

# 数据库配置（由 app.py 启动时通过 init_db_config 注入）
DB_CONFIG = {}
_pool = None


def init_db_config(config):
    """由 app.py 调用，注入数据库配置并初始化连接池"""
    global DB_CONFIG, _pool
    DB_CONFIG = config

    if _HAS_DBUTILS:
        _pool = PooledDB(
            creator=pymysql,
            maxconnections=10,
            mincached=2,
            maxcached=5,
            maxshared=3,
            blocking=True,
            maxusage=None,
            setsession=["SET time_zone = '+8:00'"],
            host=config['host'],
            port=config['port'],
            user=config['user'],
            password=config['password'],
            database=config['database'],
            charset=config['charset'],
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False,
        )
        logging.info("数据库连接池初始化完成（max=10, min=2）")


def get_db():
    """获取数据库连接（优先使用连接池，请求级别复用）"""
    if 'db' not in g:
        if _pool is not None:
            g.db = _pool.connection()
        else:
            g.db = pymysql.connect(
                host=DB_CONFIG['host'],
                port=DB_CONFIG['port'],
                user=DB_CONFIG['user'],
                password=DB_CONFIG['password'],
                database=DB_CONFIG['database'],
                charset=DB_CONFIG['charset'],
                cursorclass=pymysql.cursors.DictCursor,
                init_command="SET time_zone = '+8:00'"
            )
    return g.db


def close_db(e=None):
    """安全关闭数据库连接（归还到连接池）"""
    db = g.pop('db', None)
    if db is not None:
        try:
            if hasattr(db, 'open') and db.open:
                db.close()
            elif hasattr(db, '_closed') and not db._closed:
                db.close()
            else:
                try:
                    db.close()
                except pymysql.err.Error as err:
                    if "Already closed" not in str(err):
                        logging.error(f"关闭数据库连接时出错: {err}")
        except Exception as err:
            logging.error(f"关闭数据库连接时未知错误: {err}")


def execute_query(sql, params=None, fetch_one=False):
    """执行查询的辅助函数（不推荐直接使用，建议用 get_db + cursor）"""
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
        raise
    finally:
        if cursor:
            cursor.close()
