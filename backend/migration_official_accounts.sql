-- 官方账号白名单与官方活动标记迁移（MySQL 5.7 / CynosDB）。可重复执行。
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS `add_official_column_if_missing`;
DELIMITER $$
CREATE PROCEDURE `add_official_column_if_missing`(
    IN p_table varchar(64), IN p_column varchar(64), IN p_definition text
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN ', p_definition);
        PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL add_official_column_if_missing('users', 'isOfficial',
    '`isOfficial` tinyint(1) NOT NULL DEFAULT 0 COMMENT ''是否官方账号白名单：0-否，1-是'' AFTER `isAdmin`');
CALL add_official_column_if_missing('activities', 'is_official',
    '`is_official` tinyint(1) NOT NULL DEFAULT 0 COMMENT ''是否官方活动：0-否，1-是'' AFTER `is_force_insurance`');
DROP PROCEDURE `add_official_column_if_missing`;

DROP PROCEDURE IF EXISTS `add_official_index_if_missing`;
DELIMITER $$
CREATE PROCEDURE `add_official_index_if_missing`(
    IN p_table varchar(64), IN p_index varchar(64), IN p_columns varchar(255)
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_columns, ')');
        PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL add_official_index_if_missing('users', 'idx_isOfficial', '`isOfficial`');
CALL add_official_index_if_missing('activities', 'idx_status_official_created', '`status`,`is_official`,`created_at`');
DROP PROCEDURE `add_official_index_if_missing`;

-- 官方活动只由独立发布入口创建；兼容旧版待审核官方活动。
UPDATE `activities`
SET `status` = 1, `reject_reason` = NULL, `reject_time` = NULL
WHERE `is_official` = 1 AND `status` = 0;
