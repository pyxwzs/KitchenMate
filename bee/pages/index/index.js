const FAMILY = require('../../utils/family')
const MENU = require('../../utils/menu')
const CART = require('../../utils/cart')
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
    cookUserId: null,
    isCook: false,
    dishes: [],
    menuEmpty: false,
    cartItems: [],
    cartCount: 0,
    cartShow: false,
    submitting: false,
    addSheetShow: false,
    addSheetDish: null,
    addSheetQty: 1,
    addSheetNote: '',
    noteEditShow: false,
    noteEditDishId: null,
    noteEditValue: '',
    tableTotal: 0,
    tableDishes: [],
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
          this.loadTableSummary(true)
        }
      },
      () => {}
    )
  },

  async bootstrap() {
    this.setData({ loading: true })
    try {
      const families = await FAMILY.listFamilies()
      const ctx = await PARTY.resolveOrderContext(families)

      if (!ctx.currentFamilyId) {
        ORDER_WS.disconnect()
        this.setData({
          loading: false,
          families: ctx.families,
          currentFamilyId: null,
          inPartyMode: false,
        })
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
      await Promise.all([this.loadMenu(), this.loadTableSummary(false)])
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  async loadTableSummary(silent) {
    const { currentFamilyId } = this.data
    if (!currentFamilyId) return
    try {
      const raw = await ORDER.getOrderSummary(currentFamilyId)
      const summary = await ORDER.resolveSummaryImages(raw)
      this.setData({
        tableTotal: summary.total_dishes || 0,
        tableDishes: summary.dish_totals || [],
      })
    } catch (err) {
      if (!silent) {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' })
      }
    }
  },

  syncCartToDishes(dishes) {
    const { currentFamilyId } = this.data
    const cartItems = CART.getCart(currentFamilyId)
    const cartMap = {}
    cartItems.forEach(i => { cartMap[i.dishId] = i.quantity })
    return dishes.map(d => ({
      ...d,
      cartQty: cartMap[d.id] || 0,
    }))
  },

  refreshCart() {
    const { currentFamilyId, dishes } = this.data
    const cartItems = CART.getCart(currentFamilyId)
    this.setData({
      cartItems,
      cartCount: CART.getTotalCount(cartItems),
      dishes: this.syncCartToDishes(dishes),
    })
  },

  async loadMenu() {
    const { currentFamilyId } = this.data
    const myUserId = wx.getStorageSync('uid')
    try {
      const raw = await MENU.getFamilyMenu(currentFamilyId)
      const menu = await MENU.formatFamilyMenuAsync(raw)
      const cook = menu.cook || {}
      let dishes = menu.dishes || []
      dishes = this.syncCartToDishes(dishes)
      const cartItems = CART.getCart(currentFamilyId)
      this.setData({
        cookName: cook.display_name || '',
        cookUserId: cook.id,
        isCook: cook.id === myUserId,
        dishes,
        menuEmpty: dishes.length === 0,
        cartItems,
        cartCount: CART.getTotalCount(cartItems),
        loading: false,
      })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: err.message || '菜单加载失败', icon: 'none' })
    }
  },

  openAddSheet(e) {
    const dish = e.currentTarget.dataset.dish
    this.setData({
      addSheetShow: true,
      addSheetDish: dish,
      addSheetQty: 1,
      addSheetNote: '',
    })
  },

  closeAddSheet() {
    this.setData({ addSheetShow: false, addSheetDish: null })
  },

  sheetMinus() {
    const q = this.data.addSheetQty
    if (q > 1) this.setData({ addSheetQty: q - 1 })
  },

  sheetPlus() {
    const q = this.data.addSheetQty
    if (q < 99) this.setData({ addSheetQty: q + 1 })
  },

  onAddSheetNoteInput(e) {
    this.setData({ addSheetNote: e.detail.value })
  },

  confirmAddSheet() {
    const { addSheetDish, addSheetQty, addSheetNote, currentFamilyId } = this.data
    if (!addSheetDish) return
    CART.addItem(currentFamilyId, addSheetDish, addSheetQty)
    if (addSheetNote.trim()) {
      CART.updateNote(currentFamilyId, addSheetDish.id, addSheetNote.trim())
    }
    this.refreshCart()
    wx.vibrateShort({ type: 'light' })
    this.setData({ addSheetShow: false, addSheetDish: null })
  },

  // 购物车内编辑备注
  openNoteEdit(e) {
    const { id, note } = e.currentTarget.dataset
    this.setData({ noteEditShow: true, noteEditDishId: id, noteEditValue: note || '' })
  },

  closeNoteEdit() {
    this.setData({ noteEditShow: false })
  },

  onNoteInput(e) {
    this.setData({ noteEditValue: e.detail.value })
  },

  confirmNoteEdit() {
    const { noteEditDishId, noteEditValue, currentFamilyId } = this.data
    CART.updateNote(currentFamilyId, noteEditDishId, noteEditValue)
    this.refreshCart()
    this.setData({ noteEditShow: false })
  },

  minusDish(e) {
    const dishId = e.currentTarget.dataset.id
    const { currentFamilyId, dishes } = this.data
    const dish = dishes.find(d => d.id === dishId)
    if (!dish) return
    CART.updateQuantity(currentFamilyId, dishId, (dish.cartQty || 0) - 1)
    this.refreshCart()
  },

  plusCartItem(e) {
    const dishId = e.currentTarget.dataset.id
    const { currentFamilyId, cartItems } = this.data
    const item = cartItems.find(i => i.dishId === dishId)
    if (!item) return
    CART.updateQuantity(currentFamilyId, dishId, item.quantity + 1)
    this.refreshCart()
  },

  minusCartItem(e) {
    const dishId = e.currentTarget.dataset.id
    const { currentFamilyId, cartItems } = this.data
    const item = cartItems.find(i => i.dishId === dishId)
    if (!item) return
    CART.updateQuantity(currentFamilyId, dishId, item.quantity - 1)
    this.refreshCart()
  },

  openCart() {
    this.setData({ cartShow: true })
  },

  closeCart() {
    this.setData({ cartShow: false })
  },

  clearCart() {
    const { currentFamilyId } = this.data
    CART.clearCart(currentFamilyId)
    this.refreshCart()
  },

  async submitOrder() {
    const { currentFamilyId, submitting } = this.data
    if (submitting) {
      return
    }

    const cartItems = CART.getCart(currentFamilyId)
    if (!cartItems.length) {
      wx.showToast({ title: '请先选择菜品', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '加菜中...', mask: true })

    try {
      await ORDER.addToSession(currentFamilyId, CART.toOrderPayload(cartItems))
      CART.clearCart(currentFamilyId)
      this.setData({ cartShow: false })
      this.refreshCart()
      await this.loadTableSummary(true)
      wx.showToast({ title: '已加到本桌', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '加菜失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ submitting: false })
    }
  },

  goTableOrders() {
    wx.switchTab({ url: '/pages/all-orders/index' })
  },

  goParty() {
    wx.navigateTo({ url: '/pages/party/index' })
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
        await Promise.all([this.loadMenu(), this.loadTableSummary(false)])
      },
    })
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/index' })
  },

  onImgError() {},

  goMyDishes() {
    wx.navigateTo({ url: '/pages/my/dishes' })
  },
})
