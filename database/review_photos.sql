/*
 步步出沪数据库 - 回顾照片表

 Source Server Type    : MySQL
 Source Server Version : 50718 (5.7.18-cynos-2.1.14-log)
 Source Schema         : flask_demo

 导出日期: 2026-06-25
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for review_photos
-- ----------------------------
DROP TABLE IF EXISTS `review_photos`;
CREATE TABLE `review_photos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `review_id` int(11) NOT NULL,
  `url` varchar(500) NOT NULL,
  `uploader` varchar(50) DEFAULT '管理员',
  `sort_order` int(11) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `review_id` (`review_id`),
  CONSTRAINT `review_photos_ibfk_1` FOREIGN KEY (`review_id`) REFERENCES `activity_reviews` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

SET FOREIGN_KEY_CHECKS = 1;
