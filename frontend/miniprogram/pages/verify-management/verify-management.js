// 示例数据：后端暂无验证问题时兜底展示，保存后写入真实数据
const SAMPLE_QUESTIONS = [
  { id: 'sample-1', question: '玛莎的全名是？', answers_text: '蔡昇晏', is_active: 1 },
];

Page({
  data: {
    questionList: [],
    isLoading: false,
    isSampleData: false,
    // 编辑弹窗
    showEditPopup: false,
    editingId: null,
    editQuestion: '',
    editAnswerList: [],
    answerInput: ''
  },

  onLoad() {
    this.loadQuestions();
  },

  onShow() {
    this.loadQuestions();
  },

  async loadQuestions() {
    this.setData({ isLoading: true });
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
        this.setData({ questionList: list, isSampleData: false });
      } else {
        // 加载失败：兜底展示示例数据
        wx.showToast({ title: result.data?.msg || '加载失败', icon: 'none' });
        this.setData({ questionList: SAMPLE_QUESTIONS, isSampleData: true });
      }
    } catch (error) {
      // 请求异常：兜底展示示例数据
      console.error('加载验证问题失败:', error);
      wx.showToast({ title: '网络错误', icon: 'error' });
      this.setData({ questionList: SAMPLE_QUESTIONS, isSampleData: true });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  // ==================== 新增/编辑 ====================

  onAddQuestion() {
    this.setData({
      showEditPopup: true,
      editingId: null,
      editQuestion: '',
      editAnswerList: [],
      answerInput: ''
    });
  },

  onEditQuestion(e) {
    const { id, question, answers } = e.currentTarget.dataset;
    this.setData({
      showEditPopup: true,
      editingId: id,
      editQuestion: question,
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
    this.setData({ showEditPopup: false });
  },

  async onSaveQuestion() {
    const { editQuestion, editAnswerList, editingId } = this.data;
    if (!editQuestion.trim()) {
      wx.showToast({ title: '请输入问题', icon: 'none' });
      return;
    }
    if (editAnswerList.length === 0) {
      wx.showToast({ title: '请至少添加一个答案', icon: 'none' });
      return;
    }

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
          answers: answersStr
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
    }
  },

  // ==================== 启用/禁用 ====================

  async onToggleActive(e) {
    const { id, active } = e.currentTarget.dataset;
    const newActive = active ? 0 : 1;

    wx.showLoading({ title: '操作中...' });
    try {
      const userInfo = wx.getStorageSync('userInfo');
      // 找到当前问题，获取 question 和 answers
      const q = this.data.questionList.find(item => item.id === id);
      if (!q) return;

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
        wx.showToast({ title: result.data?.msg || '操作失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'error' });
    }
  },

  // ==================== 删除 ====================

  onDeleteQuestion(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这道验证问题吗？',
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
