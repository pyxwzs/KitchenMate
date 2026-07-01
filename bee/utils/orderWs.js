const CONFIG = require('../config.js')

const PING_INTERVAL = 25000
const RECONNECT_DELAY = 3000

let socketTask = null
let currentFamilyId = null
let onMessageCallback = null
let reconnectTimer = null
let pingTimer = null
let manualClose = false
let onStatusChange = null

function buildWsUrl(familyId) {
  const token = wx.getStorageSync('token')
  const base = CONFIG.apiBaseUrl.replace(/^http/, 'ws')
  return `${base}/ws/families/${familyId}/orders?token=${encodeURIComponent(token)}`
}

function setStatus(connected) {
  if (typeof onStatusChange === 'function') {
    onStatusChange(connected)
  }
}

function stopPing() {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
}

function startPing() {
  stopPing()
  pingTimer = setInterval(() => {
    if (socketTask) {
      socketTask.send({ data: 'ping' })
    }
  }, PING_INTERVAL)
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function scheduleReconnect() {
  clearReconnect()
  reconnectTimer = setTimeout(() => {
    if (!manualClose && currentFamilyId && onMessageCallback) {
      connect(currentFamilyId, onMessageCallback, onStatusChange)
    }
  }, RECONNECT_DELAY)
}

function connect(familyId, onMessage, statusChange) {
  disconnect(false)
  manualClose = false
  currentFamilyId = familyId
  onMessageCallback = onMessage
  onStatusChange = statusChange

  const url = buildWsUrl(familyId)
  socketTask = wx.connectSocket({ url })

  socketTask.onOpen(() => {
    setStatus(true)
    startPing()
  })

  socketTask.onMessage((res) => {
    let data = null
    try {
      data = JSON.parse(res.data)
    } catch (e) {
      return
    }
    if (data.type === 'pong' || data.type === 'connected') {
      return
    }
    if (onMessageCallback) {
      onMessageCallback(data)
    }
  })

  socketTask.onClose(() => {
    setStatus(false)
    stopPing()
    socketTask = null
    if (!manualClose && currentFamilyId) {
      scheduleReconnect()
    }
  })

  socketTask.onError(() => {
    setStatus(false)
  })
}

function disconnect(clearFamily = true) {
  manualClose = true
  stopPing()
  clearReconnect()
  if (socketTask) {
    socketTask.close({})
    socketTask = null
  }
  setStatus(false)
  if (clearFamily) {
    currentFamilyId = null
    onMessageCallback = null
    onStatusChange = null
  }
}

module.exports = {
  connect,
  disconnect,
}
