-- ============================================================
-- 步步出沪 v1.4 回滚脚本
-- 警告：会永久删除抽奖数据和经纬度/结束时间，请仅在备份后使用。
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `lottery_records`;
DROP TABLE IF EXISTS `lottery_prizes`;
DROP TABLE IF EXISTS `activity_lotteries`;
SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE `activity_meeting_points`
  DROP COLUMN `longitude`,
  DROP COLUMN `latitude`;

ALTER TABLE `activities`
  DROP INDEX `idx_status_official_created`,
  DROP INDEX `idx_status_end_time`,
  DROP COLUMN `is_official`,
  DROP COLUMN `longitude`,
  DROP COLUMN `latitude`,
  DROP COLUMN `end_time`;

ALTER TABLE `users`
  DROP INDEX `idx_isOfficial`,
  DROP COLUMN `isOfficial`;
