const FAMILY = require('../../utils/family')
const FAMILY_SWITCH = require('../../utils/familySwitch')
const MENU = require('../../utils/menu')
const DIALOG = require('../../utils/dialog')

Page({
  data: {
    loading: true,
    families: [],
    currentFamilyId: null,
    currentFamilyName: '',
    canSwitchFamily: false,
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
      const currentFamilyId = MENU.getCurrentFamilyId()
      const current = families.find((f) => Number(f.id) === Number(currentFamilyId)) || families[0]
      const currentFamilyName = current ? current.name : ''
      if (current) {
        MENU.setCurrentFamilyId(current.id)
      }
      this.setData({
        families,
        currentFamilyId: current ? current.id : null,
        currentFamilyName,
        canSwitchFamily: families.length > 1,
        loading: false,
      })
    } catch (err) {
      this.setData({ loading: false })
      await DIALOG.showError(err, '加载失败')
    }
  },

  showFamilyPicker() {
    const { families, currentFamilyId, canSwitchFamily } = this.data
    if (!canSwitchFamily) return
    FAMILY_SWITCH.pickFamily(families, currentFamilyId).then((picked) => {
      if (!picked || Number(picked.id) === Number(currentFamilyId)) return
      FAMILY_SWITCH.applyFamilySwitch(picked)
      this.setData({
        currentFamilyId: picked.id,
        currentFamilyName: picked.name,
      })
      DIALOG.showToast(`已切换到「${picked.name}」`, { icon: 'none' })
    })
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
      await DIALOG.showAlert('请输入家庭名称')
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
      await DIALOG.showError(err, '创建失败')
    }
  },

  goJoin() {
    wx.navigateTo({ url: '/pages/family/join' })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    FAMILY_SWITCH.applyFamilySwitch({ id, name: '' })
    const family = this.data.families.find((f) => Number(f.id) === Number(id))
    if (family) {
      this.setData({
        currentFamilyId: family.id,
        currentFamilyName: family.name,
      })
    }
    wx.navigateTo({ url: `/pages/family/detail?id=${id}` })
  },
})
