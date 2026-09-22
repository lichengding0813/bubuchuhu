-- v1.5：可配置飘带墙（MySQL 5.7 / CynosDB）
-- 可重复执行；首次执行会创建 6 张表并初始化 2 面墙、8 条飘带与 6 个挂件。
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

CREATE TABLE IF NOT EXISTS `ribbon_charms` (
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
  KEY `idx_ribbon_charm_active_order` (`is_active`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='飘带墙挂件素材库';

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
  `charm_id` int(11) DEFAULT NULL,
  `slot_index` tinyint(4) NOT NULL,
  `image_url` varchar(500) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wall_charm_slot` (`wall_id`,`slot_index`),
  KEY `idx_wall_charm_asset` (`charm_id`),
  CONSTRAINT `fk_wall_charm_wall` FOREIGN KEY (`wall_id`) REFERENCES `ribbon_walls` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wall_charm_asset` FOREIGN KEY (`charm_id`) REFERENCES `ribbon_charms` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='墙面装饰挂件';

-- 兼容已经创建过旧版 ribbon_wall_charms 的数据库。
SET @has_charm_id = (
  SELECT COUNT(*) FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'ribbon_wall_charms'
    AND `COLUMN_NAME` = 'charm_id'
);
SET @add_charm_id_sql = IF(
  @has_charm_id = 0,
  'ALTER TABLE `ribbon_wall_charms` ADD COLUMN `charm_id` int(11) DEFAULT NULL AFTER `wall_id`',
  'SELECT 1'
);
PREPARE add_charm_id_stmt FROM @add_charm_id_sql;
EXECUTE add_charm_id_stmt;
DEALLOCATE PREPARE add_charm_id_stmt;

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
  (1, '步步出沪｜走过当时心愿', '生如浮萍般卑微\n爱却苍穹般壮烈', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/ribbons/ribbon-01.webp', 1, 1),
  (2, '步步出沪｜上海WMLS集合', '总要有一首我的歌\n大声唱过\n再看天地辽阔', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/ribbons/ribbon-02.webp', 2, 1),
  (3, '圣诞限定｜爱的奇迹', '原来世上真的有圣诞老人\n会把爱的奇迹给勇敢的人', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/ribbons/ribbon-03.webp', 3, 1),
  (4, 'OAOA｜去疯去爱去浪费', 'OAOA～\nOAOA～', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/ribbons/ribbon-04.webp', 4, 1),
  (5, 'OAOA｜别想别怕别后退', '我相信摇滚\n就能万岁🎸', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/ribbons/ribbon-05.webp', 5, 1),
  (6, '夏日溯溪｜知足的快乐', '怎么去拥有一道彩虹🌈\n怎么去拥抱一夏天的风🍉', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/ribbons/ribbon-06.webp', 6, 1),
  (7, '泼水大赛｜拥抱一夏天的风', '彩蛋🥚\n步步出沪第一届泼鸡大赛\n圆满落幕🐤', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/ribbons/ribbon-07.webp', 7, 1),
  (8, '顽固｜走不到脚抽筋', '我身在\n当时你\n幻想的\n未来里', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/ribbons/ribbon-08.webp', 8, 1);

INSERT IGNORE INTO `ribbon_charms`
  (`id`, `name`, `description`, `image_url`, `sort_order`, `is_active`)
VALUES
  (1, '粉色球', '', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/charms/ball-pink.png', 1, 1),
  (2, '萝卜朋友', '', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/charms/carrot-friend.png', 2, 1),
  (3, '红色球', '', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/charms/ball-red.png', 3, 1),
  (4, '蓝色球', '', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/charms/ball-blue.png', 4, 1),
  (5, '绿色球', '', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/charms/ball-green.png', 5, 1),
  (6, '黄色球', '', 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/charms/ball-yellow.png', 6, 1);

INSERT IGNORE INTO `ribbon_walls`
  (`id`, `title`, `subtitle`, `sort_order`, `is_active`)
VALUES
  (1, '步步出沪 · 飘带墙 01', '记得找我，我的好朋友', 1, 1),
  (2, '步步出沪 · 飘带墙 02', '为你写下这首情歌，陪着你走', 2, 1);

UPDATE `ribbon_wall_items`
SET `slot_index` = `slot_index` + 10
WHERE (`wall_id` = 1 AND `ribbon_id` IN (1,2,3,4))
   OR (`wall_id` = 2 AND `ribbon_id` IN (5,6,7,8));

UPDATE `ribbon_wall_items`
SET `slot_index` = CASE `ribbon_id`
  WHEN 1 THEN 1 WHEN 2 THEN 3 WHEN 3 THEN 5 WHEN 4 THEN 7
  WHEN 5 THEN 1 WHEN 6 THEN 3 WHEN 7 THEN 5 WHEN 8 THEN 7
  ELSE `slot_index`
END
WHERE (`wall_id` = 1 AND `ribbon_id` IN (1,2,3,4))
   OR (`wall_id` = 2 AND `ribbon_id` IN (5,6,7,8));

INSERT IGNORE INTO `ribbon_wall_items` (`wall_id`, `ribbon_id`, `slot_index`)
VALUES
  (1, 1, 1), (1, 2, 3), (1, 3, 5), (1, 4, 7),
  (2, 5, 1), (2, 6, 3), (2, 7, 5), (2, 8, 7);

UPDATE `ribbon_wall_charms` wc
JOIN `ribbon_charms` c
  ON SUBSTRING_INDEX(c.`image_url`, '/', -1) = SUBSTRING_INDEX(wc.`image_url`, '/', -1)
SET wc.`charm_id` = c.`id`
WHERE wc.`charm_id` IS NULL;

UPDATE `ribbon_wall_charms`
SET `slot_index` = `slot_index` + 10
WHERE (`wall_id` = 1 AND `charm_id` IN (1,2,3))
   OR (`wall_id` = 2 AND `charm_id` IN (4,5,6));

UPDATE `ribbon_wall_charms`
SET `slot_index` = CASE `charm_id`
  WHEN 1 THEN 2 WHEN 2 THEN 4 WHEN 3 THEN 6
  WHEN 4 THEN 2 WHEN 5 THEN 4 WHEN 6 THEN 6
  ELSE `slot_index`
END
WHERE (`wall_id` = 1 AND `charm_id` IN (1,2,3))
   OR (`wall_id` = 2 AND `charm_id` IN (4,5,6));

INSERT IGNORE INTO `ribbon_wall_charms` (`wall_id`, `charm_id`, `slot_index`, `image_url`)
VALUES
  (1, 1, 2, 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/charms/ball-pink.png'),
  (1, 2, 4, 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/charms/carrot-friend.png'),
  (1, 3, 6, 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/charms/ball-red.png'),
  (2, 4, 2, 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/charms/ball-blue.png'),
  (2, 5, 4, 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/charms/ball-green.png'),
  (2, 6, 6, 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/charms/ball-yellow.png');

-- 兼容已执行过早期脚本的数据库：仅替换旧的小程序内置资源地址。
UPDATE `ribbons`
SET `image_url` = CONCAT(
  'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/ribbons/',
  SUBSTRING_INDEX(`image_url`, '/', -1)
)
WHERE `image_url` LIKE '/images/ribbons/ribbon-%';

UPDATE `ribbon_wall_charms`
SET `image_url` = CONCAT(
  'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/ribbon-wall/charms/',
  SUBSTRING_INDEX(`image_url`, '/', -1)
)
WHERE `image_url` LIKE '/images/ribbon-charms/%';

SELECT `TABLE_NAME`
FROM `INFORMATION_SCHEMA`.`TABLES`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` IN (
    'ribbons', 'ribbon_charms', 'ribbon_walls', 'ribbon_wall_items',
    'ribbon_wall_charms', 'user_ribbons'
  )
ORDER BY `TABLE_NAME`;
