const FAMILY = require('../../utils/family')
const MENU = require('../../utils/menu')
const ORDER = require('../../utils/order')
const ORDER_WS = require('../../utils/orderWs')
const PARTY = require('../../utils/party')

Page({
  data: {
    loading: true,
    families: [],
    currentFamilyId: null,
    currentFamilyName: '',
    cookName: '',
    isCook: false,
    submitting: false,
    wsConnected: false,
    activeTab: 'active',
    historyOrders: [],
    historyLoading: false,
    summary: {
      session_id: null,
      total_dishes: 0,
      dish_totals: [],
      by_user: [],
      session: null,
    },
    statusClass: ORDER.STATUS_CLASS,
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
          if (this.data.activeTab === 'active') {
            this.loadSummary(true)
          } else {
            this.loadHistory(true)
          }
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
      await this.loadCookInfo()
      if (this.data.activeTab === 'history') {
        await this.loadHistory(false)
      } else {
        await this.loadSummary(false)
      }
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  async loadCookInfo() {
    const { currentFamilyId } = this.data
    const myUserId = wx.getStorageSync('uid')
    try {
      const menuRaw = await MENU.getFamilyMenu(currentFamilyId)
      this.setData({
        cookName: (menuRaw.cook && menuRaw.cook.display_name) || '',
        isCook: menuRaw.cook && menuRaw.cook.id === myUserId,
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
        loading: false,
      })
    } catch (err) {
      if (!silent) {
        this.setData({ loading: false })
        wx.showToast({ title: err.message || '加载失败', icon: 'none' })
      }
    }
  },

  async loadHistory(silent) {
    const { currentFamilyId } = this.data
    if (!silent) {
      this.setData({ historyLoading: true, loading: false })
    }
    try {
      const raw = await ORDER.getHistoryOrders(currentFamilyId)
      const historyOrders = await ORDER.resolveOrdersImages(raw)
      this.setData({
        historyOrders,
        historyLoading: false,
        loading: false,
      })
    } catch (err) {
      this.setData({ historyLoading: false, loading: false })
      if (!silent) {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' })
      }
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) {
      return
    }
    this.setData({ activeTab: tab })
    if (tab === 'history') {
      this.loadHistory(false)
    } else {
      this.loadSummary(false)
    }
  },

  showFamilyPicker() {
    const { families, currentFamilyId, canSwitchFamily } = this.data
    if (!canSwitchFamily || families.length <= 1) return
    wx.showActionSheet({
      itemList: families.map(f => f.name),
      success: async (res) => {
        const picked = families[res.tapIndex]
        if (picked.id === currentFamilyId) return
        MENU.setCurrentFamilyId(picked.id)
        this.setData({ loading: true })
        const ctx = await PARTY.resolveOrderContext(families)
        this.setData({
          currentFamilyId: ctx.currentFamilyId,
          currentFamilyName: ctx.currentFamilyName,
          inPartyMode: ctx.inPartyMode,
          partyName: ctx.partyName,
          joinCode: ctx.joinCode,
          isPartyGuest: ctx.isPartyGuest,
          canSwitchFamily: ctx.canSwitchFamily,
        })
        this.connectWs(ctx.currentFamilyId)
        await this.loadCookInfo()
        if (this.data.activeTab === 'history') {
          await this.loadHistory(false)
        } else {
          await this.loadSummary(false)
        }
      },
    })
  },

  submitTableOrder() {
    const { currentFamilyId, summary, submitting } = this.data
    if (submitting || !summary.total_dishes) {
      return
    }

    wx.showModal({
      title: '提交订单',
      content: '提交后本桌点餐结束，掌勺开始做菜，其他人不能再加菜',
      confirmText: '提交',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ submitting: true })
        wx.showLoading({ title: '提交中...', mask: true })
        try {
          await ORDER.lockSession(currentFamilyId)
          wx.showToast({ title: '订单已提交', icon: 'success' })
          await this.loadSummary(true)
        } catch (err) {
          wx.showToast({ title: err.message || '提交失败', icon: 'none' })
        } finally {
          wx.hideLoading()
          this.setData({ submitting: false })
        }
      },
    })
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

  openHistoryDetail(e) {
    const orderId = e.currentTarget.dataset.id
    const order = this.data.historyOrders.find((o) => o.id === orderId)
    if (!order) {
      return
    }
    wx.setStorageSync('_history_order_detail', order)
    wx.navigateTo({
      url: `/pages/order-history-detail/index?id=${orderId}`,
    })
  },
})
