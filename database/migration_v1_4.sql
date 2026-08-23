-- ============================================================
-- 步步出沪 v1.4 数据库迁移（MySQL 5.7 / CynosDB）
-- 执行前请备份数据库。本脚本可重复执行。
-- ============================================================

SET NAMES utf8mb4;

-- 草稿允许暂不填写开始时间；正式发布由应用层强制校验。
ALTER TABLE `activities`
    MODIFY COLUMN `activity_time` datetime DEFAULT NULL COMMENT '活动开始时间；草稿可为空';

DROP PROCEDURE IF EXISTS `add_column_if_missing`;
DELIMITER $$
CREATE PROCEDURE `add_column_if_missing`(
    IN p_table varchar(64),
    IN p_column varchar(64),
    IN p_definition text
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_table
          AND COLUMN_NAME = p_column
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN ', p_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('activities', 'end_time',
    '`end_time` datetime DEFAULT NULL COMMENT ''活动结束时间'' AFTER `activity_time`');
CALL add_column_if_missing('activities', 'latitude',
    '`latitude` decimal(10,7) DEFAULT NULL COMMENT ''活动地点纬度'' AFTER `location`');
CALL add_column_if_missing('activities', 'longitude',
    '`longitude` decimal(10,7) DEFAULT NULL COMMENT ''活动地点经度'' AFTER `latitude`');
CALL add_column_if_missing('activities', 'is_official',
    '`is_official` tinyint(1) NOT NULL DEFAULT 0 COMMENT ''是否官方活动：0-否，1-是'' AFTER `is_force_insurance`');
CALL add_column_if_missing('users', 'isOfficial',
    '`isOfficial` tinyint(1) NOT NULL DEFAULT 0 COMMENT ''是否官方账号白名单：0-否，1-是'' AFTER `isAdmin`');
CALL add_column_if_missing('activity_meeting_points', 'latitude',
    '`latitude` decimal(10,7) DEFAULT NULL COMMENT ''集合点纬度'' AFTER `location`');
CALL add_column_if_missing('activity_meeting_points', 'longitude',
    '`longitude` decimal(10,7) DEFAULT NULL COMMENT ''集合点经度'' AFTER `latitude`');
CALL add_column_if_missing('activity_reviews', 'activity_id',
    '`activity_id` int(11) DEFAULT NULL COMMENT ''关联的官方活动ID'' AFTER `id`');

DROP PROCEDURE `add_column_if_missing`;

DROP PROCEDURE IF EXISTS `add_index_if_missing`;
DELIMITER $$
CREATE PROCEDURE `add_index_if_missing`(
    IN p_table varchar(64),
    IN p_index varchar(64),
    IN p_columns varchar(255)
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_table
          AND INDEX_NAME = p_index
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_columns, ')');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL add_index_if_missing('activities', 'idx_status_end_time', '`status`,`end_time`');
CALL add_index_if_missing('activities', 'idx_status_official_created', '`status`,`is_official`,`created_at`');
CALL add_index_if_missing('users', 'idx_isOfficial', '`isOfficial`');
CALL add_index_if_missing('activity_reviews', 'idx_activity_id', '`activity_id`');
DROP PROCEDURE `add_index_if_missing`;

DROP PROCEDURE IF EXISTS `add_review_activity_fk_if_missing`;
DELIMITER $$
CREATE PROCEDURE `add_review_activity_fk_if_missing`()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'activity_reviews'
          AND COLUMN_NAME = 'activity_id'
          AND REFERENCED_TABLE_NAME = 'activities'
          AND REFERENCED_COLUMN_NAME = 'id'
    ) THEN
        ALTER TABLE `activity_reviews`
            ADD CONSTRAINT `fk_activity_reviews_activity`
            FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`)
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END$$
DELIMITER ;

CALL add_review_activity_fk_if_missing();
DROP PROCEDURE `add_review_activity_fk_if_missing`;

-- 历史品牌活动回填：活动名称中包含“步步出沪”的记录统一标记为官方活动。
UPDATE `activities`
SET `is_official` = 1
WHERE `is_official` = 0
  AND `name` LIKE '%步步出沪%';

-- 官方活动只由独立发布入口创建；兼容旧版待审核官方活动。
UPDATE `activities`
SET `status` = 1, `reject_reason` = NULL, `reject_time` = NULL
WHERE `is_official` = 1 AND `status` = 0;

-- 仅为仍在报名或进行中的旧活动补兼容结束时间；历史已结束数据保持不变。
UPDATE `activities`
SET `end_time` = DATE_ADD(`activity_time`, INTERVAL 12 HOUR)
WHERE `end_time` IS NULL AND `status` IN (1, 3);

CREATE TABLE IF NOT EXISTS `activity_lotteries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `activity_id` int(11) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `start_time` datetime NOT NULL,
  `end_time` datetime NOT NULL,
  `status` tinyint(4) NOT NULL DEFAULT '0',
  `created_by` varchar(100) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_id` (`activity_id`),
  KEY `idx_status_time` (`status`,`start_time`,`end_time`),
  CONSTRAINT `activity_lotteries_ibfk_1` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lottery_prizes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `lottery_id` int(11) NOT NULL,
  `tier_name` varchar(100) NOT NULL,
  `tier_level` int(11) NOT NULL,
  `quantity` int(11) NOT NULL DEFAULT '0',
  `remaining` int(11) NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_lottery_tier` (`lottery_id`,`tier_level`),
  KEY `idx_lottery_remaining` (`lottery_id`,`remaining`),
  CONSTRAINT `lottery_prizes_ibfk_1` FOREIGN KEY (`lottery_id`) REFERENCES `activity_lotteries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lottery_records` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `lottery_id` int(11) NOT NULL,
  `user_openid` varchar(100) NOT NULL,
  `prize_id` int(11) DEFAULT NULL,
  `password_attempts` tinyint(4) NOT NULL DEFAULT '0',
  `draw_status` tinyint(4) NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `drawn_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_lottery_user` (`lottery_id`,`user_openid`),
  KEY `idx_user_openid` (`user_openid`),
  KEY `idx_prize_id` (`prize_id`),
  CONSTRAINT `lottery_records_ibfk_1` FOREIGN KEY (`lottery_id`) REFERENCES `activity_lotteries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lottery_records_ibfk_2` FOREIGN KEY (`prize_id`) REFERENCES `lottery_prizes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 兼容曾经手工创建过的早期抽奖表：补齐 1.4 正式结构。
DROP PROCEDURE IF EXISTS `upgrade_legacy_lottery_tables`;
DELIMITER $$
CREATE PROCEDURE `upgrade_legacy_lottery_tables`()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'activity_lotteries'
          AND COLUMN_NAME = 'password_hash'
    ) THEN
        ALTER TABLE `activity_lotteries`
            ADD COLUMN `password_hash` varchar(255) DEFAULT NULL AFTER `activity_id`;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'activity_lotteries'
          AND COLUMN_NAME = 'password'
    ) THEN
        SET @copy_password =
            'UPDATE `activity_lotteries` SET `password_hash` = CASE WHEN `password_hash` IS NOT NULL AND `password_hash` <> '''' THEN `password_hash` WHEN `password` IS NOT NULL AND `password` <> '''' THEN CONCAT(''sha256$'', SHA2(`password`, 256)) ELSE CONCAT(''legacy-disabled-'', `id`) END';
        PREPARE stmt FROM @copy_password;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        ALTER TABLE `activity_lotteries` DROP COLUMN `password`;
    ELSE
        UPDATE `activity_lotteries`
        SET `password_hash` = CONCAT('legacy-disabled-', `id`)
        WHERE `password_hash` IS NULL OR `password_hash` = '';
    END IF;

    ALTER TABLE `activity_lotteries`
        MODIFY COLUMN `password_hash` varchar(255) NOT NULL;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'lottery_records'
          AND COLUMN_NAME = 'draw_status'
    ) THEN
        ALTER TABLE `lottery_records`
            ADD COLUMN `draw_status` tinyint(4) NOT NULL DEFAULT '0' AFTER `password_attempts`;
        UPDATE `lottery_records` SET `draw_status` = 1 WHERE `prize_id` IS NOT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'lottery_records'
          AND COLUMN_NAME = 'drawn_at'
    ) THEN
        ALTER TABLE `lottery_records`
            ADD COLUMN `drawn_at` datetime DEFAULT NULL AFTER `created_at`;
        UPDATE `lottery_records`
        SET `drawn_at` = `created_at`
        WHERE `draw_status` = 1 AND `drawn_at` IS NULL;
    END IF;
END$$
DELIMITER ;

CALL upgrade_legacy_lottery_tables();
DROP PROCEDURE `upgrade_legacy_lottery_tables`;

-- 验证关键结构
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'activities' AND COLUMN_NAME IN ('end_time', 'latitude', 'longitude', 'is_official'))
    OR (TABLE_NAME = 'users' AND COLUMN_NAME = 'isOfficial')
    OR (TABLE_NAME = 'activity_meeting_points' AND COLUMN_NAME IN ('latitude', 'longitude'))
    OR (TABLE_NAME = 'activity_reviews' AND COLUMN_NAME = 'activity_id')
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('activity_lotteries', 'lottery_prizes', 'lottery_records')
ORDER BY TABLE_NAME;
