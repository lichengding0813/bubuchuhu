/**
 * 统一 API 调用模块
 * 
 * 封装 wx.cloud.callContainer，统一处理：
 * - 环境配置
 * - openId 自动注入
 * - 错误处理
 * - 响应格式校验
 */

const { CLOUD_ENV_ID, CONTAINER_SERVICE } = require('./config');

/**
 * 获取当前用户的 openId
 */
function getOpenId() {
  const userInfo = wx.getStorageSync('userInfo');
  return userInfo?.openId || '';
}

/**
 * 调用后端 API
 * 
 * @param {string} path - API 路径 (如 "/login" 或 "/api/activity/list")
 * @param {string} method - HTTP 方法 (GET/POST/PUT/DELETE)
 * @param {Object} data - 请求参数
 * @param {Object} options - 额外选项
 * @param {boolean} options.showLoading - 是否显示 loading (默认 false)
 * @param {string} options.loadingTitle - loading 文字 (默认 "加载中...")
 * @param {boolean} options.silent - 是否关闭统一错误提示
 * @returns {Promise<Object>} 完整业务响应（含 code、msg、data）
 */
function callApi(path, method = 'GET', data = {}, options = {}) {
  const { showLoading = false, loadingTitle = '加载中...', silent = false } = options;

  if (showLoading) {
    wx.showLoading({ title: loadingTitle, mask: true });
  }

  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: { env: CLOUD_ENV_ID },
      path: path,
      header: {
        'X-WX-SERVICE': CONTAINER_SERVICE,
        'X-Wx-OpenId': getOpenId(),
        'content-type': 'application/json'
      },
      method: method,
      data: data,
      success: (result) => {
        if (showLoading) wx.hideLoading();

        // 检查 HTTP 状态
        if (result.statusCode !== 200) {
          if (!silent) wx.showToast({ title: '服务器异常', icon: 'none' });
          const error = new Error(`HTTP ${result.statusCode}`);
          error.statusCode = result.statusCode;
          reject(error);
          return;
        }

        const res = result.data;
        if (!res || res.code === undefined) {
          if (!silent) wx.showToast({ title: '响应格式异常', icon: 'none' });
          reject(new Error('Invalid response'));
          return;
        }

        if (res.code === 200) {
          resolve(res);
        } else if (res.code === 401 && res.needVerify) {
          // 需要验证 → 触发全局验证事件
          const app = getApp();
          if (app && app.onNeedVerify) {
            app.onNeedVerify(res);
          }
          const error = new Error('NEED_VERIFY');
          error.response = res;
          reject(error);
        } else if (res.code === 403 && /账户已被锁定/.test(res.msg || '')) {
          // 仅账户锁定触发全局遮罩；普通权限不足仍交给页面处理。
          const app = getApp();
          if (app && app.onAccountLocked) {
            app.onAccountLocked();
          }
          const error = new Error('ACCOUNT_LOCKED');
          error.response = res;
          reject(error);
        } else {
          if (!silent) wx.showToast({ title: res.msg || '操作失败', icon: 'none' });
          const error = new Error(res.msg || 'API error');
          error.response = res;
          reject(error);
        }
      },
      fail: (error) => {
        if (showLoading) wx.hideLoading();
        console.error('API 调用失败:', path, error);
        if (!silent) wx.showToast({ title: '网络错误', icon: 'error' });
        reject(error);
      }
    });
  });
}

/**
 * GET 请求
 */
function get(path, data = {}, options = {}) {
  return callApi(path, 'GET', data, options);
}

/**
 * POST 请求
 */
function post(path, data = {}, options = {}) {
  return callApi(path, 'POST', data, options);
}

/**
 * PUT 请求
 */
function put(path, data = {}, options = {}) {
  return callApi(path, 'PUT', data, options);
}

/**
 * DELETE 请求
 */
function del(path, data = {}, options = {}) {
  return callApi(path, 'DELETE', data, options);
}

module.exports = {
  callApi,
  get,
  post,
  put,
  del,
  getOpenId,
  ENV_ID: CLOUD_ENV_ID,
  SERVICE_NAME: CONTAINER_SERVICE
};
