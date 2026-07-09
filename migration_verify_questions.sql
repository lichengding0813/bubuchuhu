-- ============================================================
-- 步步出沪 验证问题管理迁移
-- 执行前请先备份数据库！
-- 使用方法: mysql -h <host> -P <port> -u <user> -p <database> < migration_verify_questions.sql
-- ============================================================

SET NAMES utf8mb4;

-- ============================================================
-- 创建验证问题表
-- ============================================================
CREATE TABLE IF NOT EXISTS `verify_questions` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `question` varchar(500) NOT NULL COMMENT '问题文本',
    `answers` text NOT NULL COMMENT '可接受的答案，逗号分隔',
    `sort_order` int(11) DEFAULT 0 COMMENT '排序权重',
    `is_active` tinyint(1) DEFAULT 1 COMMENT '是否启用（0=禁用，1=启用）',
    `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
    `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='验证问题表';

-- ============================================================
-- 写入现有的 4 道验证问题（初始数据）
-- ============================================================
INSERT INTO `verify_questions` (`question`, `answers`, `sort_order`) VALUES
('你问我全世界是哪里最美？答案是——', '你身边', 1),
('玛莎的全名是？', '蔡升晏', 2),
('五月天中谁不是师大附中的学生？', '冠佑,刘冠佑,刘谚明', 3),
('五月天中谁放弃了律师的家业？', '怪兽,温尚翊', 4);
