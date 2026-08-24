-- v1.4.4：抽奖 v2 全量重建（MySQL 5.7 / CynosDB）
-- 会删除旧抽奖、奖品、中奖记录；不修改活动、用户、报名等其他业务数据。
SET NAMES utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `lottery_redemptions`;
DROP TABLE IF EXISTS `lottery_chance_grants`;
DROP TABLE IF EXISTS `lottery_records`;
DROP TABLE IF EXISTS `lottery_user_states`;
DROP TABLE IF EXISTS `lottery_prizes`;
DROP TABLE IF EXISTS `activity_lotteries`;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE `activity_lotteries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `activity_id` int(11) NOT NULL,
  `lottery_name` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `start_time` datetime NOT NULL,
  `end_time` datetime NOT NULL,
  `status` tinyint(4) NOT NULL DEFAULT '0' COMMENT '0-按时间开放，2-手动结束',
  `created_by` varchar(100) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lottery_activity` (`activity_id`),
  KEY `idx_lottery_status_time` (`status`,`start_time`,`end_time`),
  CONSTRAINT `fk_lottery_activity` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='官方活动抽奖';

CREATE TABLE `lottery_prizes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `lottery_id` int(11) NOT NULL,
  `tier_name` varchar(100) NOT NULL,
  `tier_level` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  `remaining` int(11) NOT NULL,
  `probability_bps` int(11) NOT NULL COMMENT '中奖概率，万分比，10000=100%',
  `image_url` varchar(500) NOT NULL DEFAULT '',
  `claim_instructions` varchar(500) NOT NULL DEFAULT '',
  `pickup_location` varchar(255) NOT NULL DEFAULT '',
  `valid_until` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_lottery_tier` (`lottery_id`,`tier_level`),
  KEY `idx_lottery_prize_stock` (`lottery_id`,`remaining`),
  CONSTRAINT `fk_lottery_prize_lottery` FOREIGN KEY (`lottery_id`) REFERENCES `activity_lotteries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖奖品档位';

CREATE TABLE `lottery_user_states` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `lottery_id` int(11) NOT NULL,
  `user_openid` varchar(100) NOT NULL,
  `password_attempts` tinyint(4) NOT NULL DEFAULT '0',
  `attempts_date` date DEFAULT NULL,
  `chances_total` int(11) NOT NULL DEFAULT '1',
  `chances_used` int(11) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_lottery_user_state` (`lottery_id`,`user_openid`),
  KEY `idx_lottery_state_user` (`user_openid`,`updated_at`),
  CONSTRAINT `fk_lottery_state_lottery` FOREIGN KEY (`lottery_id`) REFERENCES `activity_lotteries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户抽奖机会与口令状态';

CREATE TABLE `lottery_records` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `lottery_id` int(11) NOT NULL,
  `user_openid` varchar(100) NOT NULL,
  `prize_id` int(11) DEFAULT NULL,
  `chance_no` int(11) NOT NULL,
  `drawn_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_lottery_user_chance` (`lottery_id`,`user_openid`,`chance_no`),
  KEY `idx_lottery_record_user` (`user_openid`,`drawn_at`),
  KEY `idx_lottery_record_prize` (`prize_id`),
  CONSTRAINT `fk_lottery_record_lottery` FOREIGN KEY (`lottery_id`) REFERENCES `activity_lotteries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lottery_record_prize` FOREIGN KEY (`prize_id`) REFERENCES `lottery_prizes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每一次实际抽奖记录';

CREATE TABLE `lottery_redemptions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `record_id` bigint(20) NOT NULL,
  `redeem_code` varchar(32) NOT NULL,
  `status` tinyint(4) NOT NULL DEFAULT '0' COMMENT '0-待核销，1-已核销，2-已过期',
  `redeemed_by` varchar(100) DEFAULT NULL,
  `redeemed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_redemption_record` (`record_id`),
  UNIQUE KEY `uk_redemption_code` (`redeem_code`),
  KEY `idx_redemption_status` (`status`,`updated_at`),
  CONSTRAINT `fk_redemption_record` FOREIGN KEY (`record_id`) REFERENCES `lottery_records` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='中奖奖品核销';

CREATE TABLE `lottery_chance_grants` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `lottery_id` int(11) NOT NULL,
  `user_openid` varchar(100) NOT NULL,
  `quantity` int(11) NOT NULL,
  `reason` varchar(255) NOT NULL DEFAULT '',
  `created_by` varchar(100) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lottery_grant_user` (`lottery_id`,`user_openid`,`created_at`),
  CONSTRAINT `fk_lottery_grant_lottery` FOREIGN KEY (`lottery_id`) REFERENCES `activity_lotteries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员追加抽奖机会记录';

SELECT `TABLE_NAME`
FROM `INFORMATION_SCHEMA`.`TABLES`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` IN (
    'activity_lotteries', 'lottery_prizes', 'lottery_user_states',
    'lottery_records', 'lottery_redemptions', 'lottery_chance_grants'
  )
ORDER BY `TABLE_NAME`;
