const CONFIG = require('../config.js')
const AUTH = require('./auth')
const { getErrorMessage, isNetworkError } = require('./error')

let _redirectingToLogin = false

function redirectToLogin() {
  if (_redirectingToLogin) {
    return
  }
  const pages = getCurrentPages()
  const currentRoute = pages.length ? pages[pages.length - 1].route : ''
  if (currentRoute === 'pages/login/index') {
    return
  }

  _redirectingToLogin = true
  AUTH.loginOut()
  wx.reLaunch({
    url: '/pages/login/index',
    complete() {
      _redirectingToLogin = false
    },
  })
}

function request(options) {
  const {
    url,
    method = 'GET',
    data = {},
    auth = true,
  } = options

  const header = {
    'Content-Type': 'application/json',
  }

  if (auth) {
    const token = wx.getStorageSync('token')
    if (token) {
      header.Authorization = 'Bearer ' + token
    }
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: CONFIG.apiBaseUrl + url,
      method,
      data,
      header,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }

        if (res.statusCode === 401 && auth) {
          redirectToLogin()
        }

        const detail = res.data && res.data.detail
        let message = '操作失败'
        if (typeof detail === 'string') {
          message = detail
        } else if (detail && detail.message) {
          message = detail.message
        }

        const err = { statusCode: res.statusCode, message, data: res.data }
        if (res.statusCode === 401) {
          err.isUnauthorized = true
        }
        if (isNetworkError(err)) {
          err.isNetworkError = true
          err.message = getErrorMessage(err)
        }
        reject(err)
      },
      fail(err) {
        reject({
          isNetworkError: true,
          message: getErrorMessage(err),
          error: err,
        })
      },
    })
  })
}

module.exports = request
