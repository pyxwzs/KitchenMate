const CONFIG = require('../config.js')
const API = require('./api')
const i18n = require('../i18n/index')
const { getErrorMessage, isNetworkError } = require('./error')
const DIALOG = require('./dialog')
const $t = i18n.$t()

async function checkSession() {
  return new Promise((resolve) => {
    wx.checkSession({
      success() {
        resolve(true)
      },
      fail() {
        resolve(false)
      },
    })
  })
}

async function bindSeller() {
  // KitchenMate 不使用分销推荐人逻辑
}

function isDevUser(user) {
  return !!(user && user.openid && String(user.openid).startsWith('dev-user'))
}

async function checkHasLogined() {
  const token = wx.getStorageSync('token')
  if (!token) {
    return false
  }

  try {
    const user = await API.getMe()
    if (!CONFIG.useDevLogin && (isDevUser(user) || wx.getStorageSync('loginType') === 'dev')) {
      loginOut()
      return false
    }
    if (!CONFIG.useDevLogin) {
      wx.setStorageSync('loginType', 'wechat')
    }
    return true
  } catch (e) {
    if (isNetworkError(e)) {
      return true
    }
    loginOut()
    return false
  }
}

async function wxaCode() {
  return new Promise((resolve) => {
    wx.login({
      success(res) {
        resolve(res.code)
      },
      fail() {
        DIALOG.showToast($t.common.getCodeError, { icon: 'none' })
        resolve($t.common.getCodeError)
      },
    })
  })
}

async function loginWithKitchenMate(page) {
  try {
    await authorize()
    if (page) {
      page.onShow()
    }
  } catch (err) {
    await DIALOG.showAlert(getErrorMessage(err, '登录失败'), $t.common.loginFail)
  }
}

async function login(page) {
  return loginWithKitchenMate(page)
}

async function authorize() {
  if (CONFIG.useDevLogin) {
    return API.devLogin()
  }

  const sessionValid = await checkSession()
  if (!sessionValid) {
    wx.removeStorageSync('token')
    wx.removeStorageSync('uid')
  }

  const code = await wxaCode()
  if (!code || code === $t.common.getCodeError) {
    throw new Error($t.common.getCodeError)
  }
  return API.wechatLogin(code)
}

function loginOut() {
  wx.removeStorageSync('token')
  wx.removeStorageSync('uid')
  wx.removeStorageSync('loginType')
}

async function checkAndAuthorize(scope) {
  return new Promise((resolve, reject) => {
    wx.getSetting({
      success(res) {
        if (!res.authSetting[scope]) {
          wx.authorize({
            scope: scope,
            success() {
              resolve()
            },
            fail(e) {
              console.error(e)
              DIALOG.showAlert($t.common.authorizeRequired, $t.common.authorize).then(() => {
                wx.openSetting()
              })
            },
          })
        } else {
          resolve()
        }
      },
      fail(e) {
        console.error(e)
        reject(e)
      },
    })
  })
}

/**
 * 仅静默登录（wx.login + 换 token），不检查资料完整性。
 * 适用于扫码加入聚会的来宾场景。
 */
async function silentLogin() {
  const isLogined = await checkHasLogined()
  if (isLogined) return
  await authorize()
}

module.exports = {
  checkHasLogined,
  wxaCode,
  login,
  loginOut,
  checkAndAuthorize,
  authorize,
  bindSeller,
  silentLogin,
}
