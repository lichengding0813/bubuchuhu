/** 验证题：先核对图片、题目和答案，再提交；父页面接收 result 更新登录状态。 */
const { post } = require('../../utils/api');
const { DEFAULT_VERIFY_IMAGE } = require('../../utils/config');

Component({
  properties: {
    show: { type: Boolean, value: false },
    question: { type: String, value: '' },
    questionIdx: { type: Number, value: 0 },
    questionImage: { type: String, value: '' },
    userOpenid: { type: String, value: '' }
  },

  data: {
    answer: '',
    error: '',
    autoFocus: false,
    loading: false,
    confirming: false,
    snapshot: null,
    currentQuestion: '',
    currentQuestionIdx: 0,
    currentImage: '',
    defaultImage: DEFAULT_VERIFY_IMAGE
  },

  observers: {
    show(value) {
      if (value) this.setData({ answer: '', error: '', autoFocus: true, confirming: false, snapshot: null });
    },
    'question, questionIdx, questionImage'(question, questionIdx, questionImage) {
      const changed = question !== this.data.currentQuestion || Number(questionIdx) !== this.data.currentQuestionIdx || questionImage !== this.data.currentImage;
      const questionChanged = this.data.currentQuestion && (question !== this.data.currentQuestion || Number(questionIdx) !== this.data.currentQuestionIdx);
      this.setData({
        currentQuestion: question || '',
        currentQuestionIdx: Number(questionIdx) || 0,
        currentImage: questionImage || '',
        ...(changed ? { answer: '', confirming: false, snapshot: null } : {}),
        ...(questionChanged ? { error: this.data.error || '题目已更新，请重新查看并填写答案' } : {})
      });
    }
  },

  methods: {
    onInput(e) {
      if (!this.data.loading && !this.data.confirming) this.setData({ answer: e.detail.value, error: '' });
    },

    onImageError() {
      this.setData({ currentImage: '', ...(this.data.snapshot ? { 'snapshot.image': '' } : {}) });
    },

    onConfirm() {
      if (this.data.loading || this.data.confirming) return;
      const answer = this.data.answer.trim();
      if (!this.data.currentQuestion) { this.setData({ error: '题目加载中，请稍后再试' }); return; }
      if (!answer) { this.setData({ error: '请输入答案' }); return; }
      const user = wx.getStorageSync('userInfo');
      this.setData({
        confirming: true, autoFocus: false, error: '',
        snapshot: {
          question: this.data.currentQuestion,
          questionIdx: this.data.currentQuestionIdx,
          image: this.data.currentImage,
          answer,
          openid: this.data.userOpenid || user?.openId || ''
        }
      });
    },

    onBack() {
      if (this.data.loading) return;
      this.setData({ confirming: false, snapshot: null, autoFocus: true });
    },

    async onSubmit() {
      if (this.data.loading || !this.data.confirming || !this.data.snapshot) return;
      const snapshot = this.data.snapshot;
      const user = wx.getStorageSync('userInfo');
      if (snapshot.openid !== user?.openId || (this.data.userOpenid && snapshot.openid !== this.data.userOpenid)) {
        this.setData({ confirming: false, snapshot: null, error: '登录状态已改变，请重新进入验证' });
        return;
      }
      if (snapshot.question !== this.data.currentQuestion || snapshot.questionIdx !== this.data.currentQuestionIdx) {
        this.setData({ confirming: false, snapshot: null, error: '题目已更新，请重新查看后提交' });
        return;
      }
      this.setData({ loading: true });
      try {
        const response = await post('/verify', {
          answer: snapshot.answer,
          question_idx: snapshot.questionIdx,
          question_text: snapshot.question
        }, { silent: true });
        if (wx.getStorageSync('userInfo')?.openId !== snapshot.openid) return;
        this.applyResult(response);
      } catch (error) {
        if (wx.getStorageSync('userInfo')?.openId !== snapshot.openid) return;
        if (error.response?.code === 409 && error.response?.verifyQuestion) {
          this.applyResult(error.response);
        } else if (error.response?.data?.isBlacklist === 1) {
          this.applyResult(error.response);
        } else {
          this.setData({ error: error.response?.msg || '提交失败，请重试' });
        }
      } finally {
        this.setData({ loading: false });
      }
    },

    applyResult(response) {
      const user = response.data || {};
      const changed = response.verifyQuestion && (response.verifyQuestion !== this.data.currentQuestion || Number(response.verifyQuestionIdx) !== this.data.currentQuestionIdx);
      this.triggerEvent('result', { response });
      if (user.needVerify === 1 && user.isBlacklist !== 1) {
        this.setData({
          confirming: false, snapshot: null, answer: '', autoFocus: true,
          error: response.code === 409 ? response.msg : `答案错误，还剩 ${3 - (user.verifyAttempts || 0)} 次机会${changed ? '，题目已更新' : ''}`,
          ...(response.verifyQuestion ? {
            currentQuestion: response.verifyQuestion,
            currentQuestionIdx: Number(response.verifyQuestionIdx) || 0,
            currentImage: response.verifyQuestionImage || ''
          } : {})
        });
      }
    },

    preventTouchMove() {}
  }
});
