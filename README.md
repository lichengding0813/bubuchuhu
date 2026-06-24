---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '283e6784-cd6e-4d8a-9ea0-02f36f42bfe0'
  PropagateID: '283e6784-cd6e-4d8a-9ea0-02f36f42bfe0'
  ReservedCode1: '52abbcb0-8e65-46f9-bec2-08610d8fff50'
  ReservedCode2: '52abbcb0-8e65-46f9-bec2-08610d8fff50'
---

# 步步出沪 | 徒然好想走

> 一款面向户外徒步爱好者的微信小程序，提供活动发布、报名管理、活动回顾等全流程功能。

## 项目简介

「步步出沪 | 徒然好想走」是一个以五月天粉丝群体为核心的户外徒步活动管理小程序。用户可以发起徒步活动、报名参与、查看活动回顾，管理员可以审核活动、管理用户状态。小程序集成了微信云托管服务，实现前后端一体化部署。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | 微信小程序 (WXML/WXSS/JS) | 原生开发，非框架 |
| UI 组件库 | Vant Weapp | 提供按钮、表单、弹窗等组件 |
| 后端 | Python Flask | 轻量级 Web 框架 |
| 数据库驱动 | PyMySQL | 连接 MySQL 数据库 |
| 数据库 | MySQL (腾讯云 CynosDB) | 云数据库，支持公网/内网访问 |
| 部署 | 微信云托管 | 容器化部署，Gunicorn 作为 WSGI 服务器 |
| 云存储 | 微信云开发 | 图片、头像等文件存储 |

## 项目结构

本仓库采用多分支管理不同模块的代码：

```
├── master      # 空分支（保留）
├── backend     # 后端代码（Flask 应用）
├── dev         # 前端代码（微信小程序，miniprogram/ 子目录）
└── database    # 数据库建表语句
```

### 后端结构（backend 分支）

```
bubuchuhu/
├── app.py                  # Flask 主入口，登录/验证/资料更新接口
├── db_utils.py             # 数据库连接工具
├── middleware.py           # 装饰器：验证状态检查、管理员权限检查
├── requirements.txt        # Python 依赖
├── Dockerfile              # 云托管容器构建文件
├── .env                    # 环境变量（gitignored）
├── routes/
│   ├── activity_routes.py  # 活动相关接口：创建、详情、列表、报名、取消、状态更新
│   ├── admin_routes.py     # 管理员接口：审核活动、黑名单管理、全员重新验证
│   └── review_bp.py        # 活动回顾接口：列表、详情、新增、图片上传
├── static/uploads/         # 上传文件存储目录
└── templates/              # 模板文件
```

### 前端结构（dev 分支）

```
miniprogram/
├── app.js                  # 全局逻辑，云环境初始化
├── app.json                # 页面注册、TabBar 配置、Vant 组件引入
├── app.wxss                # 全局样式
├── pages/
│   ├── home/               # 首页：活动列表、登录验证、发布入口
│   ├── details/            # 活动详情：报名/取消、协议须知、保险提示
│   ├── publish/            # 发布活动：表单填写、集合点管理、时间选择器
│   ├── review/             # 活动回顾：列表展示
│   ├── review-detail/      # 回顾详情：图文展示
│   ├── review_add/         # 新建回顾（管理员）
│   ├── profile/            # 个人中心：用户信息、统计、菜单
│   ├── settings/           # 设置：昵称/手机号/微信号/头像修改
│   ├── admin-review/       # 管理员审核：活动审批
│   ├── admin-detail/       # 审核详情
│   ├── activity-participants/ # 活动参与人员列表
│   ├── my-created-activities/ # 我发起的活动
│   ├── my-joined-activities/  # 我报名的活动
│   ├── about/              # 关于我们
│   └── update-log/         # 更新日志
├── miniprogram_npm/        # Vant Weapp 组件库
└── images/                 # TabBar 图标等静态资源
```

## 核心功能

### 用户系统
- **微信登录**：通过 `wx.login` 获取 code，后端调用微信 API 换取 openid，自动注册/登录
- **验证机制**：新用户需回答验证问题（4 道题随机分配，3 次错误锁定账户）
- **黑名单管理**：被锁定用户全页面遮罩，无法操作（首页、个人页、活动回顾页）
- **个人资料**：昵称、手机号、微信号、头像，发布/报名前校验资料完整性

### 活动管理
- **发布活动**：填写活动名称、描述、时间、地点、出行方式（大巴/高铁/自驾）、集合点、路线、难度（五星制）、人数限制、报名截止时间、强制保险等
- **活动审核**：管理员审核活动（通过/拒绝），拒绝后可修改重新提交
- **活动状态**：待审核 → 报名中 → 进行中 → 已结束（后端自动更新状态）
- **活动列表**：首页分「最新活动」和「已结束活动」两个板块，支持展开/收起

### 报名系统
- **报名**：勾选协议须知（强制 3 秒阅读倒计时）→ 校验资料 → 确认报名
- **取消报名**：取消后释放名额，可重新报名
- **协议须知**：参与者须知、大巴免责声明、自驾/高铁免责声明、发起者须知
- **报名状态**：实时显示剩余名额、已报名状态

### 活动回顾
- **回顾列表**：展示所有已发布的活动回顾
- **回顾详情**：图文展示活动精彩瞬间
- **新建回顾**：管理员可创建活动回顾，上传图片

### 管理员功能
- **活动审核**：查看待审核活动，通过或拒绝
- **全员重新验证**：一键重置所有用户的验证状态
- **参与人员查看**：查看活动报名人员列表

## 数据库设计

主要数据表：

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `users` | 用户表 | openId, nickName, avatarUrl, phoneNumber, wechatId, verified, needVerify, isBlacklist, isAdmin, verifyAttempts |
| `activities` | 活动表 | id, name, description, activity_time, location, difficulty, distance, climb, max_participants, deadline, status, creator_openid, wechat_id, cover_url, group_qr_url, is_force_insurance |
| `activity_meeting_points` | 集合点表 | id, activity_id, meeting_time (varchar), location |
| `activity_travel_options` | 出行方式表 | id, activity_id, travel_type (1=大巴, 2=高铁, 3=自驾), bus_qr_url |
| `activity_participants` | 报名记录表 | id, activity_id, user_openid, nickname, phone, wechat_id, status (1=已报名, 0=已取消), remark |
| `activity_reviews` | 活动回顾表 | id, activity_id, name, cover, time, location, participants, content |

> 建表语句详见 `database` 分支。

## 部署信息

| 配置项 | 值 |
|--------|-----|
| 云托管环境 | `prod-3gktwx67d1dd1e76` |
| 云托管服务名 | `flask-mysql-login` |
| 微信 AppID | `wxd1a366672ab0f5ef` |
| 数据库名 | `flask_demo` |

### 后端部署

1. 后端代码通过微信云托管控制台手动上传代码包部署
2. Dockerfile 基于 `python:3.9-slim`，使用 Gunicorn 启动
3. 环境变量通过云托管控制台注入（DB_HOST、DB_PORT、DB_USER、DB_PASSWORD、DB_NAME、WX_APPID、WX_SECRET 等）
4. 微信 API 调用使用 `http://api.weixin.qq.com`（云托管内部代理，勿改为 https）

### 前端部署

1. 使用微信开发者工具打开前端项目
2. 云开发环境初始化为 `prod-3gktwx67d1dd1e76`
3. 所有接口通过 `wx.cloud.callContainer` 调用云托管服务
4. 请求头需携带 `X-WX-SERVICE: flask-mysql-login` 和 `X-Wx-OpenId`

## 本地开发

### 后端

```bash
# 克隆 backend 分支
git clone -b backend https://gitee.com/sinkdream0813/bubuchuhu.git

# 安装依赖
pip install -r requirements.txt

# 配置环境变量（复制 .env.example 并填写）
cp .env.example .env

# 启动开发服务器
python app.py
```

### 前端

```bash
# 克隆 dev 分支
git clone -b dev https://gitee.com/sinkdream0813/bubuchuhu.git

# 使用微信开发者工具打开 miniprogram/ 目录
# 在工具中配置 AppID: wxd1a366672ab0f5ef
```

## 版本历史

### v1.0.3（2026-06-24）
- ✨ 发布/报名前校验用户资料（手机号或微信号至少填一项）
- ✨ 协议须知强制弹窗 + 3 秒阅读倒计时
- ✨ 多验证问题（4 道题随机分配，支持多答案）
- ✨ 黑名单用户全屏遮罩（首页、个人页、活动回顾页）
- 🔧 修复时区显示问题（后端统一 datetime 序列化格式）
- 🔧 修复取消报名失败、重新报名报错
- 🔧 修复首页待审核活动展示、复制按钮宽度、难度显示格式等 12 项问题

### v1.0.2（2026-06-23）
- ✨ 时区修复（BeijingTimeJSONProvider 统一序列化）
- ✨ 报名成功弹窗
- ✨ 取消报名功能
- ✨ 移除大巴二维码上传
- ✨ 难度五星制显示
- ✨ 保险提示
- ✨ 已结束活动分区展示
- ✨ 活动数量显示
- ✨ 表单标签对齐、管理员全员重新验证

### v1.0.1（2025-05-27）
- ✨ 个人页增加发布和报名活动查看
- ⚡ 首页、活动详情页可微信转发分享给好友
- ⚡ 优化活动详情、活动回顾信息、图片、二维码显示
- 🔧 修复无法报名的问题

### v1.0.0（2025-05-25）
- ✨ 「步步出沪 | 徒然好想走」小程序首次发布

## API 接口概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/login` | 用户登录/注册 |
| POST | `/verify` | 验证问题校验 |
| POST | `/update_profile` | 更新用户资料 |
| GET | `/api/activity/list` | 获取活动列表 |
| GET | `/api/activity/detail` | 获取活动详情 |
| POST | `/api/activity/create` | 创建活动 |
| POST | `/api/activity/update-rejected` | 修改被拒绝的活动 |
| POST | `/api/activity/participate` | 报名活动 |
| POST | `/api/activity/cancel-participation` | 取消报名 |
| POST | `/api/activity/update-status` | 批量更新活动状态 |
| GET | `/api/activity/my-activities-with-audit` | 我发起的活动 |
| GET | `/api/activity/my-participations-grouped` | 我报名的活动 |
| POST | `/api/admin/review` | 管理员审核活动 |
| POST | `/api/admin/blacklist` | 黑名单管理 |
| POST | `/api/admin/reset-all-verification` | 全员重新验证 |
| GET | `/api/reviews` | 活动回顾列表 |
| GET | `/api/reviews/<id>` | 活动回顾详情 |
| POST | `/api/reviews` | 新建活动回顾 |

> AI生成