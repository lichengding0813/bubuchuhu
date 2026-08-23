/*
 步步出沪数据库 - 用户表

 Source Server Type    : MySQL
 Source Server Version : 50718 (5.7.18-cynos-2.1.14-log)
 Source Schema         : flask_demo

 导出日期: 2026-06-25
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `openId` varchar(50) NOT NULL DEFAULT '' COMMENT '用户唯一标识',
  `nickName` varchar(200) DEFAULT '' COMMENT '用户昵称',
  `avatarUrl` varchar(500) DEFAULT '' COMMENT '头像地址',
  `phoneNumber` varchar(50) DEFAULT '' COMMENT '手机号',
  `wechatId` varchar(100) DEFAULT '' COMMENT '微信号',
  `loginCount` int(11) DEFAULT '0' COMMENT '登录次数',
  `isBlacklist` tinyint(1) DEFAULT '0' COMMENT '是否黑名单：0-否，1-是',
  `blacklistSource` varchar(20) NOT NULL DEFAULT '' COMMENT '黑名单来源：manual-管理员手动，verification-答题超限',
  `blacklistedAt` datetime DEFAULT NULL COMMENT '加入黑名单时间',
  `blacklistedBy` varchar(100) DEFAULT NULL COMMENT '手动拉黑的管理员openid',
  `isAdmin` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否管理员：0-否，1-是',
  `isOfficial` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否官方账号白名单：0-否，1-是',
  `verifyAttempts` tinyint(1) DEFAULT '0' COMMENT '验证尝试次数',
  `needVerify` tinyint(1) DEFAULT '1' COMMENT '是否需要验证：0-否，1-是',
  `verified` tinyint(1) DEFAULT '0' COMMENT '是否通过验证：0-否，1-是',
  `createTime` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `lastLoginTime` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后登录时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_openid` (`openId`),
  KEY `idx_lastLoginTime` (`lastLoginTime`),
  KEY `idx_isBlacklist` (`isBlacklist`),
  KEY `idx_isOfficial` (`isOfficial`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

SET FOREIGN_KEY_CHECKS = 1;
