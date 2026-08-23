-- ============================================================
-- 官方账号白名单与官方活动标记迁移（MySQL 5.7 / CynosDB）
-- 执行前请备份数据库。本脚本可重复执行。
-- ============================================================

SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS `add_official_column_if_missing`;
DELIMITER $$
CREATE PROCEDURE `add_official_column_if_missing`(
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

CALL add_official_column_if_missing('users', 'isOfficial',
    '`isOfficial` tinyint(1) NOT NULL DEFAULT 0 COMMENT ''是否官方账号白名单：0-否，1-是'' AFTER `isAdmin`');
CALL add_official_column_if_missing('activities', 'is_official',
    '`is_official` tinyint(1) NOT NULL DEFAULT 0 COMMENT ''是否官方活动：0-否，1-是'' AFTER `is_force_insurance`');

DROP PROCEDURE `add_official_column_if_missing`;

DROP PROCEDURE IF EXISTS `add_official_index_if_missing`;
DELIMITER $$
CREATE PROCEDURE `add_official_index_if_missing`(
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

CALL add_official_index_if_missing('users', 'idx_isOfficial', '`isOfficial`');
CALL add_official_index_if_missing('activities', 'idx_status_official_created', '`status`,`is_official`,`created_at`');
DROP PROCEDURE `add_official_index_if_missing`;

-- 历史品牌活动回填：活动名称中包含“步步出沪”的记录统一标记为官方活动。
UPDATE `activities`
SET `is_official` = 1
WHERE `is_official` = 0
  AND `name` LIKE '%步步出沪%';

-- 官方活动只由独立发布入口创建，不再按创建人白名单状态批量推导。
-- 兼容上一版本可能留下的待审核官方活动：直接转为已发布。
UPDATE `activities`
SET `status` = 1, `reject_reason` = NULL, `reject_time` = NULL
WHERE `is_official` = 1 AND `status` = 0;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'users' AND COLUMN_NAME = 'isOfficial')
    OR (TABLE_NAME = 'activities' AND COLUMN_NAME = 'is_official')
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
