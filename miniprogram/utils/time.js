/**
 * 统一时间处理工具
 * 
 * wx.cloud.callContainer 会把后端返回的 "YYYY-MM-DD HH:MM:SS"（北京时间）
 * 当作 UTC 时间解析为 Date 对象，导致时间差 8 小时。
 * 
 * 正确做法：始终使用 UTC getter 取回原始值（即后端的北京时间）。
 * 所有页面都应使用此模块统一处理时间，避免重复实现和 Bug。
 */

/**
 * 安全解析时间字符串
 * 处理三种情况：
 * 1. Date 对象（云托管返回）→ 用 UTC getter 取原始值
 * 2. 字符串 "YYYY-MM-DD HH:MM:SS" → 直接拆分
 * 3. 其他格式 → Date 解析后取 UTC 组件
 * 
 * @param {Date|string} timeStr - 时间值
 * @returns {{year, month, day, hour, minute, second}|null}
 */
function parseTimeStr(timeStr) {
  if (!timeStr) return null;

  // 1. Date 对象 → UTC getter 取回北京时间
  if (timeStr instanceof Date) {
    return {
      year: timeStr.getUTCFullYear(),
      month: timeStr.getUTCMonth() + 1,
      day: timeStr.getUTCDate(),
      hour: timeStr.getUTCHours(),
      minute: timeStr.getUTCMinutes(),
      second: timeStr.getUTCSeconds()
    };
  }

  // 2. 字符串 "YYYY-MM-DD HH:MM:SS" → 直接拆分
  const str = String(timeStr).replace('T', ' ');
  const parts = str.split(/[- :]/);
  if (parts.length >= 5 && !isNaN(parseInt(parts[0]))) {
    return {
      year: parseInt(parts[0]),
      month: parseInt(parts[1]),
      day: parseInt(parts[2]),
      hour: parseInt(parts[3]),
      minute: parseInt(parts[4]),
      second: parts.length >= 6 ? parseInt(parts[5]) : 0
    };
  }

  // 3. 兜底
  const d = new Date(timeStr);
  if (!isNaN(d.getTime())) {
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds()
    };
  }

  return null;
}

/**
 * 格式化活动时间为短格式
 * 例: 07/15 08:30
 * @param {Date|string} timeStr
 * @returns {string}
 */
function formatActivityTime(timeStr) {
  const t = parseTimeStr(timeStr);
  if (!t) return String(timeStr || '');
  const pad = n => String(n).padStart(2, '0');
  return `${pad(t.month)}/${pad(t.day)} ${pad(t.hour)}:${pad(t.minute)}`;
}

/**
 * 格式化为完整日期时间
 * 例: 2026-07-15 08:30
 * @param {Date|string} timeStr
 * @returns {string}
 */
function formatFullTime(timeStr) {
  const t = parseTimeStr(timeStr);
  if (!t) return String(timeStr || '');
  const pad = n => String(n).padStart(2, '0');
  return `${t.year}-${pad(t.month)}-${pad(t.day)} ${pad(t.hour)}:${pad(t.minute)}`;
}

/**
 * 格式化为日期 (不含时间)
 * 例: 2026年07月15日
 * @param {Date|string} timeStr
 * @returns {string}
 */
function formatDateCN(timeStr) {
  const t = parseTimeStr(timeStr);
  if (!t) return String(timeStr || '');
  const pad = n => String(n).padStart(2, '0');
  return `${t.year}年${pad(t.month)}月${pad(t.day)}日`;
}

/**
 * 格式化为相对时间
 * 例: 今天 08:30 / 明天 08:30 / 07/15 08:30
 * @param {Date|string} timeStr
 * @returns {string}
 */
function formatRelativeTime(timeStr) {
  const t = parseTimeStr(timeStr);
  if (!t) return String(timeStr || '');

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(t.year, t.month - 1, t.day);
  const pad = n => String(n).padStart(2, '0');

  const diffDays = Math.floor((target - today) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `今天 ${pad(t.hour)}:${pad(t.minute)}`;
  } else if (diffDays === 1) {
    return `明天 ${pad(t.hour)}:${pad(t.minute)}`;
  } else {
    return `${pad(t.month)}/${pad(t.day)} ${pad(t.hour)}:${pad(t.minute)}`;
  }
}

/**
 * 活动状态码映射
 */
const STATUS_MAP = {
  0: '待审核',
  1: '报名中',
  2: '审核拒绝',
  3: '进行中',
  4: '已结束',
  5: '已取消'
};

/**
 * 难度等级映射
 */
const DIFFICULTY_MAP = {
  1: '1⭐',
  2: '2⭐',
  3: '3⭐',
  4: '4⭐',
  5: '5⭐'
};

/**
 * 出行方式映射
 */
const TRAVEL_MAP = {
  1: '大巴',
  2: '高铁/火车',
  3: '自驾'
};

function getStatusText(status) {
  return STATUS_MAP[status] || '未知';
}

function getDifficultyText(level) {
  return DIFFICULTY_MAP[level] || (level + '⭐');
}

function getTravelText(type) {
  return TRAVEL_MAP[type] || '未选择';
}

module.exports = {
  parseTimeStr,
  formatActivityTime,
  formatFullTime,
  formatDateCN,
  formatRelativeTime,
  getStatusText,
  getDifficultyText,
  getTravelText,
  STATUS_MAP,
  DIFFICULTY_MAP,
  TRAVEL_MAP
};
