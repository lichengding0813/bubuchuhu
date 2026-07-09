
# 步步出沪 | 徒然好想走

> 「步步出沪 | 徒然好想走」是一个以五月天粉丝群体为核心的户外徒步活动管理小程序。用户可以发起徒步活动、报名参与、查看活动回顾，管理员可以审核活动、管理用户状态。小程序集成了微信云托管服务，实现前后端一体化部署。

## 扫码体验

![步步出沪小程序码](./miniprogram-code.jpg)

## 版本历史

### v1.2.0（2026-07-10）
- ✨ 草稿箱功能：发起活动时可暂存草稿，稍后继续编辑或删除
- ✨ 同行人功能：报名时可选择同行人数（不含本人，最多3人），名额自动扣减
- ✨ 发起人可在报名人员列表中查看每位报名者的同行人数
- 🔧 报名区域改为可折叠设计，不再遮挡活动信息
- 🔧 活动详情、发起活动等页面回归微信原生导航栏
- ⚡ 首页进入更快，不再每次重新登录
- ⚡ 修复登录偶发失败的问题
- ⚡ 数据库查询性能优化

### v1.0.2（2026-06-25）
- ✨ 发布/报名前校验用户资料（需填写手机号或微信号）
- ✨ 协议须知强制弹窗 + 3 秒阅读倒计时
- ✨ 多验证问题（4 道题随机分配，支持多答案），管理员可以开启全员重新验证
- ✨ 黑名单用户全屏遮罩，禁止一切操作（首页、个人页、活动回顾页）
- 🔧 修复时区显示问题（后端统一 datetime 序列化格式）
- 🔧 修复首页待审核活动展示、复制按钮宽度、难度显示格式等显示问题
- ✨ 新增报名成功弹窗
- ✨ 新增取消报名功能
- ⚡ 移除大巴二维码上传
- ⚡ 难度五星制显示
- ⚡ 优化购买户外保险提示
- ⚡ 活动分区展示（已结束活动、进行中活动）
- ⚡ 首页活动数量统计显示

### v1.0.1（2025-05-27）
- ✨ 个人页增加发布和报名活动查看
- ⚡ 首页、活动详情页可微信转发分享给好友
- ⚡ 优化活动详情、活动回顾信息、图片、二维码显示
- 🔧 修复无法报名的问题

### v1.0.0（2025-05-25）
- ✨ 「步步出沪 | 徒然好想走」小程序首次发布


## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | 微信小程序 (WXML/WXSS/JS) | 原生开发，非框架 |
| UI 组件库 | Vant Weapp | 提供按钮、表单、弹窗等组件 |
| 后端 | Python Flask | 轻量级 Web 框架 |
| 数据库驱动 | PyMySQL | 连接 MySQL 数据库 |
| 数据库 | MySQL (腾讯云 CynosDB) | 云数据库 |
| 部署 | 微信云托管 | 容器化部署，Gunicorn 作为 WSGI 服务器 |
| 云存储 | 微信云开发 | 图片、头像等文件存储 |

## 项目结构

本仓库 master 分支包含完整的项目代码，按前端、后端、数据库分为三个目录：

```
├── frontend/           # 前端代码（微信小程序）
│   └── miniprogram/
│       ├── app.js / app.json / app.wxss
│       ├── pages/              # 各页面（首页、详情、发布、个人中心等）
│       ├── components/         # 公共组件（验证弹窗、黑名单遮罩、活动卡片）
│       ├── utils/              # 工具模块（时间处理、API封装、图片检测）
│       ├── miniprogram_npm/    # Vant Weapp 组件库
│       └── images/             # 静态资源
├── backend/            # 后端代码（Flask 应用）
│   ├── app.py                  # Flask 主入口
│   ├── config.py               # 集中配置模块
│   ├── db_utils.py             # 数据库连接池
│   ├── middleware.py           # 鉴权中间件
│   ├── routes/                 # 路由蓝图（活动、管理、回顾）
│   ├── Dockerfile              # 云托管容器构建
│   ├── requirements.txt        # Python 依赖
│   ├── .env.example            # 环境变量模板
│   ├── migration.sql           # 数据库迁移脚本（索引优化等）
│   └── migration_companion.sql # 同行人功能迁移脚本
├── database/           # 数据库建表语句
│   ├── users.sql
│   ├── activities.sql
│   ├── activity_participants.sql
│   └── ...（共 9 个表）
├── README.md
└── miniprogram-code.jpg
```

> 开发时也可按分支拉取：`backend` 分支（后端）、`dev` 分支（前端）、`database` 分支（数据库）。

## 核心功能

### 用户系统
- **微信登录**：通过 `wx.login` 获取 code，后端调用微信 API 换取 openid，自动注册/登录
- **验证机制**：新用户需回答验证问题（4 道题随机分配，3 次错误锁定账户）
- **黑名单管理**：被锁定用户全页面遮罩，无法操作（首页、个人页、活动回顾页）
- **个人资料**：昵称、手机号、微信号、头像，发布/报名前校验资料完整性

### 活动管理
- **发布活动**：填写活动名称、描述、时间、地点、出行方式（大巴/高铁/自驾）、集合点、路线、难度（五星制）、人数限制、报名截止时间、强制保险等
- **草稿箱**：发起活动时可暂存草稿，在「我发起的 - 草稿箱」中查看、编辑或删除
- **活动审核**：管理员审核活动（通过/拒绝），拒绝后可修改重新提交
- **活动状态**：草稿 → 待审核 → 报名中 → 进行中 → 已结束（后端自动更新状态）
- **活动列表**：首页分「最新活动」和「已结束活动」两个板块，支持展开/收起

### 报名系统
- **报名**：勾选协议须知（强制 3 秒阅读倒计时）→ 选择同行人数 → 确认报名
- **同行人**：报名时可选择 0-3 名同行人（不含本人），名额相应扣减，发起人可在报名列表中查看
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
| `activity_participants` | 报名记录表 | id, activity_id, user_openid, nickname, phone, wechat_id, status, remark, companion_count |
| `activity_reviews` | 活动回顾表 | id, activity_id, name, cover, time, location, participants, content |

> 建表语句详见 `database/` 目录。数据库迁移脚本详见 `backend/migration.sql` 和 `backend/migration_companion.sql`。

## 部署信息

| 配置项 | 值 |
|--------|-----|
| 云托管环境 | 见云托管控制台 |


### 后端部署

1. 后端代码通过微信云托管控制台手动上传代码包部署
2. Dockerfile 基于 `python:3.9-slim`，使用 Gunicorn 启动
3. 环境变量通过 Dockerfile 的 ENV 指令或 .env 文件配置（DB_HOST、DB_PORT、DB_USER、DB_PASSWORD、DB_NAME、WX_APPID、WX_SECRET 等），详见 `.env.example`
4. 微信 API 调用使用 `https://api.weixin.qq.com`

### 前端部署

1. 使用微信开发者工具打开前端项目
2. 云开发环境初始化为对应云托管环境 ID
3. 所有接口通过 `wx.cloud.callContainer` 调用云托管服务
4. 请求头需携带 `X-WX-SERVICE: flask-mysql-login` 和 `X-Wx-OpenId`

## 本地开发

### 后端

```bash
# 克隆仓库（master 包含全部代码，也可单独拉 backend 分支）
git clone https://gitee.com/sinkdream0813/bubuchuhu.git
cd bubuchuhu/backend

# 安装依赖
pip install -r requirements.txt

# 配置环境变量（复制 .env.example 并填写）
cp .env.example .env

# 启动开发服务器
python app.py
```

### 前端

```bash
# 使用微信开发者工具打开 frontend/miniprogram/ 目录
# 在工具中配置对应的 AppID
# 执行 npm install 后在工具中「构建 npm」
```

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
| POST | `/api/activity/save-draft` | 保存活动草稿 |
| GET | `/api/activity/my-drafts` | 获取草稿列表 |
| POST | `/api/activity/delete-draft` | 删除草稿 |
| POST | `/api/activity/publish-draft` | 草稿提交为正式活动 |
| POST | `/api/activity/participate` | 报名活动（含同行人数） |
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
