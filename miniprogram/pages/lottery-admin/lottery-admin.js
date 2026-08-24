const { get, post } = require('../../utils/api');

function formatDate(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatClock(value) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function defaultPrizes() {
  return [
    { _key: `prize_${Date.now()}_1`, tier_name: '一等奖', quantity: 1, probability: 5, image_url: '', claim_instructions: '', pickup_location: '' },
    { _key: `prize_${Date.now()}_2`, tier_name: '二等奖', quantity: 2, probability: 10, image_url: '', claim_instructions: '', pickup_location: '' }
  ];
}

Page({
  data: {
    lotteryList: [],
    showForm: false,
    submitting: false,
    activityOptions: [],
    activityIndex: 0,
    formLotteryName: '活动幸运转盘',
    formPassword: '',
    formStartDate: '',
    formStartTime: '',
    formEndDate: '',
    formEndTime: '',
    prizeList: [],
    probabilityTotal: 0,
    uploadingPrizeIndex: -1,

    showRecords: false,
    recordsLoading: false,
    currentLotteryId: 0,
    recordKeyword: '',
    recordResultFilter: 'all',
    recordRedeemFilter: 'all',
    recordInfo: { activity_name: '', lottery_name: '', total: 0, winning_count: 0, list: [] },

    showParticipants: false,
    participantsLoading: false,
    participantKeyword: '',
    participantList: [],

    showRedeem: false,
    redeemCode: '',
    redeeming: false,

    showPasswordEditor: false,
    passwordLotteryId: 0,
    editPassword: '',
    passwordSaving: false
  },

  onLoad() {
    this.loadLotteries();
  },

  onShow() {
    this.loadLotteries();
  },

  async loadLotteries() {
    try {
      const result = await get('/api/admin/lottery/list', {}, { silent: true });
      this.setData({ lotteryList: result.data || [] });
    } catch (error) {
      console.error('加载抽奖列表失败:', error);
      wx.showToast({ title: '抽奖列表加载失败', icon: 'none' });
    }
  },

  async loadActivities() {
    try {
      const result = await get('/api/admin/lottery/official-activities', {}, { silent: true });
      const list = (result.data || []).filter(item => Number(item.is_official) === 1);
      this.setData({ activityOptions: list, activityIndex: 0 });
      return list.length > 0;
    } catch (error) {
      console.error('加载官方活动失败:', error);
      wx.showToast({ title: '官方活动加载失败', icon: 'none' });
      return false;
    }
  },

  async showCreateForm() {
    if (!(await this.loadActivities())) {
      wx.showToast({ title: '暂无可创建抽奖的官方活动', icon: 'none' });
      return;
    }
    const start = new Date(Date.now() + 5 * 60 * 1000);
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const prizeList = defaultPrizes();
    this.setData({
      showForm: true,
      formLotteryName: '活动幸运转盘',
      formPassword: '',
      formStartDate: formatDate(start),
      formStartTime: formatClock(start),
      formEndDate: formatDate(end),
      formEndTime: formatClock(end),
      prizeList,
      probabilityTotal: this.sumProbability(prizeList)
    });
  },

  hideCreateForm() {
    if (!this.data.submitting) this.setData({ showForm: false });
  },

  onActivityChange(e) { this.setData({ activityIndex: Number(e.detail.value) }); },
  onLotteryNameInput(e) { this.setData({ formLotteryName: e.detail.value }); },
  onPasswordInput(e) { this.setData({ formPassword: e.detail.value }); },
  onStartDateChange(e) { this.setData({ formStartDate: e.detail.value }); },
  onStartTimeChange(e) { this.setData({ formStartTime: e.detail.value }); },
  onEndDateChange(e) { this.setData({ formEndDate: e.detail.value }); },
  onEndTimeChange(e) { this.setData({ formEndTime: e.detail.value }); },

  sumProbability(list) {
    return Math.round(list.reduce((sum, item) => sum + (Number(item.probability) || 0), 0) * 100) / 100;
  },

  updatePrize(index, key, value) {
    const prizeList = [...this.data.prizeList];
    if (!prizeList[index]) return;
    prizeList[index] = { ...prizeList[index], [key]: value };
    this.setData({ prizeList, probabilityTotal: this.sumProbability(prizeList) });
  },

  onPrizeNameInput(e) { this.updatePrize(Number(e.currentTarget.dataset.index), 'tier_name', e.detail.value); },
  onPrizeQtyInput(e) { this.updatePrize(Number(e.currentTarget.dataset.index), 'quantity', Number(e.detail.value) || 0); },
  onPrizeProbabilityInput(e) { this.updatePrize(Number(e.currentTarget.dataset.index), 'probability', Number(e.detail.value) || 0); },
  onClaimInput(e) { this.updatePrize(Number(e.currentTarget.dataset.index), 'claim_instructions', e.detail.value); },
  onPickupInput(e) { this.updatePrize(Number(e.currentTarget.dataset.index), 'pickup_location', e.detail.value); },

  addPrize() {
    if (this.data.prizeList.length >= 12) {
      wx.showToast({ title: '最多12个奖项', icon: 'none' });
      return;
    }
    const prizeList = [...this.data.prizeList];
    prizeList.push({
      _key: `prize_${Date.now()}_${prizeList.length}`,
      tier_name: '', quantity: 1, probability: 5, image_url: '',
      claim_instructions: '', pickup_location: ''
    });
    this.setData({ prizeList, probabilityTotal: this.sumProbability(prizeList) });
  },

  removePrize(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (this.data.prizeList.length <= 1) return;
    const prizeList = this.data.prizeList.filter((_, idx) => idx !== index);
    this.setData({ prizeList, probabilityTotal: this.sumProbability(prizeList) });
  },

  onPrizeImageTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!this.data.prizeList[index]) return;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: result => this.uploadPrizeImage(index, result.tempFilePaths[0])
    });
  },

  async uploadPrizeImage(index, filePath) {
    if (!filePath || this.data.uploadingPrizeIndex >= 0) return;
    this.setData({ uploadingPrizeIndex: index });
    wx.showLoading({ title: '上传中...', mask: true });
    let fileID = '';
    try {
      const user = wx.getStorageSync('userInfo') || {};
      const ext = String(filePath.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
      const upload = await wx.cloud.uploadFile({
        cloudPath: `lottery/prizes/${user.openId || 'admin'}_${Date.now()}_${index}.${ext}`,
        filePath
      });
      fileID = upload.fileID;
      const temp = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const url = temp.fileList?.[0]?.tempFileURL;
      if (!url) throw new Error('图片地址获取失败');
      await post('/check-image-url', { url }, { silent: true });
      this.updatePrize(index, 'image_url', fileID);
      wx.showToast({ title: '上传成功', icon: 'success' });
    } catch (error) {
      if (fileID) {
        try { await wx.cloud.deleteFile({ fileList: [fileID] }); } catch (_) {}
      }
      wx.showToast({ title: error.response?.msg || error.message || '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ uploadingPrizeIndex: -1 });
    }
  },

  onRemovePrizeImage(e) {
    this.updatePrize(Number(e.currentTarget.dataset.index), 'image_url', '');
  },

  buildPayload() {
    const data = this.data;
    const activity = data.activityOptions[data.activityIndex];
    if (!activity || Number(activity.is_official) !== 1) throw new Error('请选择官方活动');
    if (!data.formLotteryName.trim()) throw new Error('请填写抽奖名称');
    if (data.formPassword === '') throw new Error('请填写抽奖口令');
    const start = new Date(`${data.formStartDate}T${data.formStartTime}:00`).getTime();
    const end = new Date(`${data.formEndDate}T${data.formEndTime}:00`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('抽奖结束时间必须晚于开始时间');
    if (data.probabilityTotal <= 0 || data.probabilityTotal > 100) throw new Error('奖品总概率需大于0且不超过100%');
    const prizes = data.prizeList.map((item, index) => {
      if (!item.tier_name.trim() || item.quantity < 1 || item.probability <= 0) throw new Error(`请完整配置第${index + 1}个奖项`);
      if (!item.claim_instructions.trim()) throw new Error(`${item.tier_name}缺少领奖说明`);
      return {
        tier_name: item.tier_name.trim(),
        tier_level: index + 1,
        quantity: Number(item.quantity),
        probability: Number(item.probability),
        image_url: item.image_url || '',
        claim_instructions: item.claim_instructions.trim(),
        pickup_location: item.pickup_location.trim()
      };
    });
    return {
      activity_id: activity.id,
      lottery_name: data.formLotteryName.trim(),
      password: data.formPassword,
      start_time: `${data.formStartDate} ${data.formStartTime}`,
      end_time: `${data.formEndDate} ${data.formEndTime}`,
      prizes
    };
  },

  onCreateLottery() {
    let payload;
    try {
      payload = this.buildPayload();
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
      return;
    }
    const activity = this.data.activityOptions[this.data.activityIndex];
    const summary = payload.prizes.map(item => `${item.tier_name}×${item.quantity}（${item.probability}%）`).join('、');
    wx.showModal({
      title: '确认发布抽奖',
      content: `活动：${activity.name}\n抽奖：${payload.lottery_name}\n奖品：${summary}\n总中奖概率：${this.data.probabilityTotal}%`,
      confirmText: '确认发布',
      confirmColor: '#4d9fd7',
      success: result => { if (result.confirm) this.submitLottery(payload); }
    });
  },

  async submitLottery(payload) {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      await post('/api/admin/lottery/create', payload, { silent: true });
      wx.showToast({ title: '抽奖已发布', icon: 'success' });
      this.setData({ showForm: false });
      this.loadLotteries();
    } catch (error) {
      wx.showToast({ title: error.response?.msg || '发布失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  showPasswordEditor(e) {
    const lottery = this.data.lotteryList[Number(e.currentTarget.dataset.index)] || {};
    this.setData({
      showPasswordEditor: true,
      passwordLotteryId: Number(lottery.id || 0),
      editPassword: String(lottery.password || '')
    });
  },

  hidePasswordEditor() {
    if (!this.data.passwordSaving) {
      this.setData({ showPasswordEditor: false, passwordLotteryId: 0, editPassword: '' });
    }
  },

  onEditPasswordInput(e) {
    this.setData({ editPassword: e.detail.value });
  },

  async savePassword() {
    if (!this.data.passwordLotteryId || this.data.editPassword === '' || this.data.passwordSaving) return;
    this.setData({ passwordSaving: true });
    try {
      await post('/api/admin/lottery/update-password', {
        lottery_id: this.data.passwordLotteryId,
        password: this.data.editPassword
      }, { silent: true });
      wx.showToast({ title: '口令已修改', icon: 'success' });
      this.setData({ showPasswordEditor: false, passwordLotteryId: 0, editPassword: '' });
      this.loadLotteries();
    } catch (error) {
      wx.showToast({ title: error.response?.msg || '修改失败', icon: 'none' });
    } finally {
      this.setData({ passwordSaving: false });
    }
  },

  async onViewRecords(e) {
    const lotteryId = Number(e.currentTarget.dataset.id);
    this.setData({
      showRecords: true,
      currentLotteryId: lotteryId,
      recordKeyword: '',
      recordResultFilter: 'all',
      recordRedeemFilter: 'all',
      recordInfo: { activity_name: e.currentTarget.dataset.name || '', lottery_name: '', total: 0, winning_count: 0, list: [] }
    });
    await this.loadRecords();
  },

  async loadRecords() {
    if (!this.data.currentLotteryId) return;
    this.setData({ recordsLoading: true });
    try {
      const result = await get('/api/admin/lottery/records', {
        lottery_id: this.data.currentLotteryId,
        keyword: this.data.recordKeyword,
        result: this.data.recordResultFilter,
        redemption_status: this.data.recordRedeemFilter
      }, { silent: true });
      this.setData({ recordInfo: result.data });
    } catch (error) {
      wx.showToast({ title: error.response?.msg || '记录加载失败', icon: 'none' });
    } finally {
      this.setData({ recordsLoading: false });
    }
  },

  hideRecords() { this.setData({ showRecords: false }); },
  onRecordKeywordInput(e) { this.setData({ recordKeyword: e.detail.value }); },
  onRecordSearch() { this.loadRecords(); },
  onRecordResultFilter(e) { this.setData({ recordResultFilter: e.currentTarget.dataset.value }, () => this.loadRecords()); },
  onRecordRedeemFilter(e) { this.setData({ recordRedeemFilter: e.currentTarget.dataset.value }, () => this.loadRecords()); },

  async onManageChances(e) {
    this.setData({ showParticipants: true, currentLotteryId: Number(e.currentTarget.dataset.id), participantKeyword: '' });
    await this.loadParticipants();
  },

  async loadParticipants() {
    this.setData({ participantsLoading: true });
    try {
      const result = await get('/api/admin/lottery/participants', {
        lottery_id: this.data.currentLotteryId,
        keyword: this.data.participantKeyword
      }, { silent: true });
      this.setData({ participantList: result.data || [] });
    } catch (error) {
      wx.showToast({ title: error.response?.msg || '用户加载失败', icon: 'none' });
    } finally {
      this.setData({ participantsLoading: false });
    }
  },

  hideParticipants() { this.setData({ showParticipants: false }); },
  onParticipantKeywordInput(e) { this.setData({ participantKeyword: e.detail.value }); },
  onParticipantSearch() { this.loadParticipants(); },

  onGrantChance(e) {
    const openid = e.currentTarget.dataset.openid;
    const nickname = e.currentTarget.dataset.name || '该用户';
    wx.showModal({
      title: '追加抽奖机会',
      editable: true,
      placeholderText: '追加次数（1-10）',
      content: '',
      success: async result => {
        if (!result.confirm) return;
        const quantity = Number(result.content || 1);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
          wx.showToast({ title: '请输入1至10的整数', icon: 'none' });
          return;
        }
        try {
          await post('/api/admin/lottery/grant-chance', {
            lottery_id: this.data.currentLotteryId,
            user_openid: openid,
            quantity,
            reason: `为${nickname}手动追加`
          }, { silent: true });
          wx.showToast({ title: '已追加', icon: 'success' });
          this.loadParticipants();
        } catch (error) {
          wx.showToast({ title: error.response?.msg || '追加失败', icon: 'none' });
        }
      }
    });
  },

  showRedeemPanel() { this.setData({ showRedeem: true, redeemCode: '' }); },
  hideRedeemPanel() { if (!this.data.redeeming) this.setData({ showRedeem: false }); },
  onRedeemCodeInput(e) { this.setData({ redeemCode: e.detail.value.toUpperCase() }); },
  onRedeemRecord(e) { this.setData({ showRedeem: true, redeemCode: e.currentTarget.dataset.code || '' }); },

  async submitRedeem() {
    if (!this.data.redeemCode.trim() || this.data.redeeming) return;
    this.setData({ redeeming: true });
    try {
      const result = await post('/api/admin/lottery/redeem', { redeem_code: this.data.redeemCode.trim() }, { silent: true });
      wx.showModal({
        title: '核销成功',
        content: `${result.data.nickname}\n${result.data.activity_name}\n${result.data.prize_name}`,
        showCancel: false
      });
      this.setData({ showRedeem: false, redeemCode: '' });
      if (this.data.showRecords) this.loadRecords();
      this.loadLotteries();
    } catch (error) {
      wx.showToast({ title: error.response?.msg || '核销失败', icon: 'none' });
    } finally {
      this.setData({ redeeming: false });
    }
  },

  onEndLottery(e) {
    const id = Number(e.currentTarget.dataset.id);
    wx.showModal({
      title: '确认结束抽奖',
      content: '结束后用户不能继续抽奖，已有奖品仍可继续核销。',
      success: async result => {
        if (!result.confirm) return;
        try {
          await post('/api/admin/lottery/end', { lottery_id: id }, { silent: true });
          wx.showToast({ title: '已结束', icon: 'success' });
          this.loadLotteries();
        } catch (error) {
          wx.showToast({ title: error.response?.msg || '操作失败', icon: 'none' });
        }
      }
    });
  }
});
