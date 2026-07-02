const Dialog = require('@vant/weapp/dialog/dialog').default
const Toast = require('@vant/weapp/toast/toast').default
const { getErrorMessage, isNetworkError, NETWORK_MESSAGE } = require('./error')

Dialog.setDefaultOptions({
  width: '580rpx',
  theme: 'round-button',
  messageAlign: 'center',
  transition: 'scale',
  overlay: true,
  confirmButtonColor: '#C87E40',
  cancelButtonColor: '#A08B6F',
  className: 'km-dialog-wrap',
  confirmButtonText: '确定',
  cancelButtonText: '取消',
})

Toast.setDefaultOptions({
  position: 'middle',
  forbidClick: false,
  duration: 2000,
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

/** 等待页面就绪后再弹出（解决 App.onLaunch 时 van-toast 尚未挂载） */
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

function showAlert(content, title = '提示') {
  const message = localizeMessage(typeof content === 'string' ? content : String(content || ''))
  return new Promise((resolve) => {
    runWithPage((page) => {
      Dialog.alert(withPageContext({
        title,
        message,
        showCancelButton: false,
        confirmButtonText: '确定',
      }, page)).catch(() => false).then(resolve)
    })
  })
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
  if (isNetworkError(err)) {
    showNetworkToast(message)
    return Promise.resolve(false)
  }
  return showAlert(message)
}

function showToast(title, options) {
  const opts = typeof options === 'object' && options ? options : {}
  const message = localizeMessage(typeof title === 'string' ? title : String(title || ''))
  const icon = opts.icon || 'none'
  let type = 'text'
  if (icon === 'success') type = 'success'
  if (icon === 'error' || icon === 'fail') type = 'fail'
  if (icon === 'loading') type = 'loading'
  const toastOptions = {
    message,
    type,
    duration: opts.duration != null ? opts.duration : 2000,
    position: 'middle',
    forbidClick: !!opts.mask || type === 'loading',
  }
  runWithPage((page) => {
    Toast(withPageContext(toastOptions, page))
  })
}

function showNetworkToast(message = NETWORK_MESSAGE) {
  showToast(message, { icon: 'none', duration: 2500 })
}

function showLoading(title = '加载中...') {
  runWithPage((page) => {
    Toast(withPageContext({
      type: 'loading',
      message: title,
      duration: 0,
      position: 'middle',
      forbidClick: true,
    }, page))
  })
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
  localizeMessage,
}
