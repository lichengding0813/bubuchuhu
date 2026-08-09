/* 步步出沪数据库 - 用户抽奖记录表 */

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `lottery_records`;
CREATE TABLE `lottery_records` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `lottery_id` int(11) NOT NULL,
  `user_openid` varchar(100) NOT NULL,
  `prize_id` int(11) DEFAULT NULL COMMENT '为空且draw_status=1表示谢谢参与',
  `password_attempts` tinyint(4) NOT NULL DEFAULT '0',
  `draw_status` tinyint(4) NOT NULL DEFAULT '0' COMMENT '0-仅口令尝试 1-已完成抽奖',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `drawn_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_lottery_user` (`lottery_id`,`user_openid`),
  KEY `idx_user_openid` (`user_openid`),
  KEY `idx_prize_id` (`prize_id`),
  CONSTRAINT `lottery_records_ibfk_1` FOREIGN KEY (`lottery_id`) REFERENCES `activity_lotteries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lottery_records_ibfk_2` FOREIGN KEY (`prize_id`) REFERENCES `lottery_prizes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户抽奖记录';

SET FOREIGN_KEY_CHECKS = 1;
