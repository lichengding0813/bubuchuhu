/*
 步步出沪数据库 - 验证问题表

 Source Server Type    : MySQL
 Source Server Version : 50718 (5.7.18-cynos-2.1.14-log)
 Source Schema         : flask_demo

 导出日期: 2026-07-15
*/

SET NAMES utf8mb4;

-- ----------------------------
-- Table structure for verify_questions
-- ----------------------------
DROP TABLE IF EXISTS `verify_questions`;
CREATE TABLE `verify_questions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `question` varchar(500) NOT NULL COMMENT '问题文本',
  `answers` text NOT NULL COMMENT '可接受的答案，逗号分隔',
  `sort_order` int(11) DEFAULT '0' COMMENT '排序权重',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否启用（0=禁用，1=启用）',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='验证问题表';

-- ----------------------------
-- 初始数据
-- ----------------------------
INSERT INTO `verify_questions` (`question`, `answers`, `sort_order`, `is_active`) VALUES
('你问我全世界是哪里最美？答案是——', '你身边', 1, 1),
('玛莎的全名是？', '蔡昇晏', 2, 1),
('五月天中谁不是师大附中的学生？', '冠佑,刘冠佑,刘谚明', 3, 1),
('五月天中谁放弃了律师的家业？', '怪兽,温尚翊', 4, 1);
