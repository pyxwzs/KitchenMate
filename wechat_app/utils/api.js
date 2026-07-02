const CONFIG = require('../config.js')
const request = require('./request')
const { getErrorMessage, isNetworkError } = require('./error')

function getAssetUrl(path) {
  if (!path) {
    return ''
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  if (path.startsWith('/uploads/')) {
    const filename = path.slice('/uploads/'.length)
    return CONFIG.apiBaseUrl + '/media/' + filename
  }
  const base = CONFIG.apiBaseUrl.replace(/\/api\/v1\/?$/, '')
  return base + path
}

function normalizeUser(user) {
  return {
    base: {
      id: user.id,
      nick: user.nickname || user.real_name || '微信用户',
      realName: user.real_name || '',
      avatarUrl: getAssetUrl(user.avatar_url),
      mobile: user.phone || '',
    },
    userLevel: {
      name: '',
    },
  }
}

function wrapLoginResponse(res) {
  wx.setStorageSync('token', res.access_token)
  wx.setStorageSync('uid', res.user.id)
  wx.setStorageSync('loginType', CONFIG.useDevLogin ? 'dev' : 'wechat')
  return {
    code: 0,
    data: {
      token: res.access_token,
      uid: res.user.id,
      user: res.user,
    },
  }
}

function wechatLogin(code) {
  return request({
    url: '/auth/wechat-login',
    method: 'POST',
    data: { code },
    auth: false,
  }).then(wrapLoginResponse)
}

function devLogin(openid) {
  return request({
    url: '/auth/dev-login',
    method: 'POST',
    data: { openid: openid || 'dev-user-001' },
    auth: false,
  }).then(wrapLoginResponse)
}

function getMe() {
  return request({
    url: '/auth/me',
    method: 'GET',
  })
}

function updateProfile(data) {
  return request({
    url: '/auth/me',
    method: 'PATCH',
    data,
  })
}

function uploadAvatar(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: CONFIG.apiBaseUrl + '/auth/me/avatar',
      filePath,
      name: 'file',
      header: {
        Authorization: 'Bearer ' + wx.getStorageSync('token'),
      },
      success(res) {
        let data = {}
        try {
          data = JSON.parse(res.data)
        } catch (e) {
          reject({ message: '上传失败' })
          return
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data)
          return
        }
        const detail = data.detail
        const message = typeof detail === 'object' ? detail.message : (detail || '上传失败')
        const err = { statusCode: res.statusCode, message }
        if (isNetworkError(err)) {
          err.isNetworkError = true
          err.message = getErrorMessage(err, '上传失败')
        }
        reject(err)
      },
      fail(err) {
        reject({
          isNetworkError: true,
          message: getErrorMessage(err, '上传失败'),
          error: err,
        })
      },
    })
  })
}

function isProfileComplete(user) {
  return !!(user && user.nickname && user.real_name && user.avatar_url)
}

function healthCheck() {
  return request({
    url: '/health',
    method: 'GET',
    auth: false,
  })
}

module.exports = {
  getAssetUrl,
  normalizeUser,
  wechatLogin,
  devLogin,
  getMe,
  updateProfile,
  uploadAvatar,
  healthCheck,
  isProfileComplete,
}
