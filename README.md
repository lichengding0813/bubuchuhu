
# 步步出沪 | 徒然好想走

> 「步步出沪 | 徒然好想走」是一个以五月天粉丝群体为核心的户外徒步活动管理小程序。用户可以发现、发起和报名徒步活动，也可以查看活动回顾；普通活动沿用管理员审核流程，官方白名单账号发起时可选择普通或官方类型，并共同维护免审核发布的官方活动。小程序集成微信云托管服务，实现前后端一体化部署。

## 扫码体验

![步步出沪小程序码](./miniprogram-code.jpg)

## 版本历史

### v1.4.4（2026-08-23）
- 🎡 活动详情新增右下角悬浮抽奖卡，直接展示结束倒计时、奖品档位、数量和图片；抽奖完成或过期后自动收起
- 🎁 抽奖弹窗同步展示奖品信息，并修复「立即抽奖」按钮文字垂直偏下
- 🥕 官方账号在发起页可选择普通活动或官方活动；官方标题固定展示「【步步出沪】」前缀，服务端同步强制规范
- 👤 官方账号搜索结果的「加入」按钮缩短，与「移出」按钮保持一致

### v1.4.3（2026-08-23）
- ⛅ 日历与详情天气优先使用活动经纬度查询，并在旧活动缺少坐标时按行政区名称降级匹配
- 🥕 活动详情发起人和“我的”页官方认证统一为头像右下角萝卜人徽章，白名单“移出”按钮缩短
- 🚫 黑名单区分“管理员手动”和“答题错误超限”，支持搜索用户手动拉黑及查看答题记录
- 🎁 补齐指定官方账号参与龙王潭活动的数据，使有效期内抽奖入口可见

### v1.4.2（2026-08-23）
- 🏠 首页移除搜索区域，无封面活动文案更新为「一步步走过当时心愿」
- 🗺️ 发起活动补齐地图选点隐私声明、显式入口和失败反馈，统一发布/暂存按钮样式
- ⛅ 日历在选择有活动的日期后，按首个活动地点展示对应天气
- 📖 活动回顾移除所选活动名称前的萝卜人，并由前后端共同阻止重复发布
- 🎁 抽奖奖项支持图片，开始和结束时间均精确到分钟，中奖结果展示奖品图
- 👤 白名单为空时可一键将当前管理员设为首个官方账号，缩短搜索按钮，并移除审核页数据看板

### v1.4.1（2026-08-23）
- 🔧 微信登录配置回退：恢复 7 月 22 日稳定包的微信 API 默认地址与 requests 请求行为，仅保留错误日志脱敏
- 🎨 活动标题不再重复展示萝卜人，仅保留“官方”标签和账号认证徽章；结束活动展示实际参与人数
- 🔧 活动日历修复右翻页按钮和重复 `wx:key` 警告，区分“今天”与“已选择”，当日活动列表统一为首页卡片样式
- 🎨 首页搜索框下移并移除 3 处辅助副标题，减少视觉拥挤

### v1.4.0（2026-07-29）
- ✨ 官方活动共享管理：管理员维护账号白名单，官方账号从独立入口免审核发布并共同编辑，活动支持萝卜人认证角标和“只看官方”筛选
- ✨ 品牌活动识别：历史名称中包含「步步出沪」的活动自动回填为官方活动
- 🎨 首页视觉焕新：品牌 Banner 与悬浮搜索框、发起活动/活动日历双快捷入口、首张精选大图卡和后续紧凑活动卡
- ✨ 首页 Tab 分页：近期活动 / 往期活动两个 tab，分页加载、下拉刷新、回顶浮窗
- ✨ 活动搜索：首页搜索栏支持按名称、地点搜索活动
- ✨ 用户徒步统计：个人页累计活动 / 累计里程 / 累计爬升
- ✨ 天气预报：活动详情页 7 天天气卡片（心知天气）
- ✨ 地图选点：活动地点和集合点支持 wx.chooseLocation 地图选点
- ✨ 管理员看板：审核页顶部统计卡片（待审核/已通过/总用户/本周报名）
- ✨ 活动日历：月视图日历页，日期标记活动数量，点击查看当天活动列表
- ✨ 活动抽奖：管理员创建抽奖（选活动+配奖品+设口令），用户双入口（启动弹窗+详情页轮盘图标），资格校验（参与记录+口令3次机会），加权随机算法
- ✨ 活动回顾导入：新建回顾时选择已有官方活动，自动带入活动信息、报名人数和活动封面，并防止同一官方活动重复创建有效回顾
- 🔧 管理员列表加分页加载（onReachBottom）和下拉刷新
- 🔧 个人页：管理员和普通用户菜单用分割线区分，"关于我们"移至首页 banner 点击跳转
- 🔧 底部版本号更新为 v1.4.0，点击跳转更新日志页
- 🔧 难度/出行筛选暂隐藏（后端已支持，下版本上线）
- 🔧 活动开始/结束时间完整建模，状态不再在开始时直接变为已结束
- 🔧 地图坐标从发布、草稿、审核、详情到导航形成完整链路
- 🔧 定时抽奖按时间自动开放，口令改为哈希保存，抽奖记录与奖品库存支持并发事务
- 🔧 统一“我报名的”“我发起的”和审核页面中的保险必购字段，修复活动要求购买保险但列表显示为“否”的问题
- 🔧 首页剩余名额增加边界保护，接口数据短暂不一致时不再显示负数
- 🔧 修复 home.wxml 末尾多余闭合标签导致 WXML 编译错误

### v1.3.0（2026-07-22）
- ✨ 活动总结 & 路线简介改为富文本编辑器，支持加粗、字号、颜色、分割线
- ✨ 撤回待审核活动：待审核状态可一键撤回至草稿箱，继续编辑后重新提交
- ✨ 报名人员列表优化：统计只计有效报名（不含已取消），已取消报名折叠展示+灰色样式
- ✨ 难度等级改为点击星级选择（1-5 星），取代下拉框
- ✨ 验证问题启用/禁用改为左右滑动开关
- ✨ 我发起的页面 tab 调整为：已通过 → 待审核 → 草稿箱
- ✨ 草稿保存后弹窗提示并回首页，指引用户到「我的-我发起的-草稿箱」查看
- ✨ 发起者须知从弹窗改为独立页面（与报名须知一致的滚动阅读体验）
- 🔧 微信 API 固定使用 HTTPS，Docker 镜像安装 CA 证书
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

本仓库包含完整项目代码，按前端、后端、数据库分为三个目录：

```
├── miniprogram/        # 微信小程序源码（微信开发者工具项目根目录）
│   ├── app.js / app.json / app.wxss
│   ├── pages/                  # 首页、日历、详情、发布、个人中心等
│   ├── components/             # 公共组件
│   ├── utils/                  # 统一配置、API、时间和图片工具
│   ├── package.json / package-lock.json
│   └── images/                 # 静态资源
├── backend/            # 后端代码（Flask 应用）
│   ├── app.py                  # Flask 主入口
│   ├── config.py               # 集中配置模块
│   ├── db_utils.py             # 数据库连接池
│   ├── middleware.py           # 鉴权中间件
│   ├── routes/                 # 路由蓝图（活动、管理、回顾、抽奖）
│   ├── Dockerfile              # 云托管容器构建
│   ├── requirements.txt        # Python 依赖
│   ├── .env.example            # 环境变量模板
│   ├── migration.sql           # 数据库迁移脚本（索引优化等）
│   ├── migration_companion.sql # 同行人功能迁移脚本
│   ├── migration_verify_questions.sql # 验证问题表迁移脚本
│   ├── migration_utf8mb4.sql    # 全表 utf8mb4 迁移脚本（支持 emoji）
│   ├── migration_v1_4.sql       # v1.4 时间、坐标、抽奖、官方账号与回顾关联迁移
│   ├── migration_v1_4_2.sql     # v1.4.2 抽奖奖品图迁移
│   ├── migration_v1_4_3.sql     # v1.4.3 黑名单来源与答题日志迁移
│   └── migration_official_accounts.sql # 官方账号功能独立增量迁移
├── database/           # 数据库建表语句
│   ├── users.sql
│   ├── activities.sql
│   ├── activity_participants.sql
│   └── ...                     # 其他建表与增量迁移脚本
├── README.md
└── miniprogram-code.jpg
```

`node_modules/` 与微信开发者工具生成的 `miniprogram_npm/` 不进入 Git；拉取后按依赖锁文件重新构建。

## 核心功能

### 用户系统
- **微信登录**：通过 `wx.login` 获取 code，后端调用微信 API 换取 openid，自动注册/登录
- **验证机制**：新用户需回答验证问题（4 道题随机分配，3 次错误锁定账户）
- **黑名单管理**：被锁定用户全页面遮罩，无法操作（首页、个人页、活动回顾页）
- **个人资料**：昵称、手机号、微信号、头像，发布/报名前校验资料完整性

### 活动管理
- **发布活动**：填写活动名称、描述、时间、地点、出行方式（大巴/高铁/自驾）、集合点、路线（富文本）、难度（点击星级）、人数限制、报名截止时间、强制保险等
- **草稿箱**：发起活动时可暂存草稿，在「我发起的 - 草稿箱」中查看、编辑或删除；草稿保存后提示并回首页
- **活动审核**：普通活动由管理员审核（通过/拒绝），拒绝后可修改重新提交；官方活动不进入该审核队列
- **撤回功能**：待审核状态的活动可一键撤回至草稿箱，继续编辑后重新提交
- **活动状态**：草稿 → 待审核 → 报名中 → 进行中 → 已结束（后端自动更新状态）；待审核可撤回 → 草稿
- **活动列表**：首页提供「近期活动 / 往期活动」切换、关键词搜索和“只看官方”筛选；首条活动使用精选大图卡，其余使用紧凑横卡
- **官方活动**：从「官方活动管理」独立入口发布，免人工审核；全部官方账号可共同查看和编辑，活动卡片和发布者昵称旁显示萝卜人认证徽章，首页支持“只看官方”；迁移脚本会将历史名称中包含「步步出沪」的活动回填为官方活动

### 报名系统
- **报名**：勾选协议须知（强制 3 秒阅读倒计时）→ 选择同行人数 → 确认报名
- **同行人**：报名时可选择 0-3 名同行人（不含本人），名额相应扣减，发起人可在报名列表中查看
- **取消报名**：取消后释放名额，可重新报名
- **报名人员查看**：发起人可查看报名人员列表，统计仅计有效报名（不含已取消），已取消报名折叠展示
- **协议须知**：参与者须知、大巴免责声明、自驾/高铁免责声明、发起者须知（均为独立页面，滚动阅读）
- **报名状态**：实时显示剩余名额、已报名状态
- **保险提示**：是否必须购买户外保险由活动配置统一决定，并在“我报名的”“我发起的”和审核页面保持一致

### 活动回顾
- **回顾列表**：展示所有已发布的活动回顾
- **回顾详情**：图文展示活动精彩瞬间
- **新建回顾**：管理员从尚未创建回顾的官方活动中选择来源，系统自动带入名称、时间、地点、难度、里程、爬升、有效报名人数和活动封面；基础信息可微调，活动总结支持富文本编辑
- **来源约束**：新回顾必须关联官方活动，后端校验官方标记并阻止重复创建；历史未关联回顾仍可继续查看和编辑

### 管理员功能
- **活动审核**：查看待审核活动，通过或拒绝（待审核菜单显示数量徽标）
- **黑名单管理**：查看黑名单用户列表，一键解封（重置答错次数，用户可重新答题）
- **验证问题管理**：增删改查验证问题，支持启用/禁用（左右滑动开关）、多答案
- **全员重新验证**：一键重置所有用户的验证状态
- **参与人员查看**：查看活动报名人员列表
- **官方账号管理**：按昵称、微信号或用户标识搜索用户，可加入或移出白名单；移出后仅撤销官方活动管理权限，历史官方活动保持不变

## 数据库设计

主要数据表：

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `users` | 用户表 | openId, nickName, avatarUrl, phoneNumber, wechatId, verified, needVerify, isBlacklist, isAdmin, isOfficial, verifyAttempts |
| `activities` | 活动表 | id, name, activity_time, end_time, location, latitude, longitude, difficulty, distance, climb, max_participants, deadline, status, is_official, created_by |
| `activity_meeting_points` | 集合点表 | id, activity_id, meeting_time, location, latitude, longitude |
| `activity_travel_options` | 出行方式表 | id, activity_id, travel_type (1=大巴, 2=高铁, 3=自驾), bus_qr_url |
| `activity_participants` | 报名记录表 | id, activity_id, user_openid, nickname, phone, wechat_id, status, remark, companion_count |
| `activity_reviews` | 活动回顾表 | id, activity_id, name, time, location, participants, summary, cover |
| `verify_questions` | 验证问题表 | id, question, answers, sort_order, is_active |
| `activity_lotteries` / `lottery_prizes` / `lottery_records` | 抽奖配置、奖品库存与用户抽奖结果 | password_hash, start_time, end_time, remaining, draw_status |

> 建表语句详见 `database/`。已经完成 v1.4 升级的环境，本次只需备份后执行 `database/migration_v1_4_2.sql`，补齐 `lottery_prizes.image_url`。官方白名单为空时，由管理员在页面上二次确认后初始化自己的账号，不自动扩大权限。全新数据库直接执行最新的 `database/migration_v1_4.sql`。

## 部署信息

| 配置项 | 值 |
|--------|-----|
| 云托管环境 | 见云托管控制台 |


### 后端部署

1. 后端代码通过微信云托管控制台手动上传代码包部署
2. Dockerfile 基于 `python:3.9-slim`，设置 `TZ=Asia/Shanghai` 修正时区，使用 Gunicorn 启动
3. 仓库版 Dockerfile 不保存凭证。DB、微信和天气凭证通过云托管 Secret/环境变量注入，变量名详见 `.env.example`
4. 微信 API 仅通过 `https://api.weixin.qq.com` 调用

> 凭证策略：Git 仓库只保存安全版；本地部署版可保留私有 Dockerfile 和 `.env`，不得提交。两版同步时必须排除这些私有文件。

### 前端部署

1. 使用微信开发者工具打开前端项目
2. 云开发环境初始化为对应云托管环境 ID
3. 所有接口通过 `wx.cloud.callContainer` 调用云托管服务
4. 请求头需携带 `X-WX-SERVICE: flask-mysql-login` 和 `X-Wx-OpenId`

## 本地开发

### 后端

```bash
# 克隆仓库（master 包含全部代码，也可单独拉 backend 分支）
git clone https://github.com/lichengding0813/bubuchuhu.git
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
# 使用微信开发者工具打开 miniprogram/ 目录
# 在工具中配置对应的 AppID
# 在 miniprogram/ 执行 npm ci，然后在工具中「构建 npm」
```

## API 接口概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/login` | 用户登录/注册 |
| POST | `/verify` | 验证问题校验 |
| POST | `/update_profile` | 更新用户资料 |
| GET | `/user/stats` | 获取用户徒步统计 |
| GET | `/api/weather` | 获取活动地点天气预报 |
| GET | `/api/activity/list` | 获取活动列表 |
| GET | `/api/activity/detail` | 获取活动详情 |
| POST | `/api/activity/create` | 创建活动 |
| GET | `/api/activity/calendar` | 获取日历活动数据 |
| GET | `/api/activity/official-activities` | 获取官方账号共享活动列表 |
| POST | `/api/activity/official-activities/create` | 免审核创建官方活动 |
| POST | `/api/activity/official-activities/update` | 官方账号共同编辑官方活动 |
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
| GET | `/api/admin/dashboard` | 获取管理员看板统计 |
| POST | `/api/admin/review-activity` | 管理员审核普通活动 |
| GET | `/api/admin/blacklist` | 获取黑名单用户列表 |
| POST | `/api/admin/remove-blacklist` | 解封黑名单用户 |
| POST | `/api/admin/reset-all-verification` | 全员重新验证 |
| GET | `/api/admin/verify-questions` | 获取验证问题列表 |
| POST | `/api/admin/verify-questions` | 添加验证问题 |
| PUT | `/api/admin/verify-questions/<id>` | 更新验证问题 |
| DELETE | `/api/admin/verify-questions/<id>` | 删除验证问题 |
| GET | `/api/admin/official-accounts` | 获取官方账号白名单 |
| GET | `/api/admin/official-account-candidates` | 搜索可加入白名单的用户 |
| POST | `/api/admin/official-accounts` | 添加官方账号 |
| POST | `/api/admin/official-accounts/remove` | 移除官方账号 |
| POST | `/api/admin/lottery/create` | 创建活动抽奖 |
| GET | `/api/admin/lottery/list` | 获取抽奖管理列表 |
| POST | `/api/admin/lottery/end` | 提前结束抽奖 |
| POST | `/api/lottery/check` | 检查用户可参与的抽奖 |
| POST | `/api/lottery/draw` | 校验口令并抽奖 |
| GET | `/api/lottery/my-result` | 获取用户抽奖结果 |
| GET | `/api/reviews` | 活动回顾列表 |
| GET | `/api/reviews/<id>` | 活动回顾详情 |
| POST | `/api/reviews` | 新建活动回顾 |
| GET | `/api/reviews/official-activities` | 获取尚未创建回顾的官方活动 |
