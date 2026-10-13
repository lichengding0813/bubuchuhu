"""验证题图片与提交快照规则。"""
DEFAULT_QUESTION_IMAGE = 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/verify.png'


def normalize_question_image(value):
    if not isinstance(value, str):
        raise ValueError('验证图片地址无效')
    value = value.strip()
    if value and (not value.startswith('cloud://') or len(value) > 500):
        raise ValueError('请使用上传到云存储的验证图片')
    return value or DEFAULT_QUESTION_IMAGE


def question_metadata(question):
    return {
        'verifyQuestion': question['question'],
        'verifyQuestionIdx': question['id'],
        'verifyQuestionImage': question.get('image_url') or DEFAULT_QUESTION_IMAGE,
    }


def question_submission_changed(data, question):
    # 旧客户端未发送题目快照，继续使用原校验规则。
    if 'question_text' not in data:
        return False
    return not question or data['question_text'] != question['question']
