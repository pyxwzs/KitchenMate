const Dialog = require('@vant/weapp/dialog/dialog').default
const Toast = require('@vant/weapp/toast/toast').default
const { getErrorMessage, isNetworkError } = require('./error')

const TOAST_DURATION = 2200
const NETWORK_TOAST_DURATION = 2500

Dialog.setDefaultOptions({
  width: '580rpx',
  theme: 'round-button',
  messageAlign: 'center',
  transition: 'scale',
  overlay: true,
  confirmButtonColor: '#FFFFFF',
  cancelButtonColor: '#A08B6F',
  className: 'km-dialog',
  confirmButtonText: '确定',
  cancelButtonText: '取消',
})

Toast.setDefaultOptions({
  position: 'middle',
  forbidClick: false,
  duration: TOAST_DURATION,
})

/** 将后端英文错误映射为中文（兼容旧数据） */
const MESSAGE_MAP = {
  'Only host or admin can close the party': '只有聚会发起者或家庭管理员可以结束聚会',
  'You do not have access to this family': '您没有权限访问该家庭',
  'You are not a member of this family': '您不是该家庭成员',
  'Admin permission required': '需要管理员权限',
  'This family already has an active party': '该家庭已有进行中的聚会',
  'Party is already closed': '聚会已结束',
  'Party code not found': '聚会码无效或聚会已结束',
  'Party not found': '聚会不存在',
  'Invite code not found': '邀请码无效',
  'Family not found': '家庭不存在',
  'Member not found': '成员不存在',
  'You are already a member of this family': '您已是该家庭成员',
  'No open order session to lock': '当前没有进行中的点餐',
  'Cannot lock an empty order session': '还没有点菜，无法确认出餐',
  '只有家庭管理员或聚会发起者可以确认出餐': '只有家庭管理员或聚会发起者可以确认出餐',
  'No dishes available for ordering': '暂无可点菜品',
}

function localizeMessage(message) {
  if (!message || typeof message !== 'string') return message
  const trimmed = message.trim()
  return MESSAGE_MAP[trimmed] || trimmed
}

function getActivePage() {
  const pages = getCurrentPages()
  return pages.length ? pages[pages.length - 1] : null
}

function withPageContext(options, page) {
  return {
    ...options,
    context() {
      return page
    },
  }
}

function runWithPage(action, attempt = 0) {
  const page = getActivePage()
  if (page) {
    action(page)
    return
  }
  if (attempt < 40) {
    setTimeout(() => runWithPage(action, attempt + 1), 50)
  }
}

/** 统一黑色半透明居中提示 */
function showMessage(message, options) {
  const opts = options || {}
  const text = localizeMessage(typeof message === 'string' ? message : String(message || ''))
  const isLoading = !!opts.loading
  runWithPage((page) => {
    if (!opts.keepPrevious) {
      Toast.clear()
    }
    Toast(withPageContext({
      message: text,
      type: isLoading ? 'loading' : 'text',
      duration: isLoading ? 0 : (opts.duration != null ? opts.duration : TOAST_DURATION),
      position: 'middle',
      forbidClick: isLoading || !!opts.forbidClick,
    }, page))
  })
}

function showAlert(content) {
  showMessage(content, { duration: TOAST_DURATION })
  return Promise.resolve(true)
}

function showConfirm(options) {
  const opts = typeof options === 'string'
    ? { content: options }
    : (options || {})
  const title = opts.title || '提示'
  const message = localizeMessage(opts.content || opts.message || '')
  return new Promise((resolve) => {
    runWithPage((page) => {
      Dialog.confirm(withPageContext({
        title,
        message,
        confirmButtonText: opts.confirmText || '确定',
        cancelButtonText: opts.cancelText || '取消',
      }, page)).then(() => true).catch(() => false).then(resolve)
    })
  })
}

function showError(err, fallback = '操作失败') {
  const message = getErrorMessage(err, fallback)
  const duration = isNetworkError(err) ? NETWORK_TOAST_DURATION : TOAST_DURATION
  showMessage(message, { duration })
  return Promise.resolve(false)
}

function showNetworkToast(message = '网络异常') {
  showMessage(message, { duration: NETWORK_TOAST_DURATION })
}

function showToast(title, options) {
  const opts = typeof options === 'object' && options ? options : {}
  if (opts.err && isNetworkError(opts.err)) {
    showNetworkToast()
    return
  }
  const message = localizeMessage(typeof title === 'string' ? title : String(title || ''))
  if (isNetworkError({ message })) {
    showNetworkToast()
    return
  }
  showMessage(message, {
    duration: opts.duration != null ? opts.duration : TOAST_DURATION,
    forbidClick: !!opts.mask,
  })
}

function showLoading(title = '加载中...') {
  showMessage(title, { loading: true, forbidClick: true })
}

function hideLoading() {
  Toast.clear()
}

function hideToast() {
  Toast.clear()
}

module.exports = {
  showAlert,
  showConfirm,
  showError,
  showToast,
  showNetworkToast,
  showLoading,
  hideToast,
  hideLoading,
}
