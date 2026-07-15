# 使用官方 Python 轻量级镜像
FROM python:3.9-slim

# 安装 CA 证书与时区数据（TZ=Asia/Shanghai 使 datetime.now() 返回北京时间，
# 与 db_utils 中 SET time_zone='+8:00' 对齐，修复 lastLoginTime 等时间字段差 8 小时的问题）
ENV TZ=Asia/Shanghai
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

# 创建非 root 用户
RUN groupadd -r appuser && useradd -r -g appuser appuser

# 设置工作目录
WORKDIR /app

# ==================== 环境变量（生产配置） ====================
# 数据库配置
ENV DB_HOST=sh-cynosdbmysql-grp-1khjmoc4.sql.tencentcdb.com
ENV DB_PORT=20599
ENV DB_USER=root
ENV DB_PASSWORD=fNau8XqS
ENV DB_NAME=flask_demo
# 微信小程序配置
ENV WX_APPID=wxd1a366672ab0f5ef
ENV WX_SECRET=d336268096323dc418d18ad93097db9f
# 运行环境
ENV FLASK_DEBUG=0

# 先复制依赖文件，利用 Docker 缓存层
COPY requirements.txt .

# 安装依赖
RUN pip install --no-cache-dir -r requirements.txt -i https://mirrors.cloud.tencent.com/pypi/simple

# 复制应用代码
COPY . .

# 创建上传目录并设置权限
RUN mkdir -p static/uploads && chown -R appuser:appuser /app

# 切换到非 root 用户
USER appuser

# 指定运行端口
EXPOSE 5000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/')" || exit 1

# 启动服务（gunicorn 超时改为 120s 以支持图片检测等长请求）
CMD ["gunicorn", "--bind", ":5000", "--workers", "2", "--threads", "8", "--timeout", "120", "app:app"]
