-- v1.4.7：活动报名管理（MySQL 5.7 / CynosDB）
-- 可重复执行；保留所有现有报名和取消记录。
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS `upgrade_v147_participant_management`;
DELIMITER $$
CREATE PROCEDURE `upgrade_v147_participant_management`()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'activity_participants'
          AND COLUMN_NAME = 'cancel_source'
    ) THEN
        ALTER TABLE `activity_participants`
            ADD COLUMN `cancel_source` varchar(20) NOT NULL DEFAULT ''
            COMMENT '取消来源：self-用户自主，manager-管理操作'
            AFTER `companion_count`;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'activity_participants'
          AND COLUMN_NAME = 'cancelled_by'
    ) THEN
        ALTER TABLE `activity_participants`
            ADD COLUMN `cancelled_by` varchar(100) DEFAULT NULL
            COMMENT '管理取消操作账号openId'
            AFTER `cancel_source`;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'activity_participants'
          AND COLUMN_NAME = 'cancelled_at'
    ) THEN
        ALTER TABLE `activity_participants`
            ADD COLUMN `cancelled_at` datetime DEFAULT NULL
            COMMENT '取消时间'
            AFTER `cancelled_by`;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'activity_participants'
          AND INDEX_NAME = 'idx_cancel_source'
    ) THEN
        ALTER TABLE `activity_participants`
            ADD INDEX `idx_cancel_source` (`activity_id`, `status`, `cancel_source`);
    END IF;
END$$
DELIMITER ;

CALL `upgrade_v147_participant_management`();
DROP PROCEDURE `upgrade_v147_participant_management`;

-- 迁移前已有的 status=0 均为用户自主取消，保持原业务含义。
UPDATE `activity_participants`
SET `cancel_source` = 'self'
WHERE `status` = 0 AND COALESCE(`cancel_source`, '') = '';

SELECT `COLUMN_NAME`, `COLUMN_TYPE`, `IS_NULLABLE`, `COLUMN_DEFAULT`
FROM `INFORMATION_SCHEMA`.`COLUMNS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` = 'activity_participants'
  AND `COLUMN_NAME` IN ('cancel_source', 'cancelled_by', 'cancelled_at')
ORDER BY `ORDINAL_POSITION`;
