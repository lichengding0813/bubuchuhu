-- v1.4.2：抽奖奖品图片（MySQL 5.7 / CynosDB，可重复执行）
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS `add_v1_4_2_column_if_missing`;
DELIMITER $$
CREATE PROCEDURE `add_v1_4_2_column_if_missing`(
    IN table_name_param varchar(64),
    IN column_name_param varchar(64),
    IN column_definition text
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = table_name_param
          AND COLUMN_NAME = column_name_param
    ) THEN
        SET @ddl = CONCAT(
            'ALTER TABLE `', table_name_param, '` ADD COLUMN `',
            column_name_param, '` ', column_definition
        );
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL add_v1_4_2_column_if_missing(
    'lottery_prizes',
    'image_url',
    'varchar(500) DEFAULT '''' COMMENT ''奖品图片'' AFTER `remaining`'
);

DROP PROCEDURE `add_v1_4_2_column_if_missing`;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lottery_prizes'
  AND COLUMN_NAME = 'image_url';
