/**
 * 验证弹窗组件
 * 
 * 自包含验证逻辑：组件内部调用 /verify 接口，外部只需监听事件
 * 
 * Properties:
 *   show: Boolean - 是否显示弹窗
 *   question: String - 验证问题 (默认从 globalData 读取)
 *   questionIdx: Number - 问题索引 (默认从 globalData 读取)
 * 
 * Events:
 *   verify-success: 验证通过 { userData }
 *   verify-failed: 验证失败 { msg }
 *   account-locked: 账户锁定 { userData }
 *   cancel: 用户取消
 */
const { callApi } = require('../../utils/api.js');

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    question: {
      type: String,
      value: ''
    },
    questionIdx: {
      type: Number,
      value: 0
    }
  },

  data: {
    answer: '',
    error: '',
    autoFocus: false,
    loading: false
  },

  observers: {
    'show': function(newVal) {
      if (newVal) {
        // 弹窗打开时聚焦输入框
        this.setData({ answer: '', error: '', autoFocus: true, loading: false });
        // 短暂延迟后取消 autoFocus，让输入框可重复聚焦
        setTimeout(() => {
          this.setData({ autoFocus: false });
        }, 500);
      }
    }
  },

  methods: {
    onInput(e) {
      this.setData({ answer: e.detail.value, error: '' });
    },

    async onConfirm() {
      const answer = this.data.answer.trim();
      if (!answer) {
        this.setData({ error: '请输入答案' });
        return;
      }

      this.setData({ loading: true });

      try {
        const res = await callApi('/verify', 'POST', {
          answer: answer,
          question_idx: this.data.questionIdx
        });

        const userData = res.data;
        // 更新本地用户信息
        const app = getApp();
        if (app) app.globalData.userInfo = userData;
        wx.setStorageSync('userInfo', userData);

        if (userData.isBlacklist === 1) {
          this.triggerEvent('account-locked', { userData });
        } else if (userData.needVerify === 0) {
          this.triggerEvent('verify-success', { userData });
        } else {
          // 答案错误，还有机会
          const remain = 3 - (userData.verifyAttempts || 0);
          this.setData({
            error: `答案错误，还剩 ${remain} 次机会`,
            answer: '',
            autoFocus: true,
            loading: false
          });
          this.triggerEvent('verify-failed', { msg: `答案错误` });
        }
      } catch (err) {
        this.setData({ loading: false });
        if (err.message === 'ACCOUNT_LOCKED') {
          const userInfo = wx.getStorageSync('userInfo') || {};
          userInfo.isBlacklist = 1;
          wx.setStorageSync('userInfo', userInfo);
          this.triggerEvent('account-locked', { userData: userInfo });
        } else {
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      }
    },

    onCancel() {
      this.triggerEvent('cancel');
    },

    preventTouchMove() {
      return;
    }
  }
});
