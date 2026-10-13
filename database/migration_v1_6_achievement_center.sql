-- v1.6：成就中心（MySQL 5.7 / CynosDB）
-- 可重复执行；创建成就、有效参与、彩蛋关联及实物徽章奖励表。
-- 六张里程碑图片须手动上传至脚本内固定的云存储路径。
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `achievement_definitions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL,
  `achievement_type` tinyint(4) NOT NULL COMMENT '1-累计里程碑 2-活动彩蛋',
  `name` varchar(100) NOT NULL,
  `description` varchar(500) NOT NULL DEFAULT '',
  `image_url` varchar(500) NOT NULL,
  `threshold_count` int(11) DEFAULT NULL COMMENT '累计官方活动次数；彩蛋徽章为空',
  `is_physical` tinyint(1) NOT NULL DEFAULT '0',
  `reward_name` varchar(100) NOT NULL DEFAULT '',
  `claim_instructions` varchar(500) NOT NULL DEFAULT '',
  `pickup_location` varchar(255) NOT NULL DEFAULT '',
  `sort_order` int(11) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` varchar(100) NOT NULL DEFAULT '',
  `updated_by` varchar(100) NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_achievement_code` (`code`),
  UNIQUE KEY `uk_achievement_milestone` (`achievement_type`,`threshold_count`),
  KEY `idx_achievement_active_order` (`achievement_type`,`is_active`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成就定义';

CREATE TABLE IF NOT EXISTS `achievement_activity_relations` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `achievement_id` int(11) NOT NULL,
  `activity_id` int(11) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` varchar(100) NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_achievement_activity` (`achievement_id`,`activity_id`),
  KEY `idx_achievement_relation_activity` (`activity_id`,`is_active`),
  CONSTRAINT `fk_achievement_relation_definition`
    FOREIGN KEY (`achievement_id`) REFERENCES `achievement_definitions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_achievement_relation_activity`
    FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活动彩蛋徽章关联';

CREATE TABLE IF NOT EXISTS `achievement_attendance` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_openid` varchar(100) NOT NULL,
  `activity_id` int(11) NOT NULL,
  `first_lottery_id` int(11) DEFAULT NULL,
  `first_record_id` bigint(20) DEFAULT NULL,
  `verified_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_achievement_attendance_user_activity` (`user_openid`,`activity_id`),
  KEY `idx_achievement_attendance_user_state` (`user_openid`,`status`,`verified_at`),
  KEY `idx_achievement_attendance_activity` (`activity_id`),
  CONSTRAINT `fk_achievement_attendance_activity`
    FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_achievement_attendance_lottery`
    FOREIGN KEY (`first_lottery_id`) REFERENCES `activity_lotteries` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_achievement_attendance_record`
    FOREIGN KEY (`first_record_id`) REFERENCES `lottery_records` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户有效官方活动参与记录';

CREATE TABLE IF NOT EXISTS `user_achievements` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_openid` varchar(100) NOT NULL,
  `achievement_id` int(11) NOT NULL,
  `source_activity_id` int(11) DEFAULT NULL,
  `source_type` varchar(20) NOT NULL DEFAULT 'milestone',
  `obtained_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_achievement` (`user_openid`,`achievement_id`),
  KEY `idx_user_achievement_time` (`user_openid`,`obtained_at`),
  CONSTRAINT `fk_user_achievement_definition`
    FOREIGN KEY (`achievement_id`) REFERENCES `achievement_definitions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_achievement_activity`
    FOREIGN KEY (`source_activity_id`) REFERENCES `activities` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户已获得成就';

CREATE TABLE IF NOT EXISTS `achievement_rewards` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_openid` varchar(100) NOT NULL,
  `achievement_id` int(11) NOT NULL,
  `source_activity_id` int(11) DEFAULT NULL,
  `prize_name` varchar(100) NOT NULL,
  `image_url` varchar(500) NOT NULL DEFAULT '',
  `claim_instructions` varchar(500) NOT NULL DEFAULT '',
  `pickup_location` varchar(255) NOT NULL DEFAULT '',
  `redeem_code` varchar(32) NOT NULL,
  `status` tinyint(4) NOT NULL DEFAULT '0' COMMENT '0-待核销 1-已核销',
  `redeemed_by` varchar(100) DEFAULT NULL,
  `redeemed_at` datetime DEFAULT NULL,
  `qr_token` varchar(64) DEFAULT NULL,
  `qr_expires_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_achievement_reward_user_badge` (`user_openid`,`achievement_id`),
  UNIQUE KEY `uk_achievement_reward_code` (`redeem_code`),
  UNIQUE KEY `uk_achievement_reward_qr` (`qr_token`),
  KEY `idx_achievement_reward_user_state` (`user_openid`,`status`,`created_at`),
  CONSTRAINT `fk_achievement_reward_definition`
    FOREIGN KEY (`achievement_id`) REFERENCES `achievement_definitions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_achievement_reward_activity`
    FOREIGN KEY (`source_activity_id`) REFERENCES `activities` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成就实物徽章奖励';

INSERT INTO `achievement_definitions`
  (`id`, `code`, `achievement_type`, `name`, `description`, `image_url`,
   `threshold_count`, `is_physical`, `reward_name`, `claim_instructions`,
   `sort_order`, `is_active`)
VALUES
  (1, 'MILESTONE_01', 1, '步步出沪', '「一步步走过当时心愿」',
   'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/achievement-center/badges/milestone-01.png',
   1, 0, '', '', 1, 1),
  (2, 'MILESTONE_05', 1, '疯狂世界', '「你是一种感觉 写在夏夜晚风里面」',
   'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/achievement-center/badges/milestone-05.png',
   5, 0, '', '', 2, 1),
  (3, 'MILESTONE_09', 1, '成名在望', '「曼陀罗花 沿途绽放 我们光脚越过人间荒唐」',
   'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/achievement-center/badges/milestone-09.png',
   9, 1, '成名在望实体徽章', '请联系步步出沪工作人员领取实体徽章。', 3, 1),
  (4, 'MILESTONE_15', 1, '笑忘歌', '「那一年天空很高 风很清澈 从头到脚趾都快乐」',
   'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/achievement-center/badges/milestone-15.png',
   15, 1, '笑忘歌实体徽章', '请联系步步出沪工作人员领取实体徽章。', 4, 1),
  (5, 'MILESTONE_25', 1, '诺亚方舟', '「原来幻想中的这天 会比幻想更唯美」',
   'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/achievement-center/badges/milestone-25.png',
   25, 1, '诺亚方舟实体徽章', '请联系步步出沪工作人员领取实体徽章。', 5, 1),
  (6, 'MILESTONE_50', 1, '花', '「当风雨都过去 迎着风看天空 不放弃才能够有感动」',
   'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/achievement-center/badges/milestone-50.png',
   50, 1, '花实体徽章', '请联系步步出沪工作人员领取实体徽章。', 6, 1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `image_url` = VALUES(`image_url`),
  `threshold_count` = VALUES(`threshold_count`),
  `is_physical` = VALUES(`is_physical`),
  `reward_name` = VALUES(`reward_name`),
  `claim_instructions` = VALUES(`claim_instructions`),
  `sort_order` = VALUES(`sort_order`);

-- 历史回填：只统计状态 1/3/4 的官方活动抽奖参与；同一活动只计一次。
INSERT IGNORE INTO `achievement_attendance`
  (`user_openid`, `activity_id`, `first_lottery_id`, `first_record_id`, `verified_at`, `status`)
SELECT r.`user_openid`, l.`activity_id`, MIN(r.`lottery_id`), MIN(r.`id`),
       MIN(r.`drawn_at`), 1
FROM `lottery_records` r
JOIN `activity_lotteries` l ON l.`id` = r.`lottery_id`
JOIN `activities` a ON a.`id` = l.`activity_id`
WHERE a.`is_official` = 1 AND a.`status` IN (1, 3, 4)
GROUP BY r.`user_openid`, l.`activity_id`;

-- 历史累计徽章自动点亮。
INSERT IGNORE INTO `user_achievements`
  (`user_openid`, `achievement_id`, `source_activity_id`, `source_type`, `obtained_at`)
SELECT totals.`user_openid`, d.`id`, NULL, 'milestone', NOW()
FROM (
  SELECT aa.`user_openid`, COUNT(*) AS `attendance_count`
  FROM `achievement_attendance` aa
  JOIN `activities` a ON a.`id` = aa.`activity_id`
  WHERE aa.`status` = 1 AND a.`is_official` = 1 AND a.`status` IN (1, 3, 4)
  GROUP BY aa.`user_openid`
) totals
JOIN `achievement_definitions` d
  ON d.`achievement_type` = 1
 AND d.`is_active` = 1
 AND d.`threshold_count` <= totals.`attendance_count`;

-- 首次点亮的历史实物徽章同步进入“我的奖品”。用户 + 成就唯一键防止重复发奖。
-- ACH 前缀与普通抽奖码隔离，稳定生成 32 位核销码，重复执行不改变已有奖品状态。
INSERT IGNORE INTO `achievement_rewards`
  (`user_openid`, `achievement_id`, `source_activity_id`, `prize_name`,
   `image_url`, `claim_instructions`, `pickup_location`, `redeem_code`, `status`)
SELECT ua.`user_openid`, ua.`achievement_id`, ua.`source_activity_id`,
       d.`reward_name`, d.`image_url`, d.`claim_instructions`, d.`pickup_location`,
       CONCAT('ACH-', UPPER(SUBSTRING(
         MD5(CONCAT('achievement:', ua.`user_openid`, ':', ua.`achievement_id`)), 1, 28
       ))), 0
FROM `user_achievements` ua
JOIN `achievement_definitions` d ON d.`id` = ua.`achievement_id`
WHERE d.`achievement_type` = 1 AND d.`is_physical` = 1
  AND d.`threshold_count` <= (
    SELECT COUNT(*) FROM `achievement_attendance` aa
    JOIN `activities` a ON a.`id` = aa.`activity_id`
    WHERE aa.`user_openid` = ua.`user_openid` AND aa.`status` = 1
      AND a.`is_official` = 1 AND a.`status` IN (1, 3, 4)
  );

SELECT `TABLE_NAME`
FROM `INFORMATION_SCHEMA`.`TABLES`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` IN (
    'achievement_definitions', 'achievement_activity_relations',
    'achievement_attendance', 'user_achievements', 'achievement_rewards'
  )
ORDER BY `TABLE_NAME`;
