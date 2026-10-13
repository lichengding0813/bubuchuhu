const { post } = require('../../utils/api');
const { DEFAULT_VERIFY_IMAGE } = require('../../utils/config');

Page({
  data: {
    questionList: [],
    isLoading: false,
    loadError: '',
    saving: false,
    uploading: false,
    defaultImage: DEFAULT_VERIFY_IMAGE,
    togglingId: null,
    // 编辑弹窗
    showEditPopup: false,
    editingId: null,
    editQuestion: '',
    editImage: DEFAULT_VERIFY_IMAGE,
    editAnswerList: [],
    answerInput: ''
  },

  onShow() {
    this.loadQuestions();
  },

  async loadQuestions() {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true, loadError: '' });
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/admin/verify-questions",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "content-type": "application/json"
        },
        method: "GET"
      });

      if (result.data && result.data.code === 200) {
        const list = result.data.data || [];
        // 正常返回：即使为空也按真实数据展示（空状态由页面提示，不展示示例数据）
        this.setData({ questionList: list.map(item => ({ ...item, is_active: Number(item.is_active) })) });
      } else {
        this.setData({ loadError: result.data?.msg || '验证问题加载失败' });
      }
    } catch (error) {
      console.error('加载验证问题失败:', error);
      this.setData({ loadError: '验证问题加载失败' });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  // ==================== 新增/编辑 ====================

  onAddQuestion() {
    if (this.data.saving || this.data.uploading) return;
    this.setData({
      showEditPopup: true,
      editingId: null,
      editQuestion: '',
      editImage: DEFAULT_VERIFY_IMAGE,
      editAnswerList: [],
      answerInput: ''
    });
  },

  onEditQuestion(e) {
    if (this.data.saving || this.data.uploading) return;
    const { id, question, answers } = e.currentTarget.dataset;
    const item = this.data.questionList.find(item => Number(item.id) === Number(id));
    this.setData({
      showEditPopup: true,
      editingId: id,
      editQuestion: question,
      editImage: item?.image_url || DEFAULT_VERIFY_IMAGE,
      editAnswerList: answers ? answers.split(',').map(s => s.trim()).filter(s => s) : [],
      answerInput: ''
    });
  },

  onQuestionInput(e) {
    this.setData({ editQuestion: e.detail });
  },

  onAnswerInput(e) {
    this.setData({ answerInput: e.detail });
  },

  onAddAnswer() {
    const val = (this.data.answerInput || '').trim();
    if (!val) return;
    if (this.data.editAnswerList.includes(val)) {
      wx.showToast({ title: '该答案已存在', icon: 'none' });
      return;
    }
    this.setData({
      editAnswerList: [...this.data.editAnswerList, val],
      answerInput: ''
    });
  },

  onRemoveAnswer(e) {
    const { index } = e.currentTarget.dataset;
    const list = [...this.data.editAnswerList];
    list.splice(index, 1);
    this.setData({ editAnswerList: list });
  },

  onEditPopupClose() {
    if (this.data.saving || this.data.uploading) return;
    this.setData({ showEditPopup: false });
  },

  async onSaveQuestion() {
    if (this.data.saving || this.data.uploading) return;
    const { editQuestion, editAnswerList, editingId } = this.data;
    if (!editQuestion.trim()) {
      wx.showToast({ title: '请输入问题', icon: 'none' });
      return;
    }
    if (editAnswerList.length === 0) {
      wx.showToast({ title: '请至少添加一个答案', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    const answersStr = editAnswerList.join(',');
    wx.showLoading({ title: '保存中...' });
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const path = editingId
        ? `/api/admin/verify-questions/${editingId}`
        : '/api/admin/verify-questions';
      const method = editingId ? 'PUT' : 'POST';

      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: path,
        method: method,
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "Content-Type": "application/json"
        },
        data: {
          question: editQuestion.trim(),
          answers: answersStr,
          image_url: this.data.editImage
        }
      });

      wx.hideLoading();
      if (result.data && result.data.code === 200) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        this.setData({ showEditPopup: false });
        this.loadQuestions();
      } else {
        wx.showToast({ title: result.data?.msg || '保存失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('保存验证问题失败:', error);
      wx.showToast({ title: '网络错误', icon: 'error' });
    } finally { this.setData({ saving: false }); }
  },

  // ==================== 启用/禁用 ====================

  onChooseImage() {
    if (this.data.saving || this.data.uploading) return;
    wx.chooseImage({
      count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: result => this.uploadImage(result.tempFilePaths[0])
    });
  },

  async uploadImage(filePath) {
    if (!filePath || this.data.saving || this.data.uploading) return;
    this.setData({ uploading: true });
    let fileID = '';
    try {
      const extension = filePath.match(/\.(png|jpg|jpeg|webp)$/i)?.[1]?.toLowerCase() || 'jpg';
      const result = await wx.cloud.uploadFile({
        cloudPath: `verification/questions/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`,
        filePath
      });
      fileID = result.fileID;
      const temp = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const url = temp.fileList?.[0]?.tempFileURL;
      if (!url) throw new Error('无法读取上传图片');
      await post('/check-image-url', { url }, { silent: true });
      this.setData({ editImage: fileID });
      wx.showToast({ title: '图片已上传', icon: 'success' });
    } catch (error) {
      if (fileID) {
        try { await wx.cloud.deleteFile({ fileList: [fileID] }); } catch (_) {}
      }
      wx.showToast({ title: error.response?.msg || error.message || '上传失败', icon: 'none' });
    } finally {
      this.setData({ uploading: false });
    }
  },

  onResetImage() {
    if (!this.data.saving && !this.data.uploading) this.setData({ editImage: DEFAULT_VERIFY_IMAGE });
  },

  async onToggleActive(e) {
    const { id } = e.currentTarget.dataset;
    if (this.data.togglingId || this.data.saving || this.data.uploading) return;
    const q = this.data.questionList.find(item => Number(item.id) === Number(id));
    if (!q) return;
    const newActive = e.detail.value ? 1 : 0;
    const previousActive = q.is_active;
    this.setData({ togglingId: id, questionList: this.data.questionList.map(item => Number(item.id) === Number(id) ? { ...item, is_active: newActive } : item) });

    wx.showLoading({ title: '操作中...' });
    try {
      const userInfo = wx.getStorageSync('userInfo');
      // 找到当前问题，获取 question 和 answers

      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: `/api/admin/verify-questions/${id}`,
        method: "PUT",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "Content-Type": "application/json"
        },
        data: {
          question: q.question,
          answers: q.answers_text,
          is_active: newActive
        }
      });

      wx.hideLoading();
      if (result.data && result.data.code === 200) {
        wx.showToast({ title: newActive ? '已启用' : '已禁用', icon: 'success' });
        this.loadQuestions();
      } else {
        this.setData({ questionList: this.data.questionList.map(item => Number(item.id) === Number(id) ? { ...item, is_active: previousActive } : item) });
        wx.showToast({ title: result.data?.msg || '操作失败', icon: 'none' });
      }
    } catch (error) {
      this.setData({ questionList: this.data.questionList.map(item => Number(item.id) === Number(id) ? { ...item, is_active: previousActive } : item) });
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'error' });
    } finally { this.setData({ togglingId: null }); }
  },

  // ==================== 删除 ====================

  onDeleteQuestion(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定要删除这道验证问题吗？',
      confirmColor: '#ff6b6b',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '删除中...' });
        try {
          const userInfo = wx.getStorageSync('userInfo');
          const result = await wx.cloud.callContainer({
            config: { env: "prod-3gktwx67d1dd1e76" },
            path: `/api/admin/verify-questions/${id}`,
            method: "DELETE",
            header: {
              "X-WX-SERVICE": "flask-mysql-login",
              "X-Wx-OpenId": userInfo?.openId,
              "Content-Type": "application/json"
            }
          });

          wx.hideLoading();
          if (result.data && result.data.code === 200) {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadQuestions();
          } else {
            wx.showToast({ title: result.data?.msg || '删除失败', icon: 'none' });
          }
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: '网络错误', icon: 'error' });
        }
      }
    });
  },

  // ==================== 全员重新验证 ====================

  onResetAllVerification() {
    wx.showModal({
      title: '确认操作',
      content: '将重置所有非管理员用户的验证状态，所有用户下次进入时需要重新回答验证问题。确定继续？',
      confirmText: '确定重置',
      confirmColor: '#ee0a24',
      success: (res) => {
        if (res.confirm) this.doResetVerification();
      }
    });
  },

  async doResetVerification() {
    wx.showLoading({ title: '执行中...' });
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/admin/reset-all-verification",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "content-type": "application/json"
        },
        method: "POST"
      });
      wx.hideLoading();
      if (result.data && result.data.code === 200) {
        const count = result.data.data?.affected_count || 0;
        wx.showToast({
          title: `已重置${count}位用户`,
          icon: 'success',
          duration: 2000
        });
      } else {
        wx.showToast({ title: result.data?.msg || '操作失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('全员重新验证失败:', error);
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  }
});
