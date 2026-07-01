const FAMILY = require('../../utils/family')
const MENU = require('../../utils/menu')

Page({
  data: {
    loading: true,
    families: [],
    roleLabels: FAMILY.ROLE_LABELS,
    createDialogShow: false,
    createName: '',
  },

  onShow() {
    this.loadFamilies()
  },

  async loadFamilies() {
    this.setData({ loading: true })
    try {
      const families = await FAMILY.listFamilies()
      this.setData({ families, loading: false })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({
        title: err.message || '加载失败',
        icon: 'none',
      })
    }
  },

  showCreateDialog() {
    this.setData({ createDialogShow: true, createName: '' })
  },

  onCreateClose() {
    this.setData({ createDialogShow: false })
  },

  onCreateNameInput(e) {
    this.setData({ createName: e.detail.value })
  },

  async confirmCreate() {
    const name = this.data.createName.trim()
    if (!name) {
      wx.showToast({ title: '请输入家庭名称', icon: 'none' })
      return
    }
    try {
      const family = await FAMILY.createFamily(name)
      MENU.setCurrentFamilyId(family.id)
      this.setData({ createDialogShow: false, createName: '' })
      wx.navigateTo({
        url: `/pages/family/detail?id=${family.id}`,
      })
    } catch (err) {
      wx.showToast({
        title: err.message || '创建失败',
        icon: 'none',
      })
    }
  },

  goJoin() {
    wx.navigateTo({ url: '/pages/family/join' })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    MENU.setCurrentFamilyId(id)
    wx.navigateTo({ url: `/pages/family/detail?id=${id}` })
  },
})
