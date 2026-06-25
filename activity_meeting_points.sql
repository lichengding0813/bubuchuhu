/*
 步步出沪数据库 - 活动集合点表

 Source Server Type    : MySQL
 Source Server Version : 50718 (5.7.18-cynos-2.1.14-log)
 Source Schema         : flask_demo

 导出日期: 2026-06-25
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for activity_meeting_points
-- ----------------------------
DROP TABLE IF EXISTS `activity_meeting_points`;
CREATE TABLE `activity_meeting_points` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `activity_id` int(11) NOT NULL COMMENT '活动ID',
  `point_order` tinyint(4) NOT NULL COMMENT '集合点顺序',
  `meeting_time` varchar(50) NOT NULL COMMENT '集合时间（可存格式：HH:MM 或具体时间）',
  `location` varchar(255) NOT NULL COMMENT '集合地点',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_id` (`activity_id`),
  CONSTRAINT `activity_meeting_points_ibfk_1` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='活动集合点表';

SET FOREIGN_KEY_CHECKS = 1;
