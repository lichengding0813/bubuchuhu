/**
 * 统一图片处理工具
 * 
 * - 图片安全检测（调用后端 /check-image-url 接口）
 * - 云存储上传辅助
 */

const { callApi } = require('./api.js');

/**
 * 上传图片到云存储并检测安全性
 * 
 * @param {string} filePath - 本地图片路径
 * @param {string} cloudPath - 云存储路径 (如 "activities/cover_xxx.jpg")
 * @returns {Promise<{fileID: string, cloudPath: string}>}
 */
async function uploadAndCheck(filePath, cloudPath) {
  // 1. 上传到云存储
  const uploadRes = await new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: resolve,
      fail: reject
    });
  });

  // 2. 调用后端进行内容安全检测
  try {
    await callApi('/check-image-url', 'POST', { url: uploadRes.fileID });
  } catch (err) {
    // 安全检测失败时删除已上传的图片
    if (err.message !== 'NEED_VERIFY' && err.message !== 'ACCOUNT_LOCKED') {
      wx.cloud.deleteFile({ fileList: [uploadRes.fileID] }).catch(() => {});
    }
    throw err;
  }

  return {
    fileID: uploadRes.fileID,
    cloudPath: cloudPath
  };
}

/**
 * 批量上传图片并检测安全性
 * 
 * @param {Array<{filePath: string, cloudPath: string}>} files - 文件列表
 * @returns {Promise<Array<{fileID: string, cloudPath: string}>>}
 */
async function uploadAndCheckBatch(files) {
  const results = [];
  for (const file of files) {
    const result = await uploadAndCheck(file.filePath, file.cloudPath);
    results.push(result);
  }
  return results;
}

/**
 * 检查图片 URL 的安全性（图片已在云存储中）
 * 
 * @param {string} fileUrl - 云存储 fileID 或 URL
 * @returns {Promise<boolean>}
 */
async function checkImageUrl(fileUrl) {
  try {
    await callApi('/check-image-url', 'POST', { url: fileUrl });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * 选择图片（带安全检测）
 * 
 * @param {Object} options - 选择参数 (count, sizeType, sourceType)
 * @returns {Promise<Array<{fileID: string, tempFilePath: string}>>}
 */
async function chooseAndUploadImage(options = {}) {
  const count = options.count || 1;
  const sizeType = options.sizeType || ['compressed'];
  const sourceType = options.sourceType || ['album', 'camera'];

  const chooseRes = await new Promise((resolve, reject) => {
    wx.chooseImage({
      count,
      sizeType,
      sourceType,
      success: resolve,
      fail: reject
    });
  });

  const results = [];
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 6);

  for (let i = 0; i < chooseRes.tempFilePaths.length; i++) {
    const cloudPath = `activities/img_${timestamp}_${random}_${i}.jpg`;
    const result = await uploadAndCheck(chooseRes.tempFilePaths[i], cloudPath);
    results.push({
      ...result,
      tempFilePath: chooseRes.tempFilePaths[i]
    });
  }

  return results;
}

module.exports = {
  uploadAndCheck,
  uploadAndCheckBatch,
  checkImageUrl,
  chooseAndUploadImage
};
