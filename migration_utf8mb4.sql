-- ============================================================
-- 步步出沪 全表 utf8mb4 迁移（支持 emoji）
-- 执行前请先备份数据库！
-- ============================================================

SET NAMES utf8mb4;

-- activities（活动名称、简介、地点、路线、驳回原因等）
ALTER TABLE `activities` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- activity_participants（备注等）
ALTER TABLE `activity_participants` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- activity_audit_logs（审核原因）
ALTER TABLE `activity_audit_logs` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- activity_meeting_points（集合点位置）
ALTER TABLE `activity_meeting_points` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- activity_travel_options（大巴二维码 URL）
ALTER TABLE `activity_travel_options` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- review_photos（照片 URL、上传者）
ALTER TABLE `review_photos` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Counters（统一 charset）
ALTER TABLE `Counters` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 已是 utf8mb4 的表统一 collation 为 unicode_ci
ALTER TABLE `activity_reviews` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `users` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `verify_questions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
