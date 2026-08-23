# 使用官方 Python 轻量级镜像
FROM python:3.9-slim

# 安装 CA 证书与时区数据（TZ=Asia/Shanghai 使 datetime.now() 返回北京时间，
# 与 db_utils 中 SET time_zone='+8:00' 对齐，修复 lastLoginTime 等时间字段差 8 小时的问题）
ENV TZ=Asia/Shanghai
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && update-ca-certificates \
    && ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

# requests 显式使用系统证书库；微信请求默认不继承容器 HTTPS_PROXY。
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    WX_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    WX_TRUST_ENV_PROXY=0

# 创建非 root 用户
RUN groupadd -r appuser && useradd -r -g appuser appuser

# 设置工作目录
WORKDIR /app

# 生产凭证必须由云托管环境变量或部署平台的 Secret 注入。
# 仓库版本不得在镜像层中保存数据库、微信或第三方 API 凭证。
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
