/* 步步出沪数据库 - 活动抽奖主表 */

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `activity_lotteries`;
CREATE TABLE `activity_lotteries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `activity_id` int(11) NOT NULL COMMENT '关联活动ID',
  `password_hash` varchar(255) NOT NULL COMMENT '抽奖口令哈希，不保存明文',
  `start_time` datetime NOT NULL COMMENT '开放时间',
  `end_time` datetime NOT NULL COMMENT '结束时间',
  `status` tinyint(4) NOT NULL DEFAULT '0' COMMENT '0-按时间开放 1-兼容旧活动中 2-已结束',
  `created_by` varchar(100) NOT NULL COMMENT '创建管理员openid',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_id` (`activity_id`),
  KEY `idx_status_time` (`status`,`start_time`,`end_time`),
  CONSTRAINT `activity_lotteries_ibfk_1` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活动抽奖';

SET FOREIGN_KEY_CHECKS = 1;
