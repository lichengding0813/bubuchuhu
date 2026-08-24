"""订阅消息授权与管理接口。"""
from flask import Blueprint, g, jsonify, request

from middleware import check_admin, check_verified_and_blacklist
from notification_service import (
    ADMIN_TEMPLATE_IDS,
    USER_TEMPLATE_IDS,
    process_notification_jobs,
    record_subscription_results,
)


notification_bp = Blueprint('notifications', __name__)


@notification_bp.route('/notifications/templates', methods=['GET'])
@check_verified_and_blacklist
def get_notification_templates():
    return jsonify({'code': 200, 'data': {
        'admin': list(ADMIN_TEMPLATE_IDS),
        'user': list(USER_TEMPLATE_IDS),
    }})


@notification_bp.route('/notifications/consent', methods=['POST'])
@check_verified_and_blacklist
def save_notification_consent():
    data = request.get_json(silent=True) or {}
    results = data.get('results') or {}
    if not isinstance(results, dict) or not results:
        return jsonify({'code': 400, 'msg': '缺少订阅授权结果'})
    balances = record_subscription_results(g.openid, results)
    return jsonify({'code': 200, 'msg': '订阅设置已保存', 'data': balances})


@notification_bp.route('/admin/notifications/process', methods=['POST'])
@check_verified_and_blacklist
@check_admin
def process_notifications_now():
    """超级管理员可手动补跑一次，方便部署后验收。"""
    return jsonify({'code': 200, 'data': process_notification_jobs()})
