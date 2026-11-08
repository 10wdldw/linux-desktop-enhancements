// Package UI language is independent of the GNOME session's language.
let currentLanguage = 'en';
const zh = {
  'Add to Desktop': '添加到桌面',
  'Rename': '重命名',
  'Application': '应用',
  'Cancel': '取消',
  'OK': '确定',
  'Hotspot': '热点',
};

export function setLanguage(language) {
  currentLanguage = language.startsWith('zh') ? 'zh_CN' : 'en';
}

export function language() {
  return currentLanguage;
}

export function translate(message) {
  return currentLanguage === 'zh_CN' ? (zh[message] ?? message) : message;
}
