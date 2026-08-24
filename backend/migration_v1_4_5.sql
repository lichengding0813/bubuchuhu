-- v1.4.5：超级管理员权限收敛 + 微信订阅消息（MySQL 5.7 / CynosDB）
-- 可重复执行；不会删除活动、报名、抽奖或用户数据。
SET NAMES utf8mb4;

-- 仅以下三个微信号保留超级管理员权限；同时确保其具备官方账号业务权限。
UPDATE `users`
SET `isAdmin` = CASE
  WHEN LOWER(TRIM(COALESCE(`wechatId`, ''))) IN (
    'sinkdream_0813', 'mayday1110sh', 'galaxy79215'
  ) THEN 1 ELSE 0 END;

UPDATE `users`
SET `isOfficial` = 1, `verified` = 1, `needVerify` = 0, `verifyAttempts` = 0
WHERE LOWER(TRIM(COALESCE(`wechatId`, ''))) IN (
  'sinkdream_0813', 'mayday1110sh', 'galaxy79215'
);

-- 已在官方白名单中的业务账号不再参与普通用户答题验证。
UPDATE `users`
SET `verified` = 1, `needVerify` = 0, `verifyAttempts` = 0
WHERE `isOfficial` = 1;

CREATE TABLE IF NOT EXISTS `notification_subscriptions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_openid` varchar(100) NOT NULL,
  `template_id` varchar(100) NOT NULL,
  `available_count` int(11) NOT NULL DEFAULT '0' COMMENT '尚可发送的一次性订阅额度',
  `accepted_count` int(11) NOT NULL DEFAULT '0',
  `rejected_count` int(11) NOT NULL DEFAULT '0',
  `sent_count` int(11) NOT NULL DEFAULT '0',
  `last_response` varchar(20) NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_subscription` (`user_openid`,`template_id`),
  KEY `idx_notification_credit` (`template_id`,`available_count`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='小程序订阅消息授权额度';

CREATE TABLE IF NOT EXISTS `notification_jobs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `template_id` varchar(100) NOT NULL,
  `recipient_openid` varchar(100) NOT NULL,
  `event_type` varchar(40) NOT NULL,
  `activity_id` int(11) DEFAULT NULL,
  `lottery_id` int(11) DEFAULT NULL,
  `dedupe_key` varchar(191) NOT NULL,
  `scheduled_at` datetime NOT NULL,
  `page_path` varchar(255) NOT NULL DEFAULT '',
  `payload_json` text NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `attempts` tinyint(4) NOT NULL DEFAULT '0',
  `next_attempt_at` datetime NOT NULL,
  `last_error` varchar(500) NOT NULL DEFAULT '',
  `sent_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_dedupe` (`dedupe_key`),
  KEY `idx_notification_due` (`status`,`next_attempt_at`,`scheduled_at`),
  KEY `idx_notification_recipient` (`recipient_openid`,`created_at`),
  KEY `idx_notification_activity` (`activity_id`),
  KEY `idx_notification_lottery` (`lottery_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订阅消息发送任务';

CREATE TABLE IF NOT EXISTS `notification_send_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `job_id` bigint(20) NOT NULL,
  `recipient_openid` varchar(100) NOT NULL,
  `template_id` varchar(100) NOT NULL,
  `status` varchar(20) NOT NULL,
  `errcode` int(11) NOT NULL DEFAULT '0',
  `errmsg` varchar(500) NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notification_log_job` (`job_id`),
  KEY `idx_notification_log_created` (`status`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订阅消息发送日志';

SELECT `wechatId`, `isAdmin`, `isOfficial`
FROM `users`
WHERE `isAdmin` = 1
ORDER BY `wechatId`;
