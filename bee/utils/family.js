const request = require('./request')

const ROLE_LABELS = {
  admin: '管理员',
  member: '成员',
  owner: '超级管理员',
}

function displayRole(role, isOwner) {
  if (isOwner) return ROLE_LABELS.owner
  return ROLE_LABELS[role] || '成员'
}

function canManageMember(viewer, member) {
  if (!viewer.isAdmin) return false
  if (member.user_id === viewer.myUserId) return false
  if (member.is_owner) return false
  if (member.role === 'admin' && !viewer.isOwner) return false
  return true
}

function listFamilies() {
  return request({ url: '/families', method: 'GET' })
}

function createFamily(name) {
  return request({
    url: '/families',
    method: 'POST',
    data: { name },
  })
}

function getFamilyDetail(familyId) {
  return request({ url: `/families/${familyId}`, method: 'GET' })
}

function getInviteInfo(familyId) {
  return request({ url: `/families/${familyId}/invite`, method: 'GET' })
}

function joinFamily(inviteCode) {
  return request({
    url: '/families/join',
    method: 'POST',
    data: { invite_code: inviteCode },
  })
}

function updateMemberRole(familyId, memberId, role) {
  return request({
    url: `/families/${familyId}/members/${memberId}`,
    method: 'PATCH',
    data: { role },
  })
}

function leaveFamily(familyId) {
  return request({
    url: `/families/${familyId}/leave`,
    method: 'POST',
  })
}

function removeMember(familyId, memberId) {
  return request({
    url: `/families/${familyId}/members/${memberId}`,
    method: 'DELETE',
  })
}

function deleteFamily(familyId) {
  return request({
    url: `/families/${familyId}`,
    method: 'DELETE',
  })
}

function downloadFamilyWxacode(familyId) {
  const CONFIG = require('../config.js')
  const token = wx.getStorageSync('token')
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: `${CONFIG.apiBaseUrl}/families/${familyId}/wxacode`,
      header: { Authorization: `Bearer ${token}` },
      success(res) {
        if (res.statusCode === 200) {
          resolve({
            path: res.tempFilePath,
            isOfficial: isWxacodeResponse(res.header),
          })
        } else {
          reject(new Error(`获取小程序码失败 (${res.statusCode})`))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '下载失败'))
      },
    })
  })
}

function isWxacodeResponse(header) {
  if (!header) return false
  const type = header['X-QR-Type'] || header['x-qr-type'] || ''
  return String(type).toLowerCase() === 'wxacode'
}

module.exports = {
  listFamilies,
  createFamily,
  getFamilyDetail,
  getInviteInfo,
  joinFamily,
  updateMemberRole,
  leaveFamily,
  removeMember,
  deleteFamily,
  downloadFamilyWxacode,
  ROLE_LABELS,
  displayRole,
  canManageMember,
}
