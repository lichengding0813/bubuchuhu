/*
 步步出沪数据库 - 活动出行方式表

 Source Server Type    : MySQL
 Source Server Version : 50718 (5.7.18-cynos-2.1.14-log)
 Source Schema         : flask_demo

 导出日期: 2026-06-25
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for activity_travel_options
-- ----------------------------
DROP TABLE IF EXISTS `activity_travel_options`;
CREATE TABLE `activity_travel_options` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `activity_id` int(11) NOT NULL COMMENT '活动ID',
  `travel_type` tinyint(4) NOT NULL COMMENT '出行方式：1-大巴 2-高铁 3-自驾',
  `bus_qr_url` varchar(500) DEFAULT NULL COMMENT '大巴群二维码（只有大巴时需要）',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_id` (`activity_id`),
  CONSTRAINT `activity_travel_options_ibfk_1` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='活动出行方式表';

SET FOREIGN_KEY_CHECKS = 1;
