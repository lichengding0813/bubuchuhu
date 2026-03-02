# 使用官方 Python 轻量级镜像
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 将本地代码拷贝到容器内
COPY . /app

# 安装依赖
RUN pip install --no-cache-dir -r requirements.txt -i https://mirrors.cloud.tencent.com/pypi/simple

# 指定运行端口
EXPOSE 5000

# 启动服务
# 使用 gunicorn 作为生产服务器
CMD ["gunicorn", "--bind", ":5000", "--workers", "2", "--threads", "8", "--timeout", "0", "app:app"]