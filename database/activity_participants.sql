/*
 步步出沪数据库 - 活动报名表

 Source Server Type    : MySQL
 Source Server Version : 50718 (5.7.18-cynos-2.1.14-log)
 Source Schema         : flask_demo

 导出日期: 2026-07-15
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for activity_participants
-- ----------------------------
DROP TABLE IF EXISTS `activity_participants`;
CREATE TABLE `activity_participants` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `activity_id` int(11) NOT NULL COMMENT '活动ID',
  `user_openid` varchar(100) NOT NULL COMMENT '用户openId',
  `nickname` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户昵称',
  `phone` varchar(20) DEFAULT NULL COMMENT '联系电话',
  `wechat_id` varchar(50) DEFAULT NULL COMMENT '微信号',
  `status` tinyint(4) DEFAULT '0' COMMENT '状态：0-已取消 1-已报名',
  `travel_option` tinyint(4) DEFAULT NULL COMMENT '选择的出行方式：1-大巴 2-高铁 3-自驾',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `companion_count` int(11) NOT NULL DEFAULT '0' COMMENT '同行人数（不含本人），0-3',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_activity_user` (`activity_id`,`user_openid`),
  KEY `idx_activity_id` (`activity_id`),
  KEY `idx_user_openid` (`user_openid`),
  KEY `idx_status` (`status`),
  KEY `idx_companion_count` (`companion_count`),
  CONSTRAINT `activity_participants_ibfk_1` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='活动报名表';

SET FOREIGN_KEY_CHECKS = 1;
