const PENDING_ACTION_KEY = 'pendingJoinAction'

function savePending(action) {
  wx.setStorageSync(PENDING_ACTION_KEY, action)
}

function peekPending() {
  return wx.getStorageSync(PENDING_ACTION_KEY) || null
}

function consumePending() {
  const action = peekPending()
  if (action) {
    wx.removeStorageSync(PENDING_ACTION_KEY)
  }
  return action
}

function clearPending() {
  wx.removeStorageSync(PENDING_ACTION_KEY)
}

/** 资料未完善时保存待办并跳转登录页，完善后再继续 */
async function ensureProfileReady(options) {
  options = options || {}
  const pending = options.pending
  const API = require('./api')
  const AUTH = require('./auth')
  await AUTH.silentLogin()
  const user = await API.getMe()
  if (API.isProfileComplete(user)) {
    return { ok: true, user }
  }
  if (pending) {
    savePending(pending)
  }
  wx.navigateTo({ url: '/pages/login/index?needProfile=1' })
  return { ok: false, user }
}

function pendingActionLabel(action) {
  if (!action) return ''
  if (action.type === 'family_join') return '加入家庭'
  if (action.type === 'party_join') return '加入聚会'
  return '继续操作'
}

module.exports = {
  savePending,
  peekPending,
  consumePending,
  clearPending,
  ensureProfileReady,
  pendingActionLabel,
}
