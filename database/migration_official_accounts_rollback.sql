-- 官方账号功能回滚脚本。执行前请备份数据库。
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS `drop_official_index_if_exists`;
DELIMITER $$
CREATE PROCEDURE `drop_official_index_if_exists`(
    IN p_table varchar(64),
    IN p_index varchar(64)
)
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_table
          AND INDEX_NAME = p_index
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` DROP INDEX `', p_index, '`');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL drop_official_index_if_exists('activities', 'idx_status_official_created');
CALL drop_official_index_if_exists('users', 'idx_isOfficial');
DROP PROCEDURE `drop_official_index_if_exists`;

DROP PROCEDURE IF EXISTS `drop_official_column_if_exists`;
DELIMITER $$
CREATE PROCEDURE `drop_official_column_if_exists`(
    IN p_table varchar(64),
    IN p_column varchar(64)
)
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_table
          AND COLUMN_NAME = p_column
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` DROP COLUMN `', p_column, '`');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL drop_official_column_if_exists('activities', 'is_official');
CALL drop_official_column_if_exists('users', 'isOfficial');
DROP PROCEDURE `drop_official_column_if_exists`;
