-- ============================================================
-- 步步出沪 同行人功能迁移
-- 执行前请先备份数据库！
-- 使用方法: mysql -h <host> -P <port> -u <user> -p <database> < migration_companion.sql
-- ============================================================

SET NAMES utf8mb4;

-- ============================================================
-- activity_participants 表添加 companion_count 字段
-- 记录报名者的同行人数（不含本人），默认0，最大3
-- ============================================================
ALTER TABLE `activity_participants`
    ADD COLUMN `companion_count` int(11) NOT NULL DEFAULT 0
    COMMENT '同行人数（不含本人），0-3'
    AFTER `remark`;

-- 添加索引便于统计查询
ALTER TABLE `activity_participants`
    ADD INDEX `idx_companion_count` (`companion_count`);
