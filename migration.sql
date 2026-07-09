-- ============================================================
-- 步步出沪 数据库优化迁移
-- 执行前请先备份数据库！
-- 使用方法: mysql -h <host> -P <port> -u <user> -p <database> < migration.sql
-- ============================================================

SET NAMES utf8mb4;

-- ============================================================
-- 1. 修复 users 表 lastLoginTime 的 ON UPDATE 问题
--    当前: ON UPDATE CURRENT_TIMESTAMP 会导致任何字段更新时
--           lastLoginTime 都被重置，这不符合预期
--    修复: 移除 ON UPDATE，保留 DEFAULT CURRENT_TIMESTAMP
-- ============================================================
ALTER TABLE `users`
    MODIFY COLUMN `lastLoginTime` timestamp NULL DEFAULT CURRENT_TIMESTAMP
    COMMENT '最后登录时间';

-- ============================================================
-- 2. 为 activity_reviews 添加 activity_id 关联字段
--    允许将回顾与具体活动关联，nullable 兼容旧数据
-- ============================================================
ALTER TABLE `activity_reviews`
    ADD COLUMN `activity_id` int(11) DEFAULT NULL
    COMMENT '关联的活动ID（可为空，兼容旧数据）'
    AFTER `id`;

-- 添加外键（CASCADE 可选，这里用 SET NULL 避免回顾被误删）
ALTER TABLE `activity_reviews`
    ADD CONSTRAINT `fk_activity_reviews_activity`
    FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 添加索引
ALTER TABLE `activity_reviews`
    ADD INDEX `idx_activity_id` (`activity_id`);

-- ============================================================
-- 3. 补充缺失的查询索引
-- ============================================================

-- activity_reviews: 按创建时间倒序是常用排序
ALTER TABLE `activity_reviews`
    ADD INDEX `idx_created_at` (`created_at`);

-- activities: 按状态+活动时间联合查询（首页列表常用）
ALTER TABLE `activities`
    ADD INDEX `idx_status_time` (`status`, `activity_time`);

-- activity_participants: 按状态查询报名记录
ALTER TABLE `activity_participants`
    ADD INDEX `idx_status` (`status`);

-- users: 管理员查询需要
ALTER TABLE `users`
    ADD INDEX `idx_isAdmin` (`isAdmin`);
