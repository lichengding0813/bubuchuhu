Component({
  properties: {
    show: Boolean,
    options: { type: Array, value: [] },
    selectedId: Number,
    loading: Boolean,
    error: String,
    emptyText: { type: String, value: '暂无可选择的官方活动' }
  },
  data: { keyword: '', filteredOptions: [] },
  observers: {
    show(value) { if (value) this.setData({ keyword: '' }); },
    'options, keyword'(options, keyword) {
      const search = String(keyword || '').trim().toLowerCase();
      this.setData({ filteredOptions: (options || []).filter(item => {
        const text = `${item.name || ''} ${item.location || ''} ${item.time || item.activity_time || ''}`.toLowerCase();
        return Number(item.id) > 0 && (!search || text.includes(search));
      }) });
    }
  },
  methods: {
    onInput(e) { this.setData({ keyword: e.detail.value }); },
    onSelect(e) {
      if (this.data.loading || this.data.error) return;
      const id = Number(e.currentTarget.dataset.id);
      if (this.data.options.some(item => Number(item.id) === id)) this.triggerEvent('select', { id });
    },
    onClose() { this.triggerEvent('close'); },
    onRetry() { this.triggerEvent('retry'); }
  }
});
