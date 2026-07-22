
# 步步出沪 | 徒然好想走

> 「步步出沪 | 徒然好想走」是一个以五月天粉丝群体为核心的户外徒步活动管理小程序。用户可以发起徒步活动、报名参与、查看活动回顾，管理员可以审核活动、管理用户状态。小程序集成了微信云托管服务，实现前后端一体化部署。

## 扫码体验

![步步出沪小程序码](./miniprogram-code.jpg)

## 版本历史

### v1.3.0（2026-07-22）
- ✨ 活动总结 & 路线简介改为富文本编辑器，支持加粗、字号、颜色、分割线
- ✨ 撤回待审核活动：待审核状态可一键撤回至草稿箱，继续编辑后重新提交
- ✨ 报名人员列表优化：统计只计有效报名（不含已取消），已取消报名折叠展示+灰色样式
- ✨ 难度等级改为点击星级选择（1-5 星），取代下拉框
- ✨ 验证问题启用/禁用改为左右滑动开关
- ✨ 我发起的页面 tab 调整为：已通过 → 待审核 → 草稿箱
- ✨ 草稿保存后弹窗提示并回首页，指引用户到「我的-我发起的-草稿箱」查看
- ✨ 发起者须知从弹窗改为独立页面（与报名须知一致的滚动阅读体验）
- 🔧 修复登录 500：config.py 微信 API 改 HTTP 避免 Docker 容器 SSL 证书缺失
- 🔧 修复验证答题失败：get_verify_questions 提前 close 连接导致后续 get_db 拿到失效连接
- 🔧 修复验证答题失败：前端 verify 调用补传 X-Wx-OpenId header
- 🔧 修复首页已拒绝活动对普通用户可见的问题
- 🔧 修复报名人员接口漏查 status 字段导致前端无法区分有效/已取消
- 🔧 修复草稿保存空时间报错（activity_time/deadline 列改为允许 NULL）
- 🔧 修复草稿发布未走 publish-draft 接口的问题
- 🔧 修复草稿箱有内容时仍显示"暂无活动"
- 🔧 修复集合信息红星间距（flex 布局导致文字和星号分离）
- 🔧 集合点时间校验：集合时间不能晚于活动开始时间
- ⚡ 全表转 utf8mb4_unicode_ci，所有文本字段兼容 emoji
- ⚡ 后端连接池 close_db 静默处理已归还连接，不再刷错误日志

### v1.2.0（2026-07-15）
- 🔧 修复登录偶发失败的问题
- 🔧 修复报名截止时间可能晚于活动开始时间的问题，提交时增加校验
- 🔧 修复条款须知页未读完即可返回的问题，改为必须划到底部
- 🔧 修复后端时间字段差 8 小时问题（Dockerfile 设置 TZ=Asia/Shanghai）
- ⚡ 报名区域改为可折叠设计，不再遮挡活动信息
- ⚡ 活动详情、发起活动等页面回归微信原生导航栏
- ⚡ 首页进入更快，不再每次重新登录
- ⚡ 数据库查询性能优化（连接池 + 中间件缓存 + 索引优化）
- ⚡ 草稿箱加载失败时展示示例数据，避免页面空白
- ✨ 草稿箱功能：发起活动时可暂存草稿，稍后继续编辑或删除
- ✨ 同行人功能：报名时可选择同行人数（不含本人，最多3人），名额自动扣减
- ✨ 发起人可在报名人员列表中查看每位报名者的同行人数
- ✨ 黑名单管理：管理员可查看黑名单用户并一键解封，解封后用户可重新答题
- ✨ 验证问题动态管理：管理员可增删改查验证问题，支持启用/禁用
- ✨ 待审核菜单显示待审核活动数量徽标
- ✨ 条款须知独立页面，支持滚动阅读 + 下拉提示

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
│   ├── migration_companion.sql # 同行人功能迁移脚本
│   ├── migration_verify_questions.sql # 验证问题表迁移脚本
│   └── migration_utf8mb4.sql    # 全表 utf8mb4 迁移脚本（支持 emoji）
├── database/           # 数据库建表语句
│   ├── users.sql
│   ├── activities.sql
│   ├── activity_participants.sql
│   └── ...（共 10 个表）
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
- **发布活动**：填写活动名称、描述、时间、地点、出行方式（大巴/高铁/自驾）、集合点、路线（富文本）、难度（点击星级）、人数限制、报名截止时间、强制保险等
- **草稿箱**：发起活动时可暂存草稿，在「我发起的 - 草稿箱」中查看、编辑或删除；草稿保存后提示并回首页
- **活动审核**：管理员审核活动（通过/拒绝），拒绝后可修改重新提交
- **撤回功能**：待审核状态的活动可一键撤回至草稿箱，继续编辑后重新提交
- **活动状态**：草稿 → 待审核 → 报名中 → 进行中 → 已结束（后端自动更新状态）；待审核可撤回 → 草稿
- **活动列表**：首页分「最新活动」和「已结束活动」两个板块，已拒绝活动仅管理员可见

### 报名系统
- **报名**：勾选协议须知（强制 3 秒阅读倒计时）→ 选择同行人数 → 确认报名
- **同行人**：报名时可选择 0-3 名同行人（不含本人），名额相应扣减，发起人可在报名列表中查看
- **取消报名**：取消后释放名额，可重新报名
- **报名人员查看**：发起人可查看报名人员列表，统计仅计有效报名（不含已取消），已取消报名折叠展示
- **协议须知**：参与者须知、大巴免责声明、自驾/高铁免责声明、发起者须知（均为独立页面，滚动阅读）
- **报名状态**：实时显示剩余名额、已报名状态

### 活动回顾
- **回顾列表**：展示所有已发布的活动回顾
- **回顾详情**：图文展示活动精彩瞬间
- **新建回顾**：管理员可创建活动回顾，上传图片，活动总结支持富文本编辑

### 管理员功能
- **活动审核**：查看待审核活动，通过或拒绝（待审核菜单显示数量徽标）
- **黑名单管理**：查看黑名单用户列表，一键解封（重置答错次数，用户可重新答题）
- **验证问题管理**：增删改查验证问题，支持启用/禁用（左右滑动开关）、多答案
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
| `verify_questions` | 验证问题表 | id, question, answers, sort_order, is_active |

> 建表语句详见 `database/` 目录。数据库迁移脚本详见 `backend/migration.sql`、`backend/migration_companion.sql`、`backend/migration_verify_questions.sql` 和 `backend/migration_utf8mb4.sql`。全表已转 utf8mb4_unicode_ci 支持 emoji。

## 部署信息

| 配置项 | 值 |
|--------|-----|
| 云托管环境 | 见云托管控制台 |


### 后端部署

1. 后端代码通过微信云托管控制台手动上传代码包部署
2. Dockerfile 基于 `python:3.9-slim`，设置 `TZ=Asia/Shanghai` 修正时区，使用 Gunicorn 启动
3. 环境变量通过 Dockerfile 的 ENV 指令或 .env 文件配置（DB_HOST、DB_PORT、DB_USER、DB_PASSWORD、DB_NAME、WX_APPID、WX_SECRET 等），详见 `.env.example`
4. 微信 API 调用使用 `http://api.weixin.qq.com`（避免容器 CA 证书缺失问题）

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
| POST | `/api/activity/withdraw` | 撤回待审核活动至草稿箱 |
| POST | `/api/activity/participate` | 报名活动（含同行人数） |
| POST | `/api/activity/cancel-participation` | 取消报名 |
| POST | `/api/activity/update-status` | 批量更新活动状态 |
| GET | `/api/activity/my-activities-with-audit` | 我发起的活动 |
| GET | `/api/activity/my-participations-grouped` | 我报名的活动 |
| POST | `/api/admin/review` | 管理员审核活动 |
| GET | `/api/admin/blacklist` | 获取黑名单用户列表 |
| POST | `/api/admin/remove-blacklist` | 解封黑名单用户 |
| POST | `/api/admin/reset-all-verification` | 全员重新验证 |
| GET | `/api/admin/verify-questions` | 获取验证问题列表 |
| POST | `/api/admin/verify-questions` | 添加验证问题 |
| PUT | `/api/admin/verify-questions/<id>` | 更新验证问题 |
| DELETE | `/api/admin/verify-questions/<id>` | 删除验证问题 |
| GET | `/api/reviews` | 活动回顾列表 |
| GET | `/api/reviews/<id>` | 活动回顾详情 |
| POST | `/api/reviews` | 新建活动回顾 |
