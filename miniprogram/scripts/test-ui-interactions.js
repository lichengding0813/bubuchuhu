const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const event = dataset => ({ currentTarget: { dataset } });
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }

function load(relative, options = {}) {
  const filename = path.join(root, relative + '.js');
  let definition;
  const calls = [];
  const wx = {
    getStorageSync: () => options.user === null ? null : (options.user || { openId: 'test-only', isAdmin: 1, verified: 1 }),
    showToast() {}, showLoading() {}, hideLoading() {}, setStorageSync() {},
    showModal(value) { calls.push(['modal', value]); },
    navigateTo(value) { calls.push(['navigate', value]); },
    navigateBack() {}, switchTab() {}, stopPullDownRefresh() { calls.push(['stopRefresh']); },
    cloud: { callContainer: options.container || (() => Promise.reject(new Error('simulated failure'))) }
  };
  const api = options.api || {};
  const client = Object.fromEntries(['get', 'post', 'put'].map(method => [method, async (...args) => {
    calls.push([method, ...args]);
    if (!api[method]) throw new Error('simulated failure');
    return api[method](...args);
  }]));
  const nativeRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { definition = value; }, Component(value) { definition = value; },
    require(name) { return name.endsWith('/api') ? client : nativeRequire(name); },
    wx, getApp: () => ({ globalData: {} }), console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, Date
  }, { filename });
  const instance = { ...definition, ...(definition.methods || {}), data: clone(definition.data || {}), calls, wx, definition,
    setData(patch, callback) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
        let target = this.data;
        for (const part of parts.slice(0, -1)) { target[part] ??= {}; target = target[part]; }
        target[parts.at(-1)] = value;
      }
      if (callback) callback();
    },
    triggerEvent(name, detail) { calls.push(['event', name, detail]); }
  };
  return instance;
}

function verifyMarkup(relative, instance) {
  const markup = fs.readFileSync(path.join(root, relative + '.wxml'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  for (const match of markup.matchAll(/\b(?:bind|catch)(?::)?[\w-]+\s*=\s*"([\w]+)"/g)) {
    check(typeof instance[match[1]] === 'function', `${relative}: 缺少事件处理器 ${match[1]}`);
  }
  const stack = [];
  const voidTags = new Set(['input', 'image', 'import', 'include', 'wxs']);
  for (const match of markup.matchAll(/<\/?[\w-]+(?:[^"'<>]|"[^"]*"|'[^']*')*\/?>/g)) {
    const tag = match[0].match(/^<\/?([\w-]+)/)[1];
    if (voidTags.has(tag) || match[0].endsWith('/>')) continue;
    if (match[0].startsWith('</')) assert.equal(stack.pop(), tag, `${relative}: 标签未正确闭合 ${match[0]}`);
    else stack.push(tag);
  }
  check(stack.length === 0, `${relative}: 存在未闭合标签 ${stack.join(',')}`);
}

async function main() {
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).pages;
  for (const page of pages) verifyMarkup(page, load(page));
  for (const name of ['ui-state', 'official-activity-picker', 'verify-dialog']) {
    verifyMarkup(`components/${name}/${name}`, load(`components/${name}/${name}`));
  }

  const joined = load('pages/my-joined-activities/my-joined-activities', {
    api: { get: async url => { assert.equal(url, '/user/stats'); return { data: { total_activities: '8', total_distance: '45.5', total_climb: '1200' } }; } },
    container: async () => ({ data: { code: 200, data: {
      ongoing: [{ id: 1, activity_id: 10, status: '1' }, { id: 2, status: '0' }],
      ended: [{ id: 3, activity_id: 20, status: 1 }, { id: 4, status: 0 }]
    } } })
  });
  await joined.onPullDownRefresh();
  assert.deepEqual(clone(joined.data.hikeStats), { total_activities: 8, total_distance: 45.5, total_climb: 1200 });
  check(joined.data.ongoingCount === 1 && joined.data.endedCount === 1, '已取消报名不得计入列表');
  check(joined.calls.some(item => item[0] === 'stopRefresh'), '下拉刷新必须结束');
  joined.switchTab(event({ tab: 'ended' }));
  check(joined.data.currentList[0].activity_id === 20, '报名筛选应显示对应列表');
  check(!joined.onLoad, '报名页面不能在 onLoad 与 onShow 重复请求');
  const pendingStats = deferred();
  const concurrent = load('pages/my-joined-activities/my-joined-activities', { api: { get: () => pendingStats.promise } });
  const firstStats = concurrent.loadHikeStats();
  const secondStats = concurrent.loadHikeStats();
  check(concurrent.calls.filter(item => item[0] === 'get').length === 1, '统计刷新不能并发重复请求');
  pendingStats.reject(new Error('simulated failure'));
  await Promise.all([firstStats, secondStats]);
  check(!concurrent.data.statsLoading && concurrent.data.statsError, '统计失败需要可重试状态');
  const unauthenticated = load('pages/my-joined-activities/my-joined-activities', { user: null });
  await unauthenticated.loadHikeStats();
  check(unauthenticated.calls.length === 0 && unauthenticated.data.statsError, '未登录不请求统计');

  const center = load('pages/achievement-center/achievement-center', { api: { get: async () => ({ data: {} }) } });
  await center.onPullDownRefresh();
  check(!('hikeStats' in center.data) && !center.calls.some(item => item[1] === '/user/stats'), '成就中心不再请求或保存徒步统计');

  for (const [page, method, errorKey, listKey] of [
    ['my-created-activities', 'loadDrafts', 'draftError', 'draftList'],
    ['verify-management', 'loadQuestions', 'loadError', 'questionList'],
    ['official-activities', 'loadActivities', 'loadError', 'activityList'],
    ['official-accounts', 'loadAccounts', 'loadError', 'accountList'],
    ['blacklist', 'loadBlacklist', 'loadError', 'userList'],
    ['my-prizes', 'loadPrizes', 'loadError', 'prizes'],
    ['lottery-admin', 'loadLotteries', 'loadError', 'lotteryList'],
    ['activity-participants', 'fetchParticipants', 'loadError', 'activeParticipants']
  ]) {
    const instance = load(`pages/${page}/${page}`);
    instance.setData({ activityId: 1 });
    await instance[method]();
    check(instance.data[errorKey] && instance.data[listKey].length === 0, `${page}: 失败不能显示空状态或虚构数据`);
    check(!('isSampleData' in instance.data), `${page}: 不得引入示例兜底`);
  }

  const picker = load('components/official-activity-picker/official-activity-picker');
  picker.setData({ options: [{ id: 1, name: '龙王潭', location: '杭州' }, { id: 2, name: '森林', activity_time: '2026-10-04' }], loading: false, error: '' });
  picker.definition.observers['options, keyword'].call(picker, picker.data.options, ' 杭州 ');
  check(picker.data.filteredOptions.length === 1 && picker.data.filteredOptions[0].id === 1, '活动选择支持名称和地点搜索');
  picker.definition.observers['options, keyword'].call(picker, picker.data.options, '2026-10');
  check(picker.data.filteredOptions[0].id === 2, '活动选择支持日期搜索');
  picker.onSelect(event({ id: 2 }));
  check(picker.calls.at(-1)[1] === 'select' && picker.calls.at(-1)[2].id === 2, '活动选择按 ID 通知页面');
  picker.onSelect(event({ id: 999 }));
  check(picker.calls.length === 1, '无效活动 ID 不得触发选择');
  picker.onClose();
  check(picker.calls.at(-1)[1] === 'close', '弹层取消只通知关闭');

  let saved;
  const admin = load('pages/achievement-admin/achievement-admin', { api: {
    get: async () => ({ data: { badges: [], activities: [{ id: 1, name: '活动一' }, { id: 2, name: '活动二' }] } }),
    post: async (url, payload) => { saved = clone(payload); return { code: 200 }; }
  } });
  await admin.loadConfig();
  admin.openNewBadge();
  admin.onActivityChange({ detail: { id: 1 } });
  admin.onActivityChange({ detail: { id: 1 } });
  check(admin.data.form.activity_ids.length === 1 && admin.data.activityOptions.length === 1, '关联活动必须去重并从备选移除');
  admin.onActivityChange({ detail: { id: 2 } });
  admin.removeActivity(event({ id: 1 }));
  check(admin.data.form.activity_ids[0] === 2 && admin.data.activityOptions[0].id === 1, '移除关联后恢复备选');
  admin.closeEditor();
  check(admin.data.form.activity_ids.length === 0 && !saved, '取消编辑不得保存关联');
  admin.openNewBadge();
  admin.setData({ 'form.name': '测试徽章', 'form.image_url': 'cloud://test-only/badge.png' });
  admin.onActivityChange({ detail: { id: 2 } });
  await admin.saveBadge();
  assert.deepEqual(saved.activity_ids, [2]);
  check(!admin.data.editorOpen && !admin.data.saving, '保存后关闭编辑器并解除提交状态');
  admin.setData({ saving: true, editorOpen: true });
  admin.closeEditor();
  check(admin.data.editorOpen, '提交中不得关闭编辑器');
  const nonAdmin = load('pages/achievement-admin/achievement-admin', { user: { openId: 'test-only', isAdmin: 0, isOfficial: 1 } });
  nonAdmin.onLoad(); nonAdmin.onShow();
  check(nonAdmin.calls[0][0] === 'modal' && !nonAdmin.calls.some(item => item[0] === 'get'), '成就管理仍只向超管开放');

  const lottery = load('pages/lottery-admin/lottery-admin', { api: { get: async () => ({ data: [{ id: '10', is_official: 1, name: '活动' }] }) } });
  await lottery.showCreateForm();
  await new Promise(resolve => setImmediate(resolve));
  check(lottery.data.activityIndex === -1, '创建抽奖不能默认选择第一场活动');
  lottery.onActivityChange({ detail: { id: 10 } });
  check(lottery.data.activityIndex === 0 && !lottery.data.showActivityPicker, '抽奖使用共享 ID 选择协议');
  lottery.setData({ uploadingPrizeIndex: 0 });
  lottery.hideCreateForm(); lottery.onCreateLottery();
  check(lottery.data.showForm && !lottery.calls.some(item => item[0] === 'modal'), '图片上传中不得关闭或发布抽奖');

  const review = load('pages/review_add/review_add');
  review.setData({ officialActivities: [{ id: 7, name: '回顾来源', time: '2026-10-04 09:00', distance: 8, climb: 250, participant_count: 12 }] });
  review.onSelectOfficialActivity({ detail: { id: 7 } });
  check(review.data.sourceActivityId === 7 && review.data.form.name === '回顾来源' && review.data.form.distance === 8, '共享选择器仍自动带入回顾数据');

  const setting = load('pages/settings/settings');
  setting.setData({ saving: true, canSave: true });
  await setting.onSave();
  check(!setting.calls.length, '资料保存中不得重复提交');

  const personalSettings = '/pages/settings/settings';
  const hasSettingsMenu = page => page.data.menuList.some(item => item.url === personalSettings);
  const profileUser = { openId: 'profile-test-only', isLogin: true, isAdmin: 0, verified: 1,
    phoneNumber: '13800000000', wechatId: 'test-only' };
  const newProfile = load('pages/profile/profile', { user: profileUser,
    container: async () => ({ data: { code: 200, data: { ongoing: [], ended: [] } } }) });
  check(hasSettingsMenu(newProfile), '保留原有个人资料菜单配置');
  newProfile.setData({ userInfo: profileUser });
  newProfile.buildMenuList();
  newProfile.onLoginClick();
  check(hasSettingsMenu(newProfile) && newProfile.calls.at(-1)[1].url === personalSettings,
    '登录后无须报名即可从菜单或头像维护个人资料');
  await newProfile.fetchJoinedCount(profileUser.openId);
  check(hasSettingsMenu(newProfile) && newProfile.data.stats.joined === 0,
    '零报名用户查询后仍保留资料入口');
  await newProfile.onMenuClick(event({ index: newProfile.data.menuList.findIndex(item => item.url === personalSettings) }));
  check(newProfile.calls.at(-1)[1].url === personalSettings, '零报名用户可从菜单进入资料设置');

  for (const [ongoing, ended, activeCount] of [
    [[{ status: 1 }], [], 1],
    [[], [{ status: 1 }], 1],
    [[{ status: 0, cancel_source: 'self' }], [], 0],
    [[], [{ status: '0', cancel_source: 'manager' }], 0]
  ]) {
    const history = load('pages/profile/profile', { user: profileUser,
      container: async () => ({ data: { code: 200, data: { ongoing, ended } } }) });
    history.setData({ userInfo: profileUser });
    history.buildMenuList();
    await history.fetchJoinedCount(profileUser.openId);
    check(hasSettingsMenu(history), '有效和已取消报名的用户均可维护资料');
    check(history.data.stats.joined === activeCount, '资料入口回滚保留有效报名数量口径');
    history.onLoginClick();
    check(history.calls.at(-1)[1].url === personalSettings, '报名过的用户仍可从头像进入资料设置');
    await history.onMenuClick(event({ index: history.data.menuList.findIndex(item => item.url === personalSettings) }));
    check(history.calls.at(-1)[1].url === personalSettings, '报名过的用户仍可从菜单进入资料设置');
  }

  for (const container of [
    async () => ({ data: { code: 500 } }),
    async () => { throw new Error('simulated failure'); }
  ]) {
    const unavailable = load('pages/profile/profile', { user: profileUser, container });
    unavailable.setData({ userInfo: profileUser });
    unavailable.buildMenuList();
    await unavailable.fetchJoinedCount(profileUser.openId);
    check(unavailable.data.stats.joined === 0 && hasSettingsMenu(unavailable),
      '报名查询失败不影响个人资料入口');
  }

  const oldHistory = deferred(), latestHistory = deferred();
  let historyRequest = 0;
  const changingProfile = load('pages/profile/profile', { user: profileUser,
    container: () => (++historyRequest === 1 ? oldHistory.promise : latestHistory.promise) });
  changingProfile.setData({ userInfo: profileUser });
  const oldFetch = changingProfile.fetchJoinedCount(profileUser.openId);
  const latestFetch = changingProfile.fetchJoinedCount(profileUser.openId);
  latestHistory.resolve({ data: { code: 200, data: { ongoing: [], ended: [] } } });
  await latestFetch;
  oldHistory.resolve({ data: { code: 200, data: { ongoing: [{ status: 1 }], ended: [] } } });
  await oldFetch;
  check(changingProfile.data.stats.joined === 0,
    '过期报名响应不能覆盖最新统计');
  const previousAccount = deferred();
  const switched = load('pages/profile/profile', { user: profileUser, container: () => previousAccount.promise });
  switched.setData({ userInfo: profileUser });
  const switchedFetch = switched.fetchJoinedCount(profileUser.openId);
  switched.setData({ userInfo: { ...profileUser, openId: 'another-test-only' }, 'stats.joined': 0 });
  previousAccount.resolve({ data: { code: 200, data: { ongoing: [{ status: 1 }], ended: [] } } });
  await switchedFetch;
  check(switched.data.stats.joined === 0, '切换账号后不能继承上一账号的报名统计');
  const signedOut = load('pages/profile/profile', { user: null });
  signedOut.initUserData();
  await signedOut.loadUserStats();
  check(!signedOut.data.userInfo.isLogin && !hasSettingsMenu(signedOut), '未登录时仍仅显示原有公开菜单');
  let loginRequested = false;
  signedOut.handleLogin = () => { loginRequested = true; };
  signedOut.onLoginClick();
  check(loginRequested && !signedOut.calls.some(item => item[0] === 'navigate'), '未登录点击头像仍先登录');

  const firstSignup = load('pages/details/details', { user: { openId: 'first-signup-test-only' } });
  firstSignup.onSignUpClick();
  const signupModal = firstSignup.calls.find(item => item[0] === 'modal');
  check(signupModal?.[1].title === '资料不完整', '第一次报名仍提示填写联系方式');
  signupModal[1].success({ confirm: true });
  check(firstSignup.calls.at(-1)[1].url === personalSettings, '第一次报名仍可进入原资料填写流程');
  const privacyMarkup = fs.readFileSync(path.join(root, 'pages/settings/settings.wxml'), 'utf8');
  check(privacyMarkup.includes('联系方式仅用于活动报名联系，不作其他用途'), '资料表单说明联系方式用途');
  check(privacyMarkup.includes('删除') && privacyMarkup.includes('注销账号') && privacyMarkup.includes('联系管理员') && privacyMarkup.includes('Galaxy79215'),
    '资料表单提供联系删除信息和注销账号的渠道');
  const question = load('pages/verify-management/verify-management');
  question.setData({ editQuestion: '测试问题', editAnswerList: ['测试答案'], showEditPopup: true });
  await question.onSaveQuestion();
  check(!question.data.saving && question.data.showEditPopup === true, '保存异常必须解除 busy 状态');

  question.setData({ questionList: [{ id: 1, is_active: 1, question: '测试问题', answers_text: '测试答案' }] });
  await question.onToggleActive({ ...event({ id: 1 }), detail: { value: false } });
  check(question.data.questionList[0].is_active === 1 && question.data.togglingId === null, '开关请求失败必须回滚原值');

  const joinedFailure = load('pages/my-joined-activities/my-joined-activities', { api: { get: async () => ({ data: { total_activities: 2 } }) } });
  await joinedFailure.onPullDownRefresh();
  check(joinedFailure.data.loadError && joinedFailure.data.statsReady, '报名列表失败不得阻止统计正常展示');
  const draftResponseFailure = load('pages/my-created-activities/my-created-activities', { container: async () => ({ data: { code: 500 } }) });
  await draftResponseFailure.loadDrafts();
  check(draftResponseFailure.data.draftError && draftResponseFailure.data.draftList.length === 0, '接口业务错误同样不得展示示例草稿');

  const state = load('components/ui-state/ui-state');
  state.onRetry();
  check(state.calls[0][1] === 'retry', '统一失败状态发出重试事件');

  // 失败的分页不推进页码；快速切换时旧响应不能覆盖新筛选。
  let failNext = false;
  const home = load('pages/home/home', { api: { get: async (url, params) => {
    if (params.size === 1) return { code: 200, data: { list: [], total: 0 } };
    if (failNext) throw new Error('simulated failure');
    return { code: 200, data: { list: [{ id: params.page, name: '测试活动', status: 1, max_participants: 10 }], total: 3 } };
  } } });
  await home.getActivityList(true);
  failNext = true;
  await home.getActivityList(false);
  check(home.data.page === 1 && home.data.loadError, '首页第二页失败不得跳到第三页');
  failNext = false;
  await home.getActivityList(false);
  check(home.data.page === 2 && home.data.activityList.length === 2 && !home.data.loadError, '重试应追加原先失败的页');
  const oldResponse = deferred(), newResponse = deferred();
  let requestCount = 0;
  const homeRace = load('pages/home/home', { api: { get: (url, params) => params.size === 1 ? Promise.resolve({ code: 200, data: { total: 0 } }) : (++requestCount === 1 ? oldResponse.promise : newResponse.promise) } });
  const oldRequest = homeRace.getActivityList(true);
  homeRace.setData({ currentTab: 'ended' });
  const newRequest = homeRace.getActivityList(true);
  newResponse.resolve({ code: 200, data: { list: [{ id: 2, name: '新筛选', status: 4 }], total: 1 } });
  await newRequest;
  oldResponse.resolve({ code: 200, data: { list: [{ id: 1, name: '旧筛选', status: 1 }], total: 1 } });
  await oldRequest;
  check(homeRace.data.activityList[0].id === 2, '旧筛选响应不能覆盖新筛选');

  const calendar = load('pages/calendar/calendar');
  calendar.setData({ year: 2026, month: 10 });
  await calendar.loadCalendar();
  check(calendar.data.calendarError && !calendar.data.calendarLoading && calendar.data.days.length > 0, '日历失败仍显示日期并允许重试');
  await calendar.onDateTap(event({ date: '2026-10-04' }));
  check(calendar.data.dayError && !calendar.data.dayLoading, '当日活动失败不能提示当天无活动');
  const searchResponse = deferred();
  const search = load('pages/official-accounts/official-accounts', { api: { get: () => searchResponse.promise } });
  search.setData({ keyword: '测试' });
  const searchRequest = search.onSearch();
  search.onClearSearch();
  searchResponse.resolve({ code: 200, data: { list: [{ openId: 'test-only', nickName: '旧搜索' }] } });
  await searchRequest;
  check(search.data.candidateList.length === 0 && !search.data.hasSearched, '清空搜索后旧结果不得重新出现');
  // 整场活动取消：确认前不写入，重复点击只弹一次，失败可重试。
  for (const relative of ['pages/official-activities/official-activities', 'pages/my-created-activities/my-created-activities']) {
    let cancelStatus = 1;
    let cancelFails = false;
    const cancelPage = load(relative, {
      api: {
        get: async () => ({ code: 200, data: { list: [{ id: 12, status: cancelStatus }] } }),
        post: async (url, data) => {
          assert.equal(url, '/api/activity/cancel');
          assert.equal(data.activity_id, 12);
          if (cancelFails) throw { response: { msg: '取消失败' } };
          cancelStatus = 5;
          return { code: 200, data: { status: 5 } };
        }
      },
      container: async () => ({ data: { code: 200, data: [{ id: 12, status: cancelStatus }] } })
    });
    cancelPage.setData({ activityList: [{ id: 12, status: 1 }] });
    cancelPage.onCancelActivity(event({ id: 12 }));
    cancelPage.onCancelActivity(event({ id: 12 }));
    check(cancelPage.calls.filter(call => call[0] === 'modal').length === 1, `${relative}: 重复点击不得重复确认`);
    check(!cancelPage.calls.some(call => call[0] === 'post'), `${relative}: 确认前不得取消活动`);
    await cancelPage.calls.find(call => call[0] === 'modal')[1].success({ confirm: false });
    check(cancelPage.data.cancellingActivityId === null && cancelStatus === 1, `${relative}: 放弃取消应保留活动`);
    cancelFails = true;
    cancelPage.onCancelActivity(event({ id: 12 }));
    await cancelPage.calls.filter(call => call[0] === 'modal').at(-1)[1].success({ confirm: true });
    check(cancelPage.data.cancellingActivityId === null && cancelStatus === 1, `${relative}: 请求失败可重新操作`);
    cancelFails = false;
    cancelPage.onCancelActivity(event({ id: 12 }));
    await cancelPage.calls.filter(call => call[0] === 'modal').at(-1)[1].success({ confirm: true });
    check(cancelPage.data.activityList[0].status === 5 && cancelPage.data.cancellingActivityId === null, `${relative}: 成功后刷新为已取消`);
    const modalCount = cancelPage.calls.filter(call => call[0] === 'modal').length;
    for (const status of [-1, 0, 2, 4, 5]) {
      cancelPage.setData({ activityList: [{ id: 12, status }] });
      cancelPage.onCancelActivity(event({ id: 12 }));
    }
    check(cancelPage.calls.filter(call => call[0] === 'modal').length === modalCount, `${relative}: 其他状态没有取消入口`);
    cancelPage.setData({ activityList: [{ id: 12, status: 3 }] });
    cancelPage.onCancelActivity(event({ id: 12 }));
    check(cancelPage.calls.filter(call => call[0] === 'modal').length === modalCount + 1, `${relative}: 进行中的活动可取消`);
    await cancelPage.calls.filter(call => call[0] === 'modal').at(-1)[1].success({ confirm: false });
    cancelPage.data.activityList[0].status = 5;
    const navigationCount = cancelPage.calls.filter(call => call[0] === 'navigate').length;
    (cancelPage.onEdit || cancelPage.onEditActivity).call(cancelPage, event({ id: 12 }));
    check(cancelPage.calls.filter(call => call[0] === 'navigate').length === navigationCount, `${relative}: 已取消活动不能编辑重发`);
  }
  const cancelledDetail = load('pages/details/details');
  for (const has_registered of [false, true]) {
    cancelledDetail.formatActivityDetail({ id: 12, status: '5', activity_time: '2026-01-01 08:00', end_time: '2026-01-01 20:00', max_participants: 20, has_registered });
    check(cancelledDetail.data.activityDetail.status === '已取消', '已取消优先于按时间计算的已结束状态');
    check(cancelledDetail.data.activityDetail.registrationClosed && !cancelledDetail.data.canSignUp, '取消的活动关闭报名');
    const modalCount = cancelledDetail.calls.filter(call => call[0] === 'modal').length;
    cancelledDetail.onSignUpClick();
    cancelledDetail.onCancelSignUpClick();
    check(cancelledDetail.calls.filter(call => call[0] === 'modal').length === modalCount, '取消的活动不索取资料、不显示报名或退报名确认');
  }
  const drawVerification = deferred();
  const verification = load('components/verify-dialog/verify-dialog', {
    user: { openId: 'verify-test' }, api: { post: async (url, payload) => {
      assert.equal(url, '/verify');
      assert.deepEqual(clone(payload), { answer: '填写的答案', question_idx: 8, question_text: '当前题目' });
      return drawVerification.promise;
    } }
  });
  verification.setData({ show: true, userOpenid: 'verify-test', currentQuestion: '当前题目', currentQuestionIdx: 8, currentImage: 'cloud://prod/question-8.png', answer: ' 填写的答案 ' });
  verification.onConfirm();
  check(verification.data.confirming && verification.data.snapshot.image === 'cloud://prod/question-8.png', '二次确认再次展示当前题目图片');
  check(verification.data.snapshot.question === '当前题目' && verification.data.snapshot.answer === '填写的答案', '二次确认展示题目与本次答案');
  check(!verification.calls.some(call => call[0] === 'post'), '进入二次确认不提交、不消耗答题次数');
  verification.onBack();
  check(!verification.data.confirming && verification.data.answer === ' 填写的答案 ', '返回修改保留填写答案');
  verification.onConfirm();
  const pendingVerification = verification.onSubmit();
  await verification.onSubmit();
  check(verification.calls.filter(call => call[0] === 'post').length === 1, '重复点击确认提交只请求一次');
  drawVerification.resolve({ code: 200, data: { needVerify: 1, verifyAttempts: 1, isBlacklist: 0 }, verifyQuestion: '新题目', verifyQuestionIdx: 9, verifyQuestionImage: 'cloud://prod/question-9.png' });
  await pendingVerification;
  check(verification.data.currentQuestion === '新题目' && verification.data.currentImage === 'cloud://prod/question-9.png', '答错换题时图片随题目一起更新');
  check(verification.data.error.includes('题目已更新') && !verification.data.answer && !verification.data.confirming, '换题明确提醒并清空旧答案');
  verification.setData({ answer: '另一答案' });
  verification.onConfirm();
  verification.definition.observers['question, questionIdx, questionImage'].call(verification, '再次换题', 10, 'cloud://prod/question-10.png');
  await verification.onSubmit();
  check(!verification.data.confirming && !verification.data.snapshot && verification.calls.filter(call => call[0] === 'post').length === 1, '确认期间题目更新不得提交旧题快照');

  const staleVerification = load('components/verify-dialog/verify-dialog', {
    user: { openId: 'verify-test' }, api: { post: async () => { throw { response: { code: 409, msg: '题目已更新，本次不计答错次数', data: { needVerify: 1, verifyAttempts: 0 }, verifyQuestion: '服务器新题', verifyQuestionIdx: 11, verifyQuestionImage: '' } }; } }
  });
  staleVerification.setData({ currentQuestion: '旧题', currentQuestionIdx: 10, answer: '答案' });
  staleVerification.onConfirm();
  await staleVerification.onSubmit();
  check(staleVerification.data.currentQuestion === '服务器新题' && staleVerification.data.error.includes('不计答错次数'), '服务端题目更新使用新题并提示不扣次数');
  staleVerification.setData({ answer: '答案' });
  staleVerification.onConfirm();
  staleVerification.wx.getStorageSync = () => ({ openId: 'changed-account' });
  await staleVerification.onSubmit();
  check(staleVerification.calls.filter(call => call[0] === 'post').length === 1 && !staleVerification.data.confirming, '确认期间切换账号不得提交旧账号答案');

  let savedImage = '';
  const questionImage = load('pages/verify-management/verify-management', {
    api: { post: async (url, data) => { assert.equal(url, '/check-image-url'); assert.equal(data.url, 'https://allowed-cloud.example/question.png'); return { code: 200 }; } },
    container: async options => {
      if (options.method === 'POST') savedImage = options.data.image_url;
      return { data: { code: 200, data: [] } };
    }
  });
  questionImage.wx.cloud.uploadFile = async () => ({ fileID: 'cloud://prod/uploaded-question.png' });
  questionImage.wx.cloud.getTempFileURL = async () => ({ fileList: [{ tempFileURL: 'https://allowed-cloud.example/question.png' }] });
  questionImage.wx.cloud.deleteFile = async () => {};
  questionImage.onAddQuestion();
  check(questionImage.data.editImage === questionImage.data.defaultImage, '新建问题默认使用现有验证图片');
  questionImage.setData({ uploading: true, editQuestion: '题目', editAnswerList: ['答案'] });
  await questionImage.onSaveQuestion();
  questionImage.onEditPopupClose();
  check(!savedImage && questionImage.data.showEditPopup, '上传期间不能保存或关闭当前题目编辑');
  questionImage.setData({ uploading: false });
  await questionImage.uploadImage('question.png');
  check(questionImage.data.editImage === 'cloud://prod/uploaded-question.png' && !questionImage.data.uploading, '图片上传且通过安全检测后才替换预览');
  await questionImage.onSaveQuestion();
  check(savedImage === 'cloud://prod/uploaded-question.png', '保存题目提交每题独立图片地址');
  questionImage.onResetImage();
  check(questionImage.data.editImage === questionImage.data.defaultImage, '支持从界面恢复默认图片');
  questionImage.wx.cloud.getTempFileURL = async () => ({ fileList: [] });
  await questionImage.uploadImage('bad-image.png');
  check(questionImage.data.editImage === questionImage.data.defaultImage && !questionImage.data.uploading, '上传失败保留原图片并恢复可操作状态');
  console.log(`界面回归检查通过：${pages.length} 个页面、3 个共享组件，${checks} 项断言（无真实网络或生产写入）`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
