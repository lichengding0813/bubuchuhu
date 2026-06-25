/*
 步步出沪数据库 - 活动回顾表

 Source Server Type    : MySQL
 Source Server Version : 50718 (5.7.18-cynos-2.1.14-log)
 Source Schema         : flask_demo

 导出日期: 2026-06-25
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for activity_reviews
-- ----------------------------
DROP TABLE IF EXISTS `activity_reviews`;
CREATE TABLE `activity_reviews` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `time` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `difficulty` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '中等',
  `distance` decimal(10,2) DEFAULT '0.00',
  `climb` int(11) DEFAULT '0',
  `participants` int(11) DEFAULT '0',
  `summary` text COLLATE utf8mb4_unicode_ci,
  `summary_time` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cover` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cover2` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cover3` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '公益记录图片',
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `status` tinyint(4) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
