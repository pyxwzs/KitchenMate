module.exports = {
  version: '0.1.0',

  apiBaseUrl: 'http://192.168.1.8:8000/api/v1',
  // 真机调试：改成电脑局域网 IP（ifconfig 查看），手机与电脑同一 WiFi；
  // 开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名…」

  useDevLogin: false,
  authSessionVersion: 3,

  logoPath: '/images/logo.png',
  appName: '懒大厨个人菜单',
}
