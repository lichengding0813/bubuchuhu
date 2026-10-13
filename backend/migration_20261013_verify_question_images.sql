-- 每题独立配置验证图片。MySQL 5.7 可重复执行，不改动题目、答案或验证状态。
SET @default_verify_image = 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/verify.png';
SET @has_question_image = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verify_questions' AND COLUMN_NAME = 'image_url'
);
SET @question_image_sql = IF(
    @has_question_image = 0,
    CONCAT('ALTER TABLE verify_questions ADD COLUMN image_url VARCHAR(500) NOT NULL DEFAULT ', QUOTE(@default_verify_image), ' COMMENT ''验证题云存储图片'' AFTER answers'),
    'SELECT ''verify_questions.image_url already exists'' AS result'
);
PREPARE question_image_statement FROM @question_image_sql;
EXECUTE question_image_statement;
DEALLOCATE PREPARE question_image_statement;

-- 仅初始化未配置的题目；后续重跑不覆盖界面上传的自定义图片。
UPDATE verify_questions SET image_url = @default_verify_image WHERE image_url IS NULL OR image_url = '';

SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verify_questions' AND COLUMN_NAME = 'image_url';
