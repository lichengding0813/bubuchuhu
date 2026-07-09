/*
 步步出沪数据库 - 活动审核记录表

 Source Server Type    : MySQL
 Source Server Version : 50718 (5.7.18-cynos-2.1.14-log)
 Source Schema         : flask_demo

 导出日期: 2026-06-25
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for activity_audit_logs
-- ----------------------------
DROP TABLE IF EXISTS `activity_audit_logs`;
CREATE TABLE `activity_audit_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `activity_id` int(11) NOT NULL COMMENT '活动ID',
  `auditor_openid` varchar(100) DEFAULT NULL COMMENT '审核人openId',
  `action` tinyint(4) NOT NULL COMMENT '操作：1-提交审核 2-审核通过 3-审核拒绝',
  `reason` varchar(255) DEFAULT NULL COMMENT '拒绝原因',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_id` (`activity_id`),
  CONSTRAINT `activity_audit_logs_ibfk_1` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='活动审核记录表';

SET FOREIGN_KEY_CHECKS = 1;
