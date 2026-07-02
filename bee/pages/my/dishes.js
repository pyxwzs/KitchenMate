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
    this.loadMenu()
  },

  async loadMenu() {
    this.setData({ loading: true })
    try {
      const raw = await MENU.getMyMenu()
      const menu = await MENU.formatMyMenuAsync(raw)
      this.setData({
        dishes: menu.dishes || [],
        loading: false,
      })
    } catch (err) {
      this.setData({ loading: false })
      DIALOG.showToast(err.message || '加载失败', { icon: 'none' })
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
      if (dishImageTempPath) {
        await MENU.uploadDishImage(dish.id, dishImageTempPath)
      }
      DIALOG.hideLoading()
      this.setData({ dishDialogShow: false })
      DIALOG.showToast('已保存', { icon: 'success' })
      this.loadMenu()
    } catch (err) {
      DIALOG.hideLoading()
      DIALOG.showToast(err.message || '保存失败', { icon: 'none' })
    }
  },

  async toggleDishActive(e) {
    const dish = e.currentTarget.dataset.dish
    const isActive = e.detail.value
    try {
      await MENU.updateDish(dish.id, { is_active: isActive })
      this.loadMenu()
    } catch (err) {
      DIALOG.showToast(err.message || '更新失败', { icon: 'none' })
      this.loadMenu()
    }
  },

  onImgError(e) {
    // 图片加载失败时不做处理，占位图已在 wxml 中用 || 设置
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
      this.loadMenu()
    } catch (err) {
      DIALOG.showToast(err.message || '删除失败', { icon: 'none' })
    }
  },
})
