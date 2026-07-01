const FAMILY = require('../../utils/family')
const AUTH = require('../../utils/auth')

Page({
  data: {
    inviteCode: '',
    loading: false,
  },

  onLoad(options) {
    if (options.scene) {
      const raw = decodeURIComponent(options.scene || '').trim().toUpperCase()
      if (/^[A-Z0-9]{4,10}$/.test(raw)) {
        this._sceneInviteCode = raw
      }
    }
  },

  onShow() {
    if (this._sceneInviteCode) {
      const code = this._sceneInviteCode
      this._sceneInviteCode = null
      this.handleScanJoin(code)
    }
  },

  async handleScanJoin(inviteCode) {
    this.setData({ loading: true, inviteCode })
    try {
      await AUTH.silentLogin()
      const family = await FAMILY.joinFamily(inviteCode)
      wx.showToast({ title: `已加入「${family.name}」`, icon: 'success', duration: 1500 })
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/family/detail?id=${family.id}` })
      }, 800)
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: err.message || '加入失败，请手动输入邀请码', icon: 'none', duration: 2500 })
    }
  },

  onInput(e) {
    this.setData({ inviteCode: e.detail.value.toUpperCase() })
  },

  async submitJoin() {
    const inviteCode = this.data.inviteCode.trim()
    if (!inviteCode) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }

    try {
      await AUTH.silentLogin()
      const family = await FAMILY.joinFamily(inviteCode)
      wx.showToast({ title: '加入成功' })
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/family/detail?id=${family.id}`,
        })
      }, 500)
    } catch (err) {
      wx.showToast({
        title: err.message || '加入失败',
        icon: 'none',
      })
    }
  },
})
