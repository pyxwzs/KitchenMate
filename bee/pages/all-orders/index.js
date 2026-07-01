const FAMILY = require('../../utils/family')
const FAMILY_SWITCH = require('../../utils/familySwitch')
const MENU = require('../../utils/menu')
const ORDER = require('../../utils/order')
const ORDER_WS = require('../../utils/orderWs')
const PARTY = require('../../utils/party')
const DIALOG = require('../../utils/dialog')
const DISH_IMAGE = require('../../utils/dishImageCache')

Page({
  data: {
    loading: true,
    families: [],
    currentFamilyId: null,
    currentFamilyName: '',
    cookName: '',
    menuSubtitle: '',
    submitting: false,
    canCompleteMeal: false,
    wsConnected: false,
    summary: {
      session_id: null,
      total_dishes: 0,
      dish_totals: [],
      by_user: [],
      session: null,
    },
    inPartyMode: false,
    partyName: '',
    joinCode: '',
    isPartyGuest: false,
    canSwitchFamily: false,
  },

  onShow() {
    getApp().ensureLogin().then(() => {
      this.bootstrap()
    }).catch(() => {
      this.setData({ loading: false })
    })
  },

  onHide() {
    ORDER_WS.disconnect()
  },

  onUnload() {
    ORDER_WS.disconnect()
  },

  connectWs(familyId) {
    ORDER_WS.disconnect()
    ORDER_WS.connect(
      familyId,
      (msg) => {
        if (msg.type === 'orders_updated') {
          this.loadSummary(true)
        }
      },
      (connected) => {
        this.setData({ wsConnected: connected })
      }
    )
  },

  async bootstrap() {
    this.setData({ loading: true })
    try {
      const families = await FAMILY.listFamilies()
      const ctx = await PARTY.resolveOrderContext(families)

      if (!ctx.currentFamilyId) {
        ORDER_WS.disconnect()
        this.setData({ loading: false, families: ctx.families, currentFamilyId: null, inPartyMode: false })
        return
      }

      this.setData({
        families: ctx.families,
        currentFamilyId: ctx.currentFamilyId,
        currentFamilyName: ctx.currentFamilyName,
        inPartyMode: ctx.inPartyMode,
        partyName: ctx.partyName,
        joinCode: ctx.joinCode,
        isPartyGuest: ctx.isPartyGuest,
        canSwitchFamily: ctx.canSwitchFamily,
      })
      this.connectWs(ctx.currentFamilyId)
      await Promise.all([this.loadCookInfo(), this.loadSummary(false)])
    } catch (err) {
      this.setData({ loading: false })
      await DIALOG.showError(err, '加载失败')
    }
  },

  async loadCookInfo() {
    const { currentFamilyId } = this.data
    try {
      const menuRaw = await MENU.getFamilyMenu(currentFamilyId)
      const menu = await MENU.formatFamilyMenuAsync(menuRaw)
      DISH_IMAGE.registerDishes(menu.dishes)
      const menuMembers = menu.menu_members || menu.cooks || []
      this.setData({
        menuSubtitle: MENU.buildMenuSubtitle(menuMembers, menu.is_party_menu),
      })
    } catch (e) {
      // ignore
    }
  },

  async loadSummary(silent) {
    const { currentFamilyId } = this.data
    try {
      const raw = await ORDER.getOrderSummary(currentFamilyId)
      const summary = await ORDER.resolveSummaryImages(raw)
      this.setData({
        summary,
        canCompleteMeal: !!summary.can_complete_meal,
        loading: false,
      })
    } catch (err) {
      if (!silent) {
        this.setData({ loading: false })
        await DIALOG.showError(err, '加载失败')
      }
    }
  },

  showFamilyPicker() {
    const { families, currentFamilyId, canSwitchFamily } = this.data
    if (!canSwitchFamily) return
    FAMILY_SWITCH.pickFamily(families, currentFamilyId).then(async (picked) => {
      if (!picked || Number(picked.id) === Number(currentFamilyId)) return
      FAMILY_SWITCH.applyFamilySwitch(picked)
      this.setData({
        loading: true,
        currentFamilyId: picked.id,
        currentFamilyName: picked.name,
        inPartyMode: false,
        partyName: '',
        joinCode: '',
        isPartyGuest: false,
      })
      this.connectWs(picked.id)
      await Promise.all([this.loadCookInfo(), this.loadSummary(false)])
    })
  },

  async confirmMealComplete() {
    const { currentFamilyId, summary, submitting } = this.data
    if (submitting || !summary.total_dishes) {
      return
    }

    const confirmed = await DIALOG.showConfirm({
      title: '确认出餐',
      content: '确认后本轮点餐结束并清空本桌，大家仍可继续加菜开始新一轮',
      confirmText: '确认',
    })
    if (!confirmed) return

    this.setData({ submitting: true })
    wx.showLoading({ title: '确认中...', mask: true })
    try {
      await ORDER.clearSession(currentFamilyId)
      DIALOG.showToast('本轮已结束', { icon: 'success' })
      await this.loadSummary(true)
    } catch (err) {
      await DIALOG.showError(err, '确认失败')
    } finally {
      wx.hideLoading()
      this.setData({ submitting: false })
    }
  },

  goParty() {
    wx.navigateTo({ url: '/pages/party/index' })
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/index' })
  },

  goOrder() {
    wx.switchTab({ url: '/pages/index/index' })
  },
})
