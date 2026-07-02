const NETWORK_MESSAGE = '网络异常'

const NETWORK_HINTS = [
  'request:fail',
  'request fail',
  'connect fail',
  'connection refused',
  'connection reset',
  'network error',
  'network is down',
  'network unavailable',
  'timeout',
  'timed out',
  'failed to connect',
  'could not connect',
  'econnrefused',
  'enotfound',
  'socket',
  'interrupted',
  'abort',
  'ssl',
  '网络',
  '超时',
  '连接失败',
  '无法连接',
  '请求失败',
  'net::',
  'offline',
]

function isNetworkError(err) {
  if (!err) {
    return false
  }
  if (err.isNetworkError) {
    return true
  }
  const statusCode = err.statusCode
  if (statusCode === 0 || statusCode === 408 || (statusCode >= 500 && statusCode < 600)) {
    return true
  }
  const text = [
    err.message,
    err.errMsg,
    err.error && err.error.errMsg,
  ].filter(Boolean).join(' ').toLowerCase()

  return NETWORK_HINTS.some((hint) => text.includes(hint))
}

function getErrorMessage(err, fallback = '操作失败') {
  if (isNetworkError(err)) {
    return NETWORK_MESSAGE
  }
  const message = err && err.message
  if (typeof message === 'string' && message.trim()) {
    return message.trim()
  }
  return fallback
}

module.exports = {
  isNetworkError,
  getErrorMessage,
}
