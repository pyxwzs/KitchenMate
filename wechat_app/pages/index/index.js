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
    myUserId: null,
    menuSubtitle: '',
    dishGroups: [],
    menuMembers: [],
    menuFilterMemberId: '',
    menuFilterLabel: '全部菜单',
    menuFilterOptions: [],
    canFilterMenu: false,
    dishes: [],
    menuEmpty: false,
    cartItems: [],
    cartCount: 0,
    cartShow: false,
    cartUpdating: false,
    addSheetShow: false,
    addSheetDish: null,
    addSheetQty: 1,
    addSheetNote: '',
    noteEditShow: false,
    noteEditItemId: null,
    noteEditValue: '',
    inPartyMode: false,
    partyName: '',
    joinCode: '',
    isPartyGuest: false,
    canSwitchFamily: false,
  },

  onLoad() {
    this.setData({ myUserId: wx.getStorageSync('uid') })
  },

  onShow() {
    getApp().ensureLogin().then(() => {
      this.setData({ myUserId: wx.getStorageSync('uid') })
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
      await DIALOG.showError(err, '加载失败')
    }
  },

  applySessionToDishes(dishes, summary) {
    const qtyMap = ORDER.getMyDishQuantities(summary, this.data.myUserId)
    return dishes.map((d) => Object.assign({}, d, {
      cartQty: qtyMap[d.id] || 0,
    }))
  },

  applySessionSummary(summary) {
    const cartItems = ORDER.flattenTableCartItems(summary, this.data.myUserId)
    const dishes = this.applySessionToDishes(this.data.dishes, summary)
    this.setData(Object.assign({
      cartItems,
      cartCount: summary.total_dishes || 0,
      dishes,
    }, this.buildMenuViewState(dishes, this.data.menuMembers, this.data.menuFilterMemberId)))
  },

  async loadTableSummary(silent) {
    const { currentFamilyId } = this.data
    if (!currentFamilyId) return
    try {
      const raw = await ORDER.getOrderSummary(currentFamilyId)
      const summary = await ORDER.resolveSummaryImages(raw)
      this.applySessionSummary(summary)
    } catch (err) {
      if (!silent) {
        await DIALOG.showError(err, '加载失败')
      }
    }
  },

  buildMenuViewState(dishes, menuMembers, menuFilterMemberId) {
    const filterId = menuFilterMemberId || ''
    const options = MENU.buildMenuFilterOptions(menuMembers)
    let activeFilterId = filterId
    if (activeFilterId && !options.some((o) => String(o.id) === String(activeFilterId))) {
      activeFilterId = ''
    }
    return {
      menuMembers,
      menuFilterMemberId: activeFilterId,
      menuFilterLabel: MENU.menuFilterLabel(menuMembers, activeFilterId),
      menuFilterOptions: options,
      canFilterMenu: options.length > 0,
      dishGroups: MENU.applyMenuFilter(dishes, menuMembers, activeFilterId),
    }
  },

  async loadMenu() {
    const { currentFamilyId } = this.data
    try {
      const raw = await MENU.getFamilyMenu(currentFamilyId)
      const menu = await MENU.formatFamilyMenuAsync(raw)
      DISH_IMAGE.registerDishes(menu.dishes)
      const menuMembers = menu.menu_members || menu.cooks || []
      let dishes = menu.dishes || []
      const rawSummary = await ORDER.getOrderSummary(currentFamilyId).catch(() => null)
      const summary = rawSummary
        ? await ORDER.resolveSummaryImages(rawSummary)
        : { total_dishes: 0, dish_totals: [], by_user: [] }
      dishes = this.applySessionToDishes(dishes, summary)
      const cartItems = ORDER.flattenTableCartItems(summary, this.data.myUserId)
      this.setData(Object.assign({
        menuSubtitle: MENU.buildMenuSubtitle(menuMembers, menu.is_party_menu),
        dishes,
        menuEmpty: dishes.length === 0,
        cartItems,
        cartCount: summary.total_dishes || 0,
        loading: false,
        menuFilterMemberId: '',
      }, this.buildMenuViewState(dishes, menuMembers, '')))
    } catch (err) {
      this.setData({ loading: false })
      await DIALOG.showError(err, '菜单加载失败')
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

  async confirmAddSheet() {
    const { addSheetDish, addSheetQty, addSheetNote, currentFamilyId, cartUpdating } = this.data
    if (!addSheetDish || cartUpdating) return
    this.setData({ cartUpdating: true })
    try {
      const note = addSheetNote.trim()
      if (note) {
        await ORDER.addToSession(currentFamilyId, [{
          dish_id: addSheetDish.id,
          quantity: addSheetQty,
          note,
        }])
      } else {
        await ORDER.adjustItem(currentFamilyId, addSheetDish.id, addSheetQty)
      }
      wx.vibrateShort({ type: 'light' })
      this.setData({ addSheetShow: false, addSheetDish: null })
      await this.loadTableSummary(true)
    } catch (err) {
      await DIALOG.showError(err, '加菜失败')
    } finally {
      this.setData({ cartUpdating: false })
    }
  },

  openNoteEdit(e) {
    const { id, note } = e.currentTarget.dataset
    this.setData({ noteEditShow: true, noteEditItemId: id, noteEditValue: note || '' })
  },

  closeNoteEdit() {
    this.setData({ noteEditShow: false })
  },

  onNoteInput(e) {
    this.setData({ noteEditValue: e.detail.value })
  },

  async confirmNoteEdit() {
    const { noteEditItemId, noteEditValue, currentFamilyId, cartUpdating } = this.data
    if (!noteEditItemId || cartUpdating) return
    this.setData({ cartUpdating: true })
    try {
      await ORDER.updateOrderItem(currentFamilyId, noteEditItemId, {
        note: noteEditValue,
      })
      this.setData({ noteEditShow: false })
      await this.loadTableSummary(true)
    } catch (err) {
      await DIALOG.showError(err, '保存失败')
    } finally {
      this.setData({ cartUpdating: false })
    }
  },

  async minusDish(e) {
    const dishId = e.currentTarget.dataset.id
    const { currentFamilyId, cartUpdating } = this.data
    if (cartUpdating) return
    this.setData({ cartUpdating: true })
    try {
      await ORDER.adjustItem(currentFamilyId, dishId, -1)
      await this.loadTableSummary(true)
    } catch (err) {
      await DIALOG.showError(err, '操作失败')
    } finally {
      this.setData({ cartUpdating: false })
    }
  },

  async plusCartItem(e) {
    const dishId = e.currentTarget.dataset.dishId
    const { currentFamilyId, cartUpdating } = this.data
    if (cartUpdating) return
    this.setData({ cartUpdating: true })
    try {
      await ORDER.adjustItem(currentFamilyId, dishId, 1)
      await this.loadTableSummary(true)
    } catch (err) {
      await DIALOG.showError(err, '操作失败')
    } finally {
      this.setData({ cartUpdating: false })
    }
  },

  async minusCartItem(e) {
    const itemId = e.currentTarget.dataset.id
    const dishId = e.currentTarget.dataset.dishId
    const { currentFamilyId, cartUpdating, cartItems } = this.data
    if (cartUpdating) return
    const item = cartItems.find((i) => Number(i.id) === Number(itemId))
    if (!item || !item.isMine) return
    this.setData({ cartUpdating: true })
    try {
      if (item.quantity <= 1) {
        await ORDER.updateOrderItem(currentFamilyId, itemId, { quantity: 0 })
      } else {
        await ORDER.updateOrderItem(currentFamilyId, itemId, {
          quantity: item.quantity - 1,
        })
      }
      await this.loadTableSummary(true)
    } catch (err) {
      await DIALOG.showError(err, '操作失败')
    } finally {
      this.setData({ cartUpdating: false })
    }
  },

  openCart() {
    this.setData({ cartShow: true })
  },

  closeCart() {
    this.setData({ cartShow: false })
  },

  goParty() {
    wx.navigateTo({ url: '/pages/party/index' })
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
        menuFilterMemberId: '',
      })
      this.connectWs(picked.id)
      await Promise.all([this.loadMenu(), this.loadTableSummary(false)])
    })
  },

  showMenuFilterPicker() {
    const { menuFilterOptions, menuFilterMemberId } = this.data
    if (!menuFilterOptions.length) return
    wx.showActionSheet({
      itemList: menuFilterOptions.map((o) => {
        const mark = String(o.id) === String(menuFilterMemberId) ? ' ✓' : ''
        return `${o.label}${mark}`
      }),
      success: (res) => {
        const picked = menuFilterOptions[res.tapIndex]
        if (!picked) return
        this.setMenuFilter(picked.id)
      },
    })
  },

  onMenuFilterTap(e) {
    const { id } = e.currentTarget.dataset
    this.setMenuFilter(id)
  },

  setMenuFilter(memberId) {
    const { dishes, menuMembers, menuFilterMemberId } = this.data
    if (String(memberId) === String(menuFilterMemberId)) return
    this.setData(this.buildMenuViewState(dishes, menuMembers, memberId))
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/index' })
  },


  goMyDishes() {
    wx.navigateTo({ url: '/pages/my/dishes' })
  },
})
