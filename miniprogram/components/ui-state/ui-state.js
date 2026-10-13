Component({
  properties: {
    loading: Boolean,
    error: String,
    empty: Boolean,
    emptyText: { type: String, value: '暂无数据' },
    icon: { type: String, value: 'records-o' },
    compact: Boolean
  },
  methods: {
    onRetry() { this.triggerEvent('retry'); }
  }
});
