import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class BeautifyPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();
    const selected = settings.get_string('language');
    const chinese = (selected === 'default' ? this.metadata['default-language'] : selected).startsWith('zh');
    const t = (en, zh) => chinese ? zh : en;
    const page = new Adw.PreferencesPage({title: t('Linux Beautify', 'Linux 桌面美化')});
    window.add(page);
    const group = new Adw.PreferencesGroup({
      title: t('Plugin preferences', '插件设置'),
      description: t('Disable and re-enable the plugin after changing these options. The system language is unchanged.',
        '修改后请关闭再开启插件以生效。不会修改系统语言。'),
    });
    page.add(group);
    const languages = ['default', 'zh_CN', 'en'];
    const row = new Adw.ComboRow({
      title: t('Interface language', '界面语言'),
      model: Gtk.StringList.new([t('Edition default', '使用发行版默认语言'), '简体中文', 'English']),
      selected: Math.max(0, languages.indexOf(selected)),
    });
    row.connect('notify::selected', () => settings.set_string('language', languages[row.selected]));
    group.add(row);
    const dock = this.getSettings('org.gnome.shell.extensions.linux-beautify.dock');
    const dockGroup = new Adw.PreferencesGroup({title: t('Integrated Dock', '内置 Dock')});
    page.add(dockGroup);
    for (const [key, en, zh] of [
      ['autohide', 'Auto-hide', '自动隐藏'],
      ['intellihide', 'Hide for overlapping windows', '窗口重叠时隐藏'],
      ['show-mounts', 'Show volumes and devices', '显示磁盘'],
      ['show-trash', 'Show trash', '显示回收站'],
      ['show-show-apps-button', 'Show applications icon', '显示应用'],
    ]) {
      const toggle = new Adw.SwitchRow({title: t(en, zh)});
      dock.bind(key, toggle, 'active', Gio.SettingsBindFlags.DEFAULT); dockGroup.add(toggle);
    }
    if (this.metadata['beautify-edition'] === 'zh') {
      const inputGroup = new Adw.PreferencesGroup({title: '内嵌输入法 · Fcitx5 / Rime',
        description: '引擎、雾凇拼音和候选面板均已内置。已有输入法实例将复用。'});
      page.add(inputGroup);
      const vertical = new Adw.SwitchRow({title: '纵向候选词'});
      settings.bind('input-vertical', vertical, 'active', Gio.SettingsBindFlags.DEFAULT); inputGroup.add(vertical);
      const font = new Adw.EntryRow({title: '候选字体（如 Sans 14）', text: settings.get_string('input-font'), show_apply_button: true});
      font.connect('apply', () => settings.set_string('input-font', font.text)); inputGroup.add(font);
    }
    for (const [key, title, description] of [
      ['quick-power-countdown', t('Three-second power countdown', '三秒电源倒计时'),
        t('Automatically carries out logout, restart or shutdown after 3 seconds unless an application inhibits it.',
          '无应用阻止退出时，3 秒后会自动执行注销、重启或关机。')],
      ['hdr-helper', t('Advanced HDR helper', '高级 HDR 助手'),
        t('Only exposes an explicit D-Bus control. Activating that control may distort SDR fullscreen colors.',
          '仅提供手动 D-Bus 控制接口；主动开启该开关可能导致 SDR 全屏颜色异常。')],
    ]) {
      const toggle = new Adw.SwitchRow({title, subtitle: description});
      settings.bind(key, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);
      group.add(toggle);
    }
  }
}
