const { getErrorMessage } = require('./error')

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
  'Cannot lock an empty order session': '订单为空，无法提交',
  'No dishes available for ordering': '暂无可点菜品',
}

function localizeMessage(message) {
  if (!message || typeof message !== 'string') return message
  const trimmed = message.trim()
  return MESSAGE_MAP[trimmed] || trimmed
}

function showAlert(content, title = '提示') {
  const text = localizeMessage(typeof content === 'string' ? content : String(content || ''))
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content: text,
      showCancel: false,
      confirmText: '确定',
      success: () => resolve(true),
      fail: () => resolve(false),
    })
  })
}

function showError(err, fallback = '操作失败') {
  return showAlert(getErrorMessage(err, fallback))
}

module.exports = {
  showAlert,
  showError,
  localizeMessage,
}
