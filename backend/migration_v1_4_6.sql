-- v1.4.6：抽奖口令改为明文可修改，兑换码永久有效（MySQL 5.7 / CynosDB）
-- 可重复执行；不会删除抽奖、中奖或核销记录。
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS `upgrade_v146_lottery`;
DELIMITER $$
CREATE PROCEDURE `upgrade_v146_lottery`()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'activity_lotteries'
          AND COLUMN_NAME = 'password'
    ) THEN
        ALTER TABLE `activity_lotteries`
            ADD COLUMN `password` text NULL COMMENT '现场抽奖口令（明文，可修改）' AFTER `lottery_name`;
    END IF;

    IF EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'activity_lotteries'
          AND COLUMN_NAME = 'password_hash'
    ) THEN
        ALTER TABLE `activity_lotteries` DROP COLUMN `password_hash`;
    END IF;

    IF EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'lottery_prizes'
          AND COLUMN_NAME = 'valid_until'
    ) THEN
        ALTER TABLE `lottery_prizes` DROP COLUMN `valid_until`;
    END IF;
END$$
DELIMITER ;

CALL `upgrade_v146_lottery`();
DROP PROCEDURE `upgrade_v146_lottery`;

UPDATE `lottery_redemptions` SET `status` = 0 WHERE `status` = 2;
ALTER TABLE `lottery_redemptions`
    MODIFY COLUMN `status` tinyint(4) NOT NULL DEFAULT '0' COMMENT '0-待核销，1-已核销';

SELECT `COLUMN_NAME`, `COLUMN_TYPE`, `IS_NULLABLE`
FROM `INFORMATION_SCHEMA`.`COLUMNS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND (`TABLE_NAME`, `COLUMN_NAME`) IN (
    ('activity_lotteries', 'password'),
    ('lottery_redemptions', 'status')
  )
ORDER BY `TABLE_NAME`, `ORDINAL_POSITION`;
