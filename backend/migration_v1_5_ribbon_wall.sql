-- v1.5：可配置飘带墙（MySQL 5.7 / CynosDB）
-- 可重复执行；首次执行会创建 5 张表并初始化 2 面墙、8 条飘带与 6 个挂件。
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `ribbons` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` varchar(500) NOT NULL DEFAULT '',
  `image_url` varchar(500) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` varchar(100) NOT NULL DEFAULT '',
  `updated_by` varchar(100) NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ribbon_active_order` (`is_active`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='飘带素材库';

CREATE TABLE IF NOT EXISTS `ribbon_walls` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(60) NOT NULL,
  `subtitle` varchar(120) NOT NULL DEFAULT '',
  `sort_order` int(11) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` varchar(100) NOT NULL DEFAULT '',
  `updated_by` varchar(100) NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ribbon_wall_active_order` (`is_active`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='飘带墙';

CREATE TABLE IF NOT EXISTS `ribbon_wall_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `wall_id` int(11) NOT NULL,
  `ribbon_id` int(11) NOT NULL,
  `slot_index` tinyint(4) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wall_slot` (`wall_id`,`slot_index`),
  UNIQUE KEY `uk_wall_ribbon` (`ribbon_id`),
  CONSTRAINT `fk_wall_item_wall` FOREIGN KEY (`wall_id`) REFERENCES `ribbon_walls` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wall_item_ribbon` FOREIGN KEY (`ribbon_id`) REFERENCES `ribbons` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='墙面飘带槽位';

CREATE TABLE IF NOT EXISTS `ribbon_wall_charms` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `wall_id` int(11) NOT NULL,
  `slot_index` tinyint(4) NOT NULL,
  `image_url` varchar(500) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wall_charm_slot` (`wall_id`,`slot_index`),
  CONSTRAINT `fk_wall_charm_wall` FOREIGN KEY (`wall_id`) REFERENCES `ribbon_walls` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='墙面装饰挂件';

CREATE TABLE IF NOT EXISTS `user_ribbons` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_openid` varchar(100) NOT NULL,
  `ribbon_id` int(11) NOT NULL,
  `owned_status` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_ribbon` (`user_openid`,`ribbon_id`),
  KEY `idx_user_ribbon_state` (`user_openid`,`owned_status`,`updated_at`),
  CONSTRAINT `fk_user_ribbon_ribbon` FOREIGN KEY (`ribbon_id`) REFERENCES `ribbons` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户飘带收藏状态';

INSERT IGNORE INTO `ribbons`
  (`id`, `name`, `description`, `image_url`, `sort_order`, `is_active`)
VALUES
  (1, '步步出沪｜走过当时心愿', '生如浮萍般卑微\n爱却苍穹般壮烈', '/images/ribbons/ribbon-01.webp', 1, 1),
  (2, '步步出沪｜上海WMLS集合', '总要有一首我的歌\n大声唱过\n再看天地辽阔', '/images/ribbons/ribbon-02.webp', 2, 1),
  (3, '圣诞限定｜爱的奇迹', '原来世上真的有圣诞老人\n会把爱的奇迹给勇敢的人', '/images/ribbons/ribbon-03.webp', 3, 1),
  (4, 'OAOA｜去疯去爱去浪费', 'OAOA～\nOAOA～', '/images/ribbons/ribbon-04.webp', 4, 1),
  (5, 'OAOA｜别想别怕别后退', '我相信摇滚\n就能万岁🎸', '/images/ribbons/ribbon-05.webp', 5, 1),
  (6, '夏日溯溪｜知足的快乐', '怎么去拥有一道彩虹🌈\n怎么去拥抱一夏天的风🍉', '/images/ribbons/ribbon-06.webp', 6, 1),
  (7, '泼水大赛｜拥抱一夏天的风', '彩蛋🥚\n步步出沪第一届泼鸡大赛\n圆满落幕🐤', '/images/ribbons/ribbon-07.webp', 7, 1),
  (8, '顽固｜走不到脚抽筋', '我身在\n当时你\n幻想的\n未来里', '/images/ribbons/ribbon-08.webp', 8, 1);

INSERT IGNORE INTO `ribbon_walls`
  (`id`, `title`, `subtitle`, `sort_order`, `is_active`)
VALUES
  (1, '步步出沪 · 飘带墙 01', '记得找我，我的好朋友', 1, 1),
  (2, '步步出沪 · 飘带墙 02', '为你写下这首情歌，陪着你走', 2, 1);

INSERT IGNORE INTO `ribbon_wall_items` (`wall_id`, `ribbon_id`, `slot_index`)
VALUES
  (1, 1, 1), (1, 2, 2), (1, 3, 3), (1, 4, 4),
  (2, 5, 1), (2, 6, 2), (2, 7, 3), (2, 8, 4);

INSERT IGNORE INTO `ribbon_wall_charms` (`wall_id`, `slot_index`, `image_url`)
VALUES
  (1, 1, '/images/ribbon-charms/ball-pink.png'),
  (1, 2, '/images/ribbon-charms/carrot-friend.png'),
  (1, 3, '/images/ribbon-charms/ball-red.png'),
  (2, 1, '/images/ribbon-charms/ball-blue.png'),
  (2, 2, '/images/ribbon-charms/ball-green.png'),
  (2, 3, '/images/ribbon-charms/ball-yellow.png');

SELECT `TABLE_NAME`
FROM `INFORMATION_SCHEMA`.`TABLES`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` IN (
    'ribbons', 'ribbon_walls', 'ribbon_wall_items',
    'ribbon_wall_charms', 'user_ribbons'
  )
ORDER BY `TABLE_NAME`;
