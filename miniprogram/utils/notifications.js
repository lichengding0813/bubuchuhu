const { post } = require('./api');

const TEMPLATE_IDS = {
  blacklist: 'W9zXWifqlQNq3Gv0tE3WQZwJfvpV8HZ6R8ibU7wU1Ys',
  lotteryStart: 'VsSKdYZduCzOk5WDINXNy0rkMX-MGcjFhg-KIgK_koY',
  activityReminder: 'VYfqV2moc2_YVzFvcHUsSgKSg7gKiPklfXRoLJAx7EU',
  pendingApproval: 'XSdbgcKEQ30i8_FsciyuHbyfSXDy6VodbW-9cKqoIac'
};

function requestSubscribeMessage(tmplIds) {
  return new Promise((resolve, reject) => {
    if (!wx.requestSubscribeMessage) {
      reject(new Error('当前微信版本不支持订阅消息'));
      return;
    }
    wx.requestSubscribeMessage({ tmplIds, success: resolve, fail: reject });
  });
}

async function subscribe(tmplIds) {
  const raw = await requestSubscribeMessage(tmplIds);
  const results = {};
  tmplIds.forEach(id => {
    if (raw[id] === 'accept' || raw[id] === 'reject' || raw[id] === 'ban') {
      results[id] = raw[id];
    }
  });
  if (Object.keys(results).length) {
    await post('/api/notifications/consent', { results }, { silent: true });
  }
  return {
    accepted: Object.values(results).filter(value => value === 'accept').length,
    total: tmplIds.length,
    results
  };
}

function subscribeUserReminders() {
  return subscribe([TEMPLATE_IDS.activityReminder, TEMPLATE_IDS.lotteryStart]);
}

function subscribeAdminReminders() {
  return subscribe([TEMPLATE_IDS.pendingApproval, TEMPLATE_IDS.blacklist]);
}

module.exports = {
  TEMPLATE_IDS,
  subscribeUserReminders,
  subscribeAdminReminders
};
