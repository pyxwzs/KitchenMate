const FAMILY = require('../../utils/family')
const PARTY = require('../../utils/party')
const AUTH = require('../../utils/auth')

Page({
  data: {
    loading: true,
    party: null,
    families: [],
    adminFamilies: [],
    mode: 'hub',
    joinCode: '',
    createName: '',
    createFamilyId: null,
    createFamilyName: '',
    createDialogShow: false,
    joining: false,
    creating: false,
    closing: false,
    qrPopupShow: false,
    qrImagePath: '',
    qrIsOfficial: false,
  },

  onLoad(options) {
    if (options.familyId) {
      this._presetFamilyId = Number(options.familyId)
    }
    // 小程序码扫码跳转时携带 scene 参数（聚会码）
    if (options.scene) {
      const raw = decodeURIComponent(options.scene || '').trim().toUpperCase()
      if (/^[A-Z0-9]{4,10}$/.test(raw)) {
        this._sceneJoinCode = raw
      }
    }
  },

  onShow() {
    if (this._sceneJoinCode) {
      const code = this._sceneJoinCode
      this._sceneJoinCode = null
      this.handlePartyScan(code)
      return
    }
    getApp().ensureLogin().then(() => this.bootstrap()).catch(() => {
      this.setData({ loading: false })
    })
  },

  /**
   * 扫码进入聚会：静默登录（无需填资料）→ 自动加入 → 直达点餐页
   */
  async handlePartyScan(joinCode) {
    this.setData({ loading: true })
    try {
      await AUTH.silentLogin()
      const party = await PARTY.joinParty(joinCode)
      PARTY.setPartyContext(party)
      wx.showToast({ title: `已加入「${party.name}」`, icon: 'success', duration: 1500 })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' })
      }, 800)
    } catch (err) {
      this.setData({ loading: false, joinCode, mode: 'hub' })
      wx.showToast({ title: err.message || '加入失败，请手动输入聚会码', icon: 'none', duration: 2500 })
    }
  },

  async bootstrap() {
    this.setData({ loading: true })
    try {
      const [party, families] = await Promise.all([
        PARTY.getMyParty().catch(() => null),
        FAMILY.listFamilies(),
      ])
      const adminFamilies = families.filter((f) => f.my_role === 'admin')
      if (party && party.status === 'active') {
        PARTY.setPartyContext(party)
        this.setData({ party, families, adminFamilies, mode: 'manage', loading: false })
      } else {
        PARTY.clearPartyContext()
        const updates = { party: null, families, adminFamilies, mode: 'hub', loading: false }
        if (this._presetFamilyId && adminFamilies.some((f) => f.id === this._presetFamilyId)) {
          const picked = adminFamilies.find((f) => f.id === this._presetFamilyId)
          updates.createFamilyId = picked.id
          updates.createFamilyName = picked.name
          updates.createDialogShow = true
          this._presetFamilyId = null
        }
        this.setData(updates)
      }
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  onJoinCodeInput(e) {
    this.setData({ joinCode: (e.detail.value || '').toUpperCase() })
  },

  async joinParty() {
    const { joinCode, joining } = this.data
    if (joining) return
    if (!joinCode.trim()) {
      wx.showToast({ title: '请输入聚会码', icon: 'none' })
      return
    }
    this.setData({ joining: true })
    try {
      const party = await PARTY.joinParty(joinCode.trim())
      PARTY.setPartyContext(party)
      wx.showToast({ title: '已加入聚会', icon: 'success' })
      this.setData({ party, mode: 'manage', joining: false })
    } catch (err) {
      this.setData({ joining: false })
      wx.showToast({ title: err.message || '加入失败', icon: 'none' })
    }
  },

  scanToJoin() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const raw = (res.result || '').trim()
        // 支持纯聚会码或 kitchenmate://party/XXXX 格式
        const match = raw.match(/(?:kitchenmate:\/\/party\/|kitchenmate:\/\/family\/)?([A-Z0-9]{4,10})$/i)
        if (!match) {
          wx.showToast({ title: '无法识别该二维码', icon: 'none' })
          return
        }
        const code = match[1].toUpperCase()
        this.setData({ joinCode: code })
        this.joinParty()
      },
      fail: () => {},
    })
  },

  showCreateDialog() {
    const { adminFamilies } = this.data
    if (!adminFamilies.length) {
      wx.showToast({ title: '需要管理员身份才能发起', icon: 'none' })
      return
    }
    this.setData({
      createDialogShow: true,
      createName: '',
      createFamilyId: adminFamilies[0].id,
      createFamilyName: adminFamilies[0].name,
    })
  },

  onCreateClose() {
    this.setData({ createDialogShow: false })
  },

  onCreateNameInput(e) {
    this.setData({ createName: e.detail.value })
  },

  pickCreateFamily() {
    const { adminFamilies } = this.data
    wx.showActionSheet({
      itemList: adminFamilies.map((f) => f.name),
      success: (res) => {
        const picked = adminFamilies[res.tapIndex]
        this.setData({ createFamilyId: picked.id, createFamilyName: picked.name })
      },
    })
  },

  async confirmCreate() {
    const { createName, createFamilyId, creating, adminFamilies } = this.data
    if (creating) return
    if (!createName.trim()) {
      wx.showToast({ title: '请输入聚会名称', icon: 'none' })
      return
    }
    this.setData({ creating: true })
    try {
      const party = await PARTY.startParty(createFamilyId, createName.trim())
      PARTY.setPartyContext(party)
      this.setData({
        party,
        mode: 'manage',
        createDialogShow: false,
        creating: false,
      })
      wx.showToast({ title: '聚会已开启', icon: 'success' })
    } catch (err) {
      this.setData({ creating: false })
      wx.showToast({ title: err.message || '创建失败', icon: 'none' })
    }
  },

  async showQrCode() {
    const { party } = this.data
    if (!party) return
    this.setData({ qrPopupShow: true, qrImagePath: '', qrIsOfficial: false })

    // 从后端获取官方小程序码（配置了 WECHAT_APP_ID/SECRET 时可用）
    try {
      const path = await PARTY.downloadPartyWxacode(party.id)
      this.setData({ qrImagePath: path, qrIsOfficial: true })
    } catch (_) {
      // 未配置微信凭证（开发环境）：弹窗仅展示聚会码文字，无图片
      this.setData({ qrImagePath: '' })
    }
  },

  hideQrCode() {
    this.setData({ qrPopupShow: false })
  },

  saveQrCode() {
    const { qrImagePath } = this.data
    if (!qrImagePath) return
    wx.saveImageToPhotosAlbum({
      filePath: qrImagePath,
      success: () => wx.showToast({ title: '已保存到相册' }),
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('auth')) {
          wx.showToast({ title: '请先授权访问相册', icon: 'none' })
        }
      },
    })
  },

  copyJoinCode() {
    const { party } = this.data
    if (!party) return
    wx.setClipboardData({
      data: party.join_code,
      success: () => wx.showToast({ title: '聚会码已复制' }),
    })
  },

  copyShareText() {
    const { party } = this.data
    if (!party) return
    wx.setClipboardData({
      data: party.share_text,
      success: () => wx.showToast({ title: '文案已复制' }),
    })
  },

  closeParty() {
    const { party, closing } = this.data
    if (!party || closing) return
    wx.showModal({
      title: '结束聚会',
      content: '结束后来宾不能再点餐，当前订单会一并提交',
      confirmText: '结束',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ closing: true })
        try {
          await PARTY.closeParty(party.id)
          PARTY.clearPartyContext()
          wx.showToast({ title: '聚会已结束', icon: 'success' })
          this.setData({ party: null, mode: 'hub', closing: false })
        } catch (err) {
          this.setData({ closing: false })
          wx.showToast({ title: err.message || '操作失败', icon: 'none' })
        }
      },
    })
  },

  goOrder() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goOrders() {
    wx.switchTab({ url: '/pages/all-orders/index' })
  },
})
