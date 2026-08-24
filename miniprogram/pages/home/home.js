const { get, post } = require('../../utils/api');

Page({
  data: {
    currentTab: 'ongoing',
    activityList: [],
    ongoingCount: 0,
    endedCount: 0,
    page: 1,
    pageSize: 10,
    hasMore: true,
    showScrollTop: false,
    userInfo: null,
    isLoading: false,
    // 搜索筛选
    filterDifficulty: '',
    filterTravel: '',
    filterOfficial: false,
    // 验证弹窗相关
    showVerifyDialog: false,
    verifyAnswer: '',
    verifyError: '',
    verifyQuestion: '',
    verifyQuestionIdx: 0,
    autoFocus: false,
    showLockedDialog: false,
    isBlacklisted: false,
    showLotteryPopup: false,
    lotteryInfo: {}
  },

  onLoad() {
    this.loginAndGetUser();
  },

  goToCalendar() {
    wx.navigateTo({ url: '/pages/calendar/calendar' });
  },

  onShow() {
    if (this.data.userInfo) {
      if (this.data.userInfo.isBlacklist === 1) {
        this.setData({ isBlacklisted: true, showLockedDialog: true });
      }
      this.getActivityList(true);
      this.checkLottery();
    }
  },

  async checkLottery() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      if (!userInfo?.openId) return;
      const result = await post('/api/lottery/check', {}, { silent: true });
      if (result.code === 200 && result.data.length > 0) {
        this.setData({ lotteryInfo: result.data[0], showLotteryPopup: true });
      }
    } catch (err) {
      console.log('抽奖检查失败（可忽略）:', err);
    }
  },

  // 登录并获取用户信息
  async loginAndGetUser() {
    this.setData({ isLoading: true });

    // 优先检查是否有缓存的用户信息（其他页面已登录过）
    const cachedUserInfo = wx.getStorageSync('userInfo');
    if (cachedUserInfo && cachedUserInfo.openId) {
      // 有缓存：直接恢复用户状态，只刷新活动列表，不重新登录
      getApp().globalData.userInfo = cachedUserInfo;
      this.setData({
        userInfo: cachedUserInfo,
        isLoading: false
      });
      // 异步后台刷新登录态（更新登录次数等），不阻塞页面展示
      this.doBackgroundLogin();
      // 恢复验证/黑名单状态
      this.applyUserState(cachedUserInfo);
      this.getActivityList(true);
      return;
    }

    // 无缓存：必须完整登录
    try {
      await this.doLogin();
    } catch (error) {
      console.error('登录失败：', error);
      // 兜底：再次检查缓存（可能在并发场景下被其他页面写入）
      const fallbackUserInfo = wx.getStorageSync('userInfo');
      if (fallbackUserInfo && fallbackUserInfo.openId) {
        console.log('登录失败，使用缓存用户数据兜底');
        getApp().globalData.userInfo = fallbackUserInfo;
        this.setData({ userInfo: fallbackUserInfo, isLoading: false });
        this.applyUserState(fallbackUserInfo);
        this.getActivityList(true);
        return;
      }
      wx.showToast({ title: '登录失败，请重试', icon: 'error' });
      this.setData({ isLoading: false });
    }
  },

  // 核心登录流程：wx.login + 后端 /login
  async doLogin() {
    const loginRes = await this.wxPromise('login');
    if (!loginRes.code) throw new Error('wx.login 未返回 code');

    const result = await post('/login', { code: loginRes.code }, { silent: true });

    const userData = result.data;
    if (result.verifyQuestion) {
      userData.verifyQuestion = result.verifyQuestion;
      userData.verifyQuestionIdx = result.verifyQuestionIdx;
    }
    getApp().globalData.userInfo = userData;
    wx.setStorageSync('userInfo', userData);

    this.setData({ userInfo: userData, isLoading: false });

    if (result.isNew) {
      wx.showToast({ title: '欢迎新用户', icon: 'none' });
    }
    this.applyUserState(userData);
    this.getActivityList(true);
  },

  // 后台静默刷新登录态（不阻塞页面）
  async doBackgroundLogin() {
    try {
      await this.doLogin();
    } catch (e) {
      console.log('后台刷新登录态失败（可忽略）:', e.message || e);
    }
  },

  // 根据用户状态显示对应UI
  applyUserState(userData) {
    if (userData.isBlacklist === 1) {
      this.setData({ showLockedDialog: true, isBlacklisted: true });
    } else if (userData.needVerify === 1) {
      if (userData.verifyQuestion) {
        this.setData({
          verifyQuestion: userData.verifyQuestion,
          verifyQuestionIdx: userData.verifyQuestionIdx
        });
      }
      this.showCustomVerifyDialog();
    }
  },

  // 获取活动列表（分页 + tab + 筛选）
  async getActivityList(reset = false) {
    if (this.data.isLoading) return;
    if (reset) {
      this.setData({ page: 1, hasMore: true, activityList: [], isLoading: true });
    } else {
      this.setData({ isLoading: true });
    }

    try {
      const { currentTab, page, pageSize, filterDifficulty, filterTravel, filterOfficial } = this.data;
      const params = { page, size: pageSize, tab: currentTab };
      if (filterDifficulty !== '') params.difficulty = filterDifficulty;
      if (filterTravel !== '') params.travel = filterTravel;
      if (filterOfficial) params.official = 1;

      const result = await get('/api/activity/list', params, { silent: true });

      if (result.code === 200) {
        const activities = result.data.list || [];
        const total = result.data.total || 0;

        const formattedList = activities.map(item => {
          const participantCount = Number(item.participant_count) || 0;
          const remainCount = Math.max(item.max_participants - participantCount, 0);
          return {
            id: item.id,
            name: item.name,
            time: this.formatActivityTime(item.activity_time),
            location: item.location,
            remainCount,
            totalCount: item.max_participants,
            participantCount,
            difficulty: this.getDifficultyText(item.difficulty),
            statusBadge: this.getStatusBadge(item.status, remainCount, item.has_registered),
            statusClass: this.getStatusClass(item.status),
            coverUrl: item.cover_url,
            has_registered: item.has_registered,
            isOfficial: Number(item.is_official) === 1,
            isEnded: Number(item.status) === 4
          };
        });

        const newList = reset ? formattedList : [...this.data.activityList, ...formattedList];
        this.setData({
          activityList: newList,
          hasMore: newList.length < total,
          isLoading: false,
          [currentTab === 'ongoing' ? 'ongoingCount' : 'endedCount']: total
        });
      }
    } catch (error) {
      console.error('获取活动列表失败:', error);
      this.setData({ isLoading: false });
    }
  },

  // Tab 切换
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;
    this.setData({ currentTab: tab }, () => this.getActivityList(true));
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.getActivityList(true);
    setTimeout(() => wx.stopPullDownRefresh(), 1000);
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.setData({ page: this.data.page + 1 });
      this.getActivityList(false);
    }
  },

  // 页面滚动检测
  onPageScroll(e) {
    const show = e.scrollTop > 400;
    if (show !== this.data.showScrollTop) {
      this.setData({ showScrollTop: show });
    }
  },

  // 回到顶部
  onScrollToTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },

  // 安全解析时间字符串
  // wx.cloud.callContainer 会把 "YYYY-MM-DD HH:MM:SS" 当作 UTC 转成 Date 对象
  // 所以需要用 UTC getter 取回原始值（即后端的北京时间）
  parseTimeStr(timeStr) {
    if (!timeStr) return null;
    // 如果已经是 Date 对象，直接取 UTC 组件
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
    // 尝试 YYYY-MM-DD HH:MM:SS 格式
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
    // 兜底：Date 解析后取 UTC 组件
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
  },

  // 格式化活动时间（后端返回北京时间，直接解析字符串避免时区转换）
  formatActivityTime(timeStr) {
    const t = this.parseTimeStr(timeStr);
    if (!t) return timeStr || '';
    const month = String(t.month).padStart(2, '0');
    const day = String(t.day).padStart(2, '0');
    const hour = String(t.hour).padStart(2, '0');
    const minute = String(t.minute).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  },

  // 获取难度文本
  getDifficultyText(level) {
    return level + '⭐';
  },

  // 获取状态文本
  getStatusText(status) {
    const map = {
      0: '待审核',
      1: '报名中',
      2: '审核拒绝',
      3: '进行中',
      4: '已结束',
      5: '已取消'
    };
    return map[status] || '未知';
  },

  // 获取状态徽章
  // 优先级：已结束/已取消 > 已报名 > 可报名/已满员
  getStatusBadge(status, remainCount, has_registered) {
    // 先判断活动是否已结束或已取消（这些状态优先于报名状态）
    if (status === 4) return '已结束';
    if (status === 5) return '已取消';
    if (status === 2) return '已拒绝';

    // 再判断报名状态
    if (has_registered) return '已报名';
    if (status === 1) {
      if (remainCount <= 0) return '已满员';
      return '可报名';
    }
    return '已截止';
  },


  // 获取状态样式类
  getStatusClass(status) {
    const map = {
      0: 'pending', // 待审核
      1: 'ongoing', // 报名中
      2: 'rejected', // 拒绝
      3: 'active', // 进行中
      4: 'ended', // 已结束
      5: 'cancelled' // 已取消
    };
    return map[status] || 'closed';
  },

  // 显示自定义验证弹窗
  showCustomVerifyDialog() {
    this.setData({
      showVerifyDialog: true,
      verifyAnswer: '',
      verifyError: '',
      autoFocus: true
    }, () => {
      setTimeout(() => this.setData({
        autoFocus: false
      }), 500);
    });
  },

  // 输入框变化
  onAnswerInput(e) {
    this.setData({
      verifyAnswer: e.detail.value
    });
  },

  // 点击确认按钮
  async onVerifyConfirm() {
    const answer = this.data.verifyAnswer.trim();
    if (!answer) {
      this.setData({
        verifyError: '请输入答案'
      });
      return;
    }

    wx.showLoading({
      title: '验证中...'
    });
    try {
      const result = await post('/verify', {
        answer,
        question_idx: this.data.verifyQuestionIdx
      }, { silent: true });

      wx.hideLoading();

      if (result.code === 200) {
        const userData = result.data;
        // 更新验证问题信息到 userData
        if (result.verifyQuestion) {
          userData.verifyQuestion = result.verifyQuestion;
          userData.verifyQuestionIdx = result.verifyQuestionIdx;
        }
        getApp().globalData.userInfo = userData;
        wx.setStorageSync('userInfo', userData);
        this.setData({
          userInfo: userData
        });

        if (userData.isBlacklist === 1) {
          this.setData({
            showVerifyDialog: false,
            showLockedDialog: true,
            isBlacklisted: true
          });
        } else if (userData.needVerify === 0) {
          this.setData({
            showVerifyDialog: false
          });
          wx.showToast({
            title: '验证通过',
            icon: 'success'
          });
        } else {
          // 验证失败，更新验证问题（后端可能返回新题）
          const updateData = {
            verifyError: `答案错误，还剩 ${3 - (userData.verifyAttempts || 0)} 次机会`,
            verifyAnswer: '',
            autoFocus: true
          };
          if (result.verifyQuestion) {
            updateData.verifyQuestion = result.verifyQuestion;
            updateData.verifyQuestionIdx = result.verifyQuestionIdx;
          }
          this.setData(updateData);
        }
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      });
    }
  },

  // 点击取消按钮
  onVerifyCancel() {
    wx.showToast({
      title: '请完成验证',
      icon: 'none'
    });
  },

  // 锁定弹窗确认 - 关闭弹窗但保持遮罩
  onLockedConfirm() {
    this.setData({
      showLockedDialog: false
    });
  },

  // 点击遮罩层提示
  onMaskTap() {
    wx.showToast({ title: '账户已被锁定', icon: 'none' });
  },

  // 阻止弹窗蒙层滑动
  preventTouchMove() {
    return;
  },

  // Promise化微信API
  wxPromise(method, options = {}) {
    return new Promise((resolve, reject) => {
      wx[method]({
        ...options,
        success: resolve,
        fail: reject
      });
    });
  },

  // 点击发布活动按钮
  onPublishClick() {
    wx.navigateTo({ url: '/pages/publish/publish' });
  },

  onAboutClick() {
    wx.navigateTo({ url: '/pages/about/about' });
  },

  // 点击单个活动卡片
  onActivityClick(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/details/details?id=${id}` });
  },

  // ====== 活动筛选 ======
  onFilterDifficulty(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ filterDifficulty: value === '' ? '' : value }, () => this.getActivityList(true));
  },

  onFilterTravel(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ filterTravel: value === '' ? '' : parseInt(value) }, () => this.getActivityList(true));
  },

  onToggleOfficial() {
    this.setData({ filterOfficial: !this.data.filterOfficial }, () => this.getActivityList(true));
  },

  onLotteryClose() {
    this.setData({ showLotteryPopup: false, lotteryInfo: {} });
  },

  onLotteryDrawn(e) {
    const result = e.detail || {};
    this.setData({
      'lotteryInfo.chances_remaining': Number(result.chances_remaining || 0),
      'lotteryInfo.can_draw': Number(result.chances_remaining || 0) > 0
    });
  },

  onShareAppMessage() {
    return {
      title: '步步出沪|徒然好想走', // 分享卡片的标题
      path: '/pages/home/home', // 用户点开后进入的页面路径，默认为当前页
    }
  },
});
