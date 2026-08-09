/* 步步出沪数据库 - 抽奖奖项表 */

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `lottery_prizes`;
CREATE TABLE `lottery_prizes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `lottery_id` int(11) NOT NULL,
  `tier_name` varchar(100) NOT NULL COMMENT '奖项名称',
  `tier_level` int(11) NOT NULL COMMENT '奖项排序',
  `quantity` int(11) NOT NULL DEFAULT '0' COMMENT '初始数量',
  `remaining` int(11) NOT NULL DEFAULT '0' COMMENT '剩余数量',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_lottery_tier` (`lottery_id`,`tier_level`),
  KEY `idx_lottery_remaining` (`lottery_id`,`remaining`),
  CONSTRAINT `lottery_prizes_ibfk_1` FOREIGN KEY (`lottery_id`) REFERENCES `activity_lotteries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖奖项';

SET FOREIGN_KEY_CHECKS = 1;
