# 使用官方 Python 轻量级镜像
FROM python:3.9-slim

# 安装 CA 证书（python:3.9-slim 可能缺少，导致 requests SSL 失败）
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

# 创建非 root 用户
RUN groupadd -r appuser && useradd -r -g appuser appuser

# 设置工作目录
WORKDIR /app

# ==================== 环境变量（部署时需替换为真实值） ====================
# 数据库配置
# ENV DB_HOST=your-db-host
# ENV DB_PORT=3306
# ENV DB_USER=your-db-user
# ENV DB_PASSWORD=your-db-password
# ENV DB_NAME=flask_demo
# 微信小程序配置
# ENV WX_APPID=your-appid
# ENV WX_SECRET=your-appsecret

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
