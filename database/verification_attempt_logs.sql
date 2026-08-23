/* 步步出沪数据库 - 用户验证答题记录 */

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `verification_attempt_logs`;
CREATE TABLE `verification_attempt_logs` (
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

SET FOREIGN_KEY_CHECKS = 1;
