-- v1.4.8：120 秒动态奖品核销二维码（MySQL 5.7 / CynosDB）
-- 可重复执行；不会删除抽奖、中奖或核销记录。
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS `upgrade_v148_redemption_qr`;
DELIMITER $$
CREATE PROCEDURE `upgrade_v148_redemption_qr`()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'lottery_redemptions'
          AND COLUMN_NAME = 'qr_token'
    ) THEN
        ALTER TABLE `lottery_redemptions`
            ADD COLUMN `qr_token` varchar(64) DEFAULT NULL
            COMMENT '120秒动态核销二维码随机令牌'
            AFTER `redeemed_at`;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'lottery_redemptions'
          AND COLUMN_NAME = 'qr_expires_at'
    ) THEN
        ALTER TABLE `lottery_redemptions`
            ADD COLUMN `qr_expires_at` datetime DEFAULT NULL
            COMMENT '动态核销二维码过期时间'
            AFTER `qr_token`;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'lottery_redemptions'
          AND INDEX_NAME = 'uk_redemption_qr_token'
    ) THEN
        ALTER TABLE `lottery_redemptions`
            ADD UNIQUE KEY `uk_redemption_qr_token` (`qr_token`);
    END IF;
END$$
DELIMITER ;

CALL `upgrade_v148_redemption_qr`();
DROP PROCEDURE `upgrade_v148_redemption_qr`;

SELECT `COLUMN_NAME`, `COLUMN_TYPE`, `IS_NULLABLE`
FROM `INFORMATION_SCHEMA`.`COLUMNS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` = 'lottery_redemptions'
  AND `COLUMN_NAME` IN ('qr_token', 'qr_expires_at')
ORDER BY `ORDINAL_POSITION`;
