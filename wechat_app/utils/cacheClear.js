const MENU = require('./menu')
const ORDER_WS = require('./orderWs')
const { clearAllAssetCache } = require('./asset')
const DISH_IMAGE = require('./dishImageCache')

/** 清除全部本地数据：登录态、家庭/聚会选择、菜单与图片缓存等 */
function clearAllLocalData() {
  MENU.invalidateAllMenus()
  DISH_IMAGE.resetAll()
  clearAllAssetCache()
  ORDER_WS.disconnect()

  try {
    wx.clearStorageSync()
  } catch (e) {
    // ignore
  }

  const app = getApp()
  if (app) {
    app.globalData.apiUserInfoMap = null
    app._loginPromise = null
  }
}

module.exports = {
  clearAllLocalData,
}
