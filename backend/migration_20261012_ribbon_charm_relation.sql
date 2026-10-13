-- 可选：补齐早期飘带墙迁移遗漏的挂件索引及外键。
-- 本次个人资料入口调整不依赖此脚本；无需重跑 v1.5 / v1.6 全量迁移。
-- MySQL 5.7 / CynosDB，可重复执行，不修改墙面顺序或挂件数据。
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS `upgrade_20261012_charm_relation`;
DELIMITER $$
CREATE PROCEDURE `upgrade_20261012_charm_relation`()
BEGIN
    IF EXISTS (
        SELECT 1 FROM `ribbon_wall_charms` wc
        LEFT JOIN `ribbon_charms` c ON c.`id` = wc.`charm_id`
        WHERE wc.`charm_id` IS NOT NULL AND c.`id` IS NULL
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '挂件关联存在无效 charm_id，请先修复后重试';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'ribbon_wall_charms'
          AND INDEX_NAME = 'idx_wall_charm_asset'
    ) THEN
        ALTER TABLE `ribbon_wall_charms`
            ADD INDEX `idx_wall_charm_asset` (`charm_id`);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'ribbon_wall_charms'
          AND COLUMN_NAME = 'charm_id'
          AND REFERENCED_TABLE_NAME = 'ribbon_charms'
          AND REFERENCED_COLUMN_NAME = 'id'
    ) THEN
        ALTER TABLE `ribbon_wall_charms`
            ADD CONSTRAINT `fk_wall_charm_asset`
            FOREIGN KEY (`charm_id`) REFERENCES `ribbon_charms` (`id`)
            ON DELETE SET NULL;
    END IF;
END$$
DELIMITER ;

CALL `upgrade_20261012_charm_relation`();
DROP PROCEDURE `upgrade_20261012_charm_relation`;

SELECT INDEX_NAME, COLUMN_NAME
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'ribbon_wall_charms'
  AND INDEX_NAME = 'idx_wall_charm_asset';

SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'ribbon_wall_charms'
  AND COLUMN_NAME = 'charm_id'
  AND REFERENCED_TABLE_NAME = 'ribbon_charms';
