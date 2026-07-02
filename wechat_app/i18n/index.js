const zhCN = require('./zh_CN.js')

function getLanguage() {
  return 'zh_CN'
}

function $t() {
  return zhCN
}

function setTabBarLanguage() {
  const $t = zhCN
  wx.setTabBarItem({
    index: 0,
    pagePath: 'pages/home/index',
    iconPath: 'images/nav/home-off.png',
    selectedIconPath: 'images/nav/home-on.png',
    text: $t.index.home,
  })
  wx.setTabBarItem({
    index: 1,
    pagePath: 'pages/index/index',
    iconPath: 'images/nav/index-off.png',
    selectedIconPath: 'images/nav/index-on.png',
    text: $t.index.order,
  })
  wx.setTabBarItem({
    index: 2,
    pagePath: 'pages/all-orders/index',
    iconPath: 'images/nav/qc-off.png',
    selectedIconPath: 'images/nav/qc-on.png',
    text: $t.index.orders,
  })
  wx.setTabBarItem({
    index: 3,
    pagePath: 'pages/my/index',
    iconPath: 'images/nav/my-off.png',
    selectedIconPath: 'images/nav/my-on.png',
    text: $t.my.title,
  })
}

module.exports = {
  setTabBarLanguage,
  getLanguage,
  $t,
}
