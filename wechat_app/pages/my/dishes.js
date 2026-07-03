const MENU = require('../../utils/menu')
const DIALOG = require('../../utils/dialog')

Page({
  data: {
    loading: true,
    dishes: [],
    dishDialogShow: false,
    dishEditId: null,
    dishName: '',
    dishDesc: '',
    dishImagePreview: '',
    dishImageTempPath: '',
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '我会做的菜' })
    this.loadMenu()
  },

  onShow() {
    if (this._ready) {
      this.loadMenu({ silent: true })
      this.loadMenu({ silent: true, force: true }).catch(() => {})
      return
    }
    this.loadMenu()
  },

  async loadMenu(options = {}) {
    const { silent = false, force = false, refreshDishIds = [] } = options
    if (!silent) {
      this.setData({ loading: true })
    }
    try {
      const raw = await MENU.getMyMenu({ force })
      const menu = await MENU.formatMyMenuAsync(raw, { refreshDishIds })
      this.setData({
        dishes: menu.dishes || [],
        loading: false,
      })
      this._ready = true
    } catch (err) {
      this.setData({ loading: false })
      if (!silent) {
        await DIALOG.showError(err, '加载失败')
      }
    }
  },

  showDishDialog() {
    this.setData({
      dishDialogShow: true,
      dishEditId: null,
      dishName: '',
      dishDesc: '',
      dishImagePreview: '',
      dishImageTempPath: '',
    })
  },

  editDish(e) {
    const dish = e.currentTarget.dataset.dish
    this.setData({
      dishDialogShow: true,
      dishEditId: dish.id,
      dishName: dish.name,
      dishDesc: dish.description || '',
      dishImagePreview: dish.imageUrl || '',
      dishImageTempPath: '',
    })
  },

  closeDishDialog() {
    this.setData({ dishDialogShow: false })
  },

  chooseDishImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles[0]
        this.setData({
          dishImagePreview: file.tempFilePath,
          dishImageTempPath: file.tempFilePath,
        })
      },
    })
  },

  onDishNameInput(e) {
    this.setData({ dishName: e.detail.value })
  },

  onDishDescInput(e) {
    this.setData({ dishDesc: e.detail.value })
  },

  async confirmDish() {
    const { dishEditId, dishName, dishDesc, dishImageTempPath } = this.data
    const name = dishName.trim()
    if (!name) {
      DIALOG.showToast('请输入菜名', { icon: 'none' })
      return
    }
    const payload = {
      name,
      description: dishDesc.trim() || null,
      is_active: true,
    }
    try {
      DIALOG.showLoading('保存中...')
      let dish
      if (dishEditId) {
        dish = await MENU.updateDish(dishEditId, payload)
      } else {
        dish = await MENU.createDish(payload)
      }
      let refreshDishIds = []
      if (dishImageTempPath) {
        const uploaded = await MENU.uploadDishImage(dish.id, dishImageTempPath)
        if (uploaded && uploaded.id) {
          refreshDishIds = [uploaded.id]
        }
      }
      DIALOG.hideLoading()
      this.setData({ dishDialogShow: false })
      DIALOG.showToast('已保存', { icon: 'success' })
      MENU.invalidateAllMenus()
      this.loadMenu({ force: true, refreshDishIds })
    } catch (err) {
      DIALOG.hideLoading()
      await DIALOG.showError(err, '保存失败')
    }
  },

  async toggleDishActive(e) {
    const dish = e.currentTarget.dataset.dish
    const isActive = e.detail.value
    try {
      await MENU.updateDish(dish.id, { is_active: isActive })
      MENU.invalidateAllMenus()
      this.loadMenu({ force: true })
    } catch (err) {
      await DIALOG.showError(err, '更新失败')
      this.loadMenu({ force: true })
    }
  },

  async deleteDish(e) {
    const dishId = e.currentTarget.dataset.id
    const confirmed = await DIALOG.showConfirm({
      title: '删除菜品',
      content: '确认删除该菜品？',
      confirmText: '删除',
    })
    if (!confirmed) return
    try {
      await MENU.deleteDish(dishId)
      DIALOG.showToast('已删除', { icon: 'success' })
      MENU.invalidateAllMenus()
      this.loadMenu({ force: true })
    } catch (err) {
      await DIALOG.showError(err, '删除失败')
    }
  },
})
