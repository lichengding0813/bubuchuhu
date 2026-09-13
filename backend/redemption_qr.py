"""短期奖品核销二维码生成。"""
from datetime import datetime
import re
import secrets


REDEMPTION_QR_TTL_SECONDS = 120
REDEMPTION_QR_PREFIX = 'BBCH-REDEEM:1:'


def new_redemption_qr_token():
    return secrets.token_urlsafe(24)


def is_valid_redemption_qr_token(token):
    return bool(re.fullmatch(r'[A-Za-z0-9_-]{24,64}', str(token or '')))


def is_redemption_qr_expired(expires_at, now=None):
    return not expires_at or expires_at <= (now or datetime.now())


def redemption_qr_matrix(token):
    """生成前端可直接绘制的二维码矩阵，二维码中只包含短期随机令牌。"""
    import qrcode

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=1,
        border=4,
    )
    qr.add_data(f'{REDEMPTION_QR_PREFIX}{token}')
    qr.make(fit=True)
    return [[1 if cell else 0 for cell in row] for row in qr.get_matrix()]
