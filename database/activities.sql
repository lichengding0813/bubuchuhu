/*
 步步出沪数据库 - 活动主表

 Source Server Type    : MySQL
 Source Server Version : 50718 (5.7.18-cynos-2.1.14-log)
 Source Schema         : flask_demo

 导出日期: 2026-06-25
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for activities
-- ----------------------------
DROP TABLE IF EXISTS `activities`;
CREATE TABLE `activities` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `activity_no` varchar(32) NOT NULL COMMENT '活动编号，唯一标识',
  `name` varchar(100) NOT NULL COMMENT '活动名称',
  `description` text COMMENT '活动描述',
  `activity_time` datetime DEFAULT NULL COMMENT '活动开始时间；草稿可为空',
  `end_time` datetime DEFAULT NULL COMMENT '活动结束时间；旧数据为空时由应用按开始时间后12小时兼容',
  `location` varchar(255) NOT NULL COMMENT '活动地点',
  `latitude` decimal(10,7) DEFAULT NULL COMMENT '活动地点纬度',
  `longitude` decimal(10,7) DEFAULT NULL COMMENT '活动地点经度',
  `route` text COMMENT '路线简介',
  `distance` decimal(8,2) DEFAULT '0.00' COMMENT '预计里程(km)',
  `climb` int(11) DEFAULT '0' COMMENT '累计爬升(m)',
  `difficulty` tinyint(4) NOT NULL COMMENT '难度等级：1-5星',
  `max_participants` int(11) DEFAULT '20' COMMENT '人数限制',
  `deadline` datetime DEFAULT NULL COMMENT '报名截止时间',
  `cover_url` varchar(500) DEFAULT NULL COMMENT '封面图URL',
  `group_qr_url` varchar(500) DEFAULT NULL COMMENT '微信群二维码',
  `wechat_id` varchar(50) DEFAULT NULL COMMENT '发起人微信号',
  `status` tinyint(4) DEFAULT '0' COMMENT '状态：0-待审核 1-审核通过 2-审核拒绝 3-进行中 4-已结束 5-已取消',
  `view_count` int(11) DEFAULT '0' COMMENT '浏览次数',
  `created_by` varchar(100) NOT NULL COMMENT '创建人openId',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `reject_reason` varchar(500) DEFAULT NULL COMMENT '驳回原因',
  `reject_time` datetime DEFAULT NULL COMMENT '驳回时间',
  `is_full` tinyint(1) DEFAULT '0' COMMENT '是否已满员 0-否 1-是',
  `is_force_insurance` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否强制购买户外保险 (0-不强制, 1-强制)',
  `is_official` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否官方活动：0-否，1-是',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_activity_no` (`activity_no`),
  KEY `idx_created_by` (`created_by`),
  KEY `idx_status` (`status`),
  KEY `idx_activity_time` (`activity_time`),
  KEY `idx_status_end_time` (`status`,`end_time`),
  KEY `idx_status_official_created` (`status`,`is_official`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活动主表';

SET FOREIGN_KEY_CHECKS = 1;
