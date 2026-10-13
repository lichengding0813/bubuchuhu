# 项目功能总结

核对日期：2026-10-13。当前源码版本为 v1.4.1。根据前后端代码、测试和只读数据库核对梳理；代码、部署包和迁移脚本已准备，线上部署、真机验收与小程序发布仍待完成。

## 项目组成

「步步出沪 | 徒然好想走」面向五月天粉丝群体，提供户外徒步活动的发现、组织、报名、回顾和现场抽奖管理。

| 层级 | 当前实现 |
|---|---|
| 小程序 | 微信原生 WXML/WXSS/JavaScript，Vant Weapp；27 个注册页面、6 个自定义组件 |
| 后端 | Flask，7 个业务蓝图；共 89 处路由声明，包含健康检查 |
| 数据库 | MySQL/CynosDB，PyMySQL、DBUtils 连接池；现有生产数据库共 31 张表 |
| 部署 | Docker、Gunicorn、微信云托管；前端通过 `wx.cloud.callContainer` 调用后端 |
| 图片 | 微信云存储上传、图片预览、封面、头像、微信群二维码和回顾照片墙 |

## 已实现功能

| 模块 | 用户可用能力与主要规则 | 主要实现 |
|---|---|---|
| 登录与身份验证 | 微信登录自动注册；缓存登录状态；随机验证问题、多答案；累计答错 3 次进入黑名单；每题可配置图片，提交前核对图片、题目和答案；头像、昵称、手机号和微信号设置 | `backend/app.py`；`pages/home`、`pages/profile`、`pages/settings` |
| 活动发现 | 近期/往期活动切换、只看官方、人数统计、下拉刷新、分页加载、回到顶部、活动分享；显示报名截止、已报名、满员等状态 | `routes/activity_routes.py`；`pages/home`、`components/activity-card` |
| 活动发布 | 名称、简介、开始/结束时间、报名截止时间、地图选点、多集合点、大巴/高铁/自驾、富文本路线、里程、爬升、五星难度、人数、保险提示、封面和群二维码 | `backend/domain.py`；`routes/activity_routes.py`；`pages/publish` |
| 草稿与审核 | 保存/修改/删除草稿、提交审核、驳回原因、修改后重提、待审核撤回草稿；活动按开始与结束时间更新状态 | `routes/activity_routes.py`、`routes/admin_routes.py`；`pages/my-created-activities`、`pages/admin-review`、`pages/admin-detail` |
| 报名 | 阅读须知后报名；可带 0–3 名同行人，按本人加同行人占名额；防重复报名、检查剩余人数与截止时间；活动开始前可自主取消及重新报名 | `routes/activity_routes.py`；`pages/details`、`pages/notice`、`pages/my-joined-activities` |
| 报名管理 | 有效、自主取消、管理取消分组；显示联系信息和同行人数；管理取消及恢复、记录操作人与时间；恢复时校验名额，被管理取消的用户不能自行重新报名 | `backend/domain.py`；`routes/activity_routes.py`；`pages/activity-participants` |
| 活动取消 | 普通活动由发起人取消，官方活动由官方账号或超级管理员取消；仅报名中、进行中且未结束活动可取消；状态变为已取消，停止报名、抽奖及待发送提醒，保留报名和奖品历史 | `activity_service.py`；`routes/activity_routes.py`；`pages/my-created-activities`、`pages/official-activities` |
| 官方活动 | 官方账号共享创建和编辑官方活动，免人工审核，统一标题前缀与认证徽章；普通活动上限 100 人、官方活动上限 200 人 | `routes/activity_routes.py`；`pages/official-activities`、`pages/publish` |
| 日历、地图与天气 | 月视图活动标记、按日期查看活动、地图查看活动及集合地点；详情、审核和日历页面仅在活动开始前 24 小时内展示天气，使用 Open-Meteo 单日天气与本地天气图标 | `routes/activity_routes.py`；`utils/time.js`、`utils/weather.js`；`pages/calendar`、`pages/details`、`pages/admin-detail` |
| 幸运转盘 | 仅官方活动创建抽奖；最多 12 个奖项，配置图片、库存、固定中奖概率、时间、现场口令和领奖说明；有效报名用户默认有一次机会，每日最多答错口令 3 次；支持追加机会、修改口令、提前结束、记录筛选 | `backend/domain.py`；`routes/lottery_routes.py`；`pages/lottery-admin`、`components/lottery-popup` |
| 奖品核销 | 中奖生成长期核销码和仅包含随机令牌的动态二维码；二维码每 120 秒自动刷新，旧码随即失效；我的奖品可重新出示二维码；有权限的账号可唤醒相机扫码核销，也可手动输入核销码；抽奖结束后已有奖品仍可核销 | `routes/lottery_routes.py`；`pages/my-prizes`、`pages/lottery-admin`、`components/lottery-popup` |
| 活动回顾 | 回顾列表、分享、富文本总结、三类封面和照片墙；超级管理员从尚无回顾的官方活动导入基础信息，防重复创建；可编辑，后端支持软删除 | `routes/review_bp.py`；`pages/review`、`pages/review-detail`、`pages/review_add` |
| 个人中心 | 我发起的、我报名的、草稿箱、我的奖品；“我报名的”展示有效报名且已结束活动的累计次数、里程、爬升；登录后可维护个人资料，报名时保留原有资料校验；说明联系方式用途和删除／注销联系渠道 | `backend/app.py`；`pages/profile` 及对应列表页面 |
| 飘带墙 | 动态墙面浏览、状态筛选、详情、手动点亮与取消；超级管理员从统一悬浮齿轮进入后台，新建墙面，上传和编辑飘带/挂件素材，并对两类素材统一排序 | `routes/ribbon_routes.py`、`ribbon_domain.py`；`pages/ribbon-wall`、`pages/ribbon-wall-admin` |
| 成就中心 | 以有效报名加正确现场抽奖口令核验官方活动参与，同一活动只计一次，仅计状态 1／3／4；累计徽章阈值为 1、5、9、15、25、50 次，支持活动彩蛋；实物奖励进入我的奖品并使用现有核销流程 | `achievement_service.py`、`routes/achievement_routes.py`；`pages/achievement-center`、`pages/achievement-admin` |
| 业务管理 | 审核普通活动、手动拉黑/解封、记录黑名单来源、查看答题记录、验证题增删改查、逐题图片上传与启停、全员重新验证 | `routes/admin_routes.py`；`pages/blacklist`、`pages/verify-management`、`pages/admin-review` |
| 官方账号管理 | 超级管理员搜索已注册用户，加入/移出官方白名单；名单为空时可初始化当前管理员；移出不改变历史官方活动 | `routes/admin_routes.py`；`pages/official-accounts` |
| 订阅消息 | 用户主动授权后发送活动开始前 24 小时内的行前提醒、抽奖开始前 5 分钟内的提醒；向已订阅业务管理员发送待审核和答题超限拉黑提醒；管理手动拉黑不发送该提醒 | `backend/notification_service.py`、`routes/notification_routes.py`；`utils/notifications.js` |

表中 `routes/` 位于 `backend/`，`pages/`、`components/`、`utils/` 位于 `miniprogram/`。

## 权限与运行机制

- 普通活动报名名单仅发起人可管理；官方活动报名名单由官方账号和超级管理员共同管理。
- 官方账号和超级管理员均可进行活动审核、抽奖及黑名单、验证题管理；官方账号名单与回顾编辑由超级管理员管理。
- 飘带墙和成就配置入口及写接口仅向超级管理员开放；普通用户及官方账号可浏览并修改自己的飘带点亮状态。验证题管理沿用官方账号与超级管理员权限。
- 已实现微信文本/图片内容检测、部分接口限流、用户状态缓存、上传图片地址与体积校验。内容检测服务异常时部分后端检查会放行，因此不能将这些能力理解为完整的安全审计结论。
- 报名和抽奖核心写入使用数据库事务及行锁，抽奖按整数万分比计算概率，售罄奖项对应区间转为未中奖。
- 订阅消息保存授权额度、去重任务、发送日志和重试状态；容器后台默认每 60 秒处理一次，MySQL 全局锁协调多个 worker，依赖至少一个持续运行实例。
- 数据库、微信服务端及旧心知天气接口的凭证由环境变量读取，仓库中的 `.env.example` 用于配置示例。

## 当前边界与升级说明

1. **筛选与看板**：首页已提供可报名、官方、难度和月份筛选；后端另有关键词、出行方式筛选及管理统计接口，尚无完整管理看板页面。
2. **天气**：详情、审核、日历与行前提醒主要使用 Open-Meteo；旧心知天气接口仍保留，依赖环境变量。当前页面不是常驻的七天天气预报。
3. **回顾图片**：导入官方活动带入基础信息与报名人数，人合照、卜合照、公益记录图片仍需单独上传。
4. **资料删除与注销**：目前通过联系管理员申请，未提供自助注销接口。验证答题次数、拉黑及解封规则保持原有流程。
5. **本次增量 SQL**：现有数据库的成就、活动取消和奖品表结构已满足要求；每题图片需要执行 `migration_20261013_verify_question_images.sql`。旧题统一初始化默认图，重复执行不覆盖之后上传的图片。不要重跑历史抽奖重建或飘带初始化脚本。
6. **版本标识**：当前产品版号统一为 `1.4.1`，个人页和最新更新记录读取公共配置，包配置与 README 同步。历史迁移文件名中的编号保留用于追溯。
7. **验证范围**：87 项后端隔离测试、538 项前端断言及 JS／JSON／页面注册检查通过；已只读核对新增字段需求并 PREPARE 验证迁移语法，未执行生产 DDL。微信真机、消息实际送达和完整上传／核销流程仍需验收。

## 分支整理与凭证记录

- 远程保留 `dev` 和 `master`，均以整理前最新完整项目 `5e8083b` 为基础，附加本次文档更新；GitHub 默认分支保持 `master`。
- 清理的 8 个远程分支：`backend`、`database`、`codex/v1.3-weather-fix`、`codex/v1.4-complete`、`codex/v1.4.1`、`codex/v1.4.2`、`codex/v1.4.3`、`codex/v1.4.4`。
- `codex/*` 的提交均已被最新完整项目包含；独立的后端和数据库分支按文件核对，业务代码及表结构已在完整项目中保留并扩展，未把旧部署包和 IDE 文件合入项目。
- 清理前的全部远程分支通过本机 Git bundle 备份，原有未提交修改另存补丁和文件校验值。备份放在被忽略的 `local-deploy/branch-backups/`，不上传。
- 当前待保留源码未检出部署密码或服务端密钥；旧 Git 历史中发现过数据库密码和微信 Secret，应确认这些旧凭证已轮换。删除分支不会清除所有历史副本，本次未重写历史。
- 2026-09-07 的文档提交仅包含当时的功能总结和分支指引。当前 v1.4.1 同步范围为安全源码、测试、数据库脚本及更新说明；本机私有部署配置与账号测试备份不进入 Git。
