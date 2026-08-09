-- 官方账号功能回滚脚本。执行前请备份数据库。
SET NAMES utf8mb4;

ALTER TABLE `activities` DROP INDEX `idx_status_official_created`;
ALTER TABLE `users` DROP INDEX `idx_isOfficial`;

DROP PROCEDURE IF EXISTS `drop_official_column_if_exists`;
DELIMITER $$
CREATE PROCEDURE `drop_official_column_if_exists`(IN p_table varchar(64), IN p_column varchar(64))
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` DROP COLUMN `', p_column, '`');
        PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL drop_official_column_if_exists('activities', 'is_official');
CALL drop_official_column_if_exists('users', 'isOfficial');
DROP PROCEDURE `drop_official_column_if_exists`;
