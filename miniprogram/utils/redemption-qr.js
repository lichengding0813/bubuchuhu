const REDEMPTION_QR_PREFIX = 'BBCH-REDEEM:1:';
const REDEMPTION_QR_REFRESH_SECONDS = 120;

function parseRedemptionQrResult(value) {
  const text = String(value || '').trim();
  if (!text.startsWith(REDEMPTION_QR_PREFIX)) return '';
  const token = text.slice(REDEMPTION_QR_PREFIX.length);
  return /^[A-Za-z0-9_-]{24,64}$/.test(token) ? token : '';
}

function drawQrMatrix(canvasId, matrix, size, scope) {
  if (!canvasId || !Array.isArray(matrix) || matrix.length === 0) {
    throw new Error('二维码数据无效');
  }
  const count = matrix.length;
  if (matrix.some(row => !Array.isArray(row) || row.length !== count)) {
    throw new Error('二维码矩阵无效');
  }

  const canvasSize = Number(size) || 200;
  const context = scope
    ? wx.createCanvasContext(canvasId, scope)
    : wx.createCanvasContext(canvasId);
  context.setFillStyle('#ffffff');
  context.fillRect(0, 0, canvasSize, canvasSize);
  context.setFillStyle('#142f43');

  matrix.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!cell) return;
      const left = Math.floor(x * canvasSize / count);
      const top = Math.floor(y * canvasSize / count);
      const right = Math.ceil((x + 1) * canvasSize / count);
      const bottom = Math.ceil((y + 1) * canvasSize / count);
      context.fillRect(left, top, right - left, bottom - top);
    });
  });
  context.draw();
}

module.exports = {
  REDEMPTION_QR_REFRESH_SECONDS,
  parseRedemptionQrResult,
  drawQrMatrix
};
