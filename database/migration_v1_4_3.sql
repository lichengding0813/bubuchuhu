-- v1.4.3：黑名单来源与验证答题记录（MySQL 5.7 / CynosDB，可重复执行）
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS `add_v143_column_if_missing`;
DELIMITER $$
CREATE PROCEDURE `add_v143_column_if_missing`(
    IN p_table_name VARCHAR(64),
    IN p_column_name VARCHAR(64),
    IN p_column_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_table_name
          AND COLUMN_NAME = p_column_name
    ) THEN
        SET @v143_sql = CONCAT(
            'ALTER TABLE `', p_table_name, '` ADD COLUMN ', p_column_definition
        );
        PREPARE v143_stmt FROM @v143_sql;
        EXECUTE v143_stmt;
        DEALLOCATE PREPARE v143_stmt;
    END IF;
END$$
DELIMITER ;

CALL add_v143_column_if_missing(
    'users', 'blacklistSource',
    '`blacklistSource` varchar(20) NOT NULL DEFAULT '''' COMMENT ''黑名单来源：manual-管理员手动，verification-答题超限'' AFTER `isBlacklist`'
);
CALL add_v143_column_if_missing(
    'users', 'blacklistedAt',
    '`blacklistedAt` datetime DEFAULT NULL COMMENT ''加入黑名单时间'' AFTER `blacklistSource`'
);
CALL add_v143_column_if_missing(
    'users', 'blacklistedBy',
    '`blacklistedBy` varchar(100) DEFAULT NULL COMMENT ''手动拉黑的管理员openid'' AFTER `blacklistedAt`'
);

DROP PROCEDURE `add_v143_column_if_missing`;

UPDATE `users`
SET `blacklistSource` = CASE
    WHEN COALESCE(`verifyAttempts`, 0) >= 3 THEN 'verification'
    ELSE 'manual'
END,
`blacklistedAt` = COALESCE(`blacklistedAt`, `lastLoginTime`, `createTime`)
WHERE `isBlacklist` = 1
  AND (`blacklistSource` IS NULL OR `blacklistSource` = '');

CREATE TABLE IF NOT EXISTS `verification_attempt_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_openid` varchar(100) NOT NULL,
  `question_id` int(11) DEFAULT NULL,
  `question_text` varchar(500) NOT NULL DEFAULT '',
  `submitted_answer` varchar(100) NOT NULL DEFAULT '',
  `is_correct` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_verify_log_user_time` (`user_openid`,`created_at`),
  KEY `idx_verify_log_result` (`is_correct`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户验证答题记录';

SELECT `COLUMN_NAME`
FROM `INFORMATION_SCHEMA`.`COLUMNS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` = 'users'
  AND `COLUMN_NAME` IN ('blacklistSource', 'blacklistedAt', 'blacklistedBy')
ORDER BY `COLUMN_NAME`;

SELECT COUNT(*) AS `verification_attempt_logs_ready`
FROM `INFORMATION_SCHEMA`.`TABLES`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` = 'verification_attempt_logs';
