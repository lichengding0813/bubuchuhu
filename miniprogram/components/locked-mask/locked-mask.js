/**
 * 黑名单锁定遮罩组件
 * 
 * Properties:
 *   showMask: Boolean - 是否显示遮罩
 *   showDialog: Boolean - 是否显示锁定提示弹窗
 * 
 * Events:
 *   confirm: 用户点击"知道了"
 */
Component({
  properties: {
    showMask: {
      type: Boolean,
      value: false
    },
    showDialog: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onConfirm() {
      this.triggerEvent('confirm');
    },

    onMaskTap() {
      wx.showToast({ title: '账户已被锁定', icon: 'none' });
    },

    preventTouchMove() {
      return;
    }
  }
});
