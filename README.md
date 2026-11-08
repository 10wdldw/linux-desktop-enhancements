# Linux Beautify / Linux 桌面美化

一个 GNOME Shell 扩展，整合 Dock、图标放大、浅深主题、窗口圆角、桌面操作和热点开关。
提供**中文（含输入法）**与**英文（不含输入法）**两种安装包。

当前发布：**[v3.1.2 预发布版](https://github.com/10wdldw/linux-desktop-enhancements/releases/tag/v3.1.2)**。
目标环境为 **Ubuntu 26.04 amd64 / GNOME Shell 50**；其他发行版、架构与 Shell 大版本尚未验证。
本次发布同步当前本机插件实现，Dock 角标、旧外观迁移和硬盘挂载后的流畅度问题仍需实机回归。

## 下载与版本选择

| 安装包 | 桌面功能 | 输入法与语言 |
| --- | --- | --- |
| [中文版完整包](https://github.com/10wdldw/linux-desktop-enhancements/releases/download/v3.1.2/linux-beautify-zh-3.1.2.tar.gz) | 内部 Dock、放大、主题、圆角、应用操作、热点 | Fcitx5 5.1.19、Rime 1.16.1、原生候选面板、雾凇拼音及双拼；插件界面中文 |
| [English full bundle](https://github.com/10wdldw/linux-desktop-enhancements/releases/download/v3.1.2/linux-beautify-en-3.1.2.tar.gz) | Same integrated desktop features | No input module, engine or dictionaries; `--apply` sets the user's GNOME session to English |

[全部附件与 Shell ZIP](https://github.com/10wdldw/linux-desktop-enhancements/releases/tag/v3.1.2) ·
[SHA256 校验文件](https://github.com/10wdldw/linux-desktop-enhancements/releases/download/v3.1.2/SHA256SUMS)

推荐完整 `.tar.gz`：包含安装器、事务备份和恢复工具。Shell ZIP 只有扩展载荷，
不会替你创建 GTK 主题链接、完整输入环境或安装事务。
两版共用 UUID `linux-beautify@local`，同一时间运行一版。

## 安装与升级

下载中文完整包和 `SHA256SUMS`，在下载目录执行：

```bash
sha256sum --check --ignore-missing SHA256SUMS
tar -xzf linux-beautify-zh-3.1.2.tar.gz
cd linux-beautify-zh-3.1.2
python3 scripts/beautify.py doctor
bash install.sh --backup-existing --dry-run
bash install.sh --backup-existing --apply --theme system --defer-activation
```

安装完成后正常注销并重新登录。已有 Fcitx/Rime 环境的用户，在安装命令中加
`--preserve-input`，保留已有配置、个人词库、启动项与输入环境。首次安装使用上面的完整预设。
`--defer-activation` 等待新的 GNOME 会话，避免当前 Shell 重用已缓存的旧代码。
升级正在运行的整合版时，安装器会先停用它，Dock 等功能在重新登录后恢复。

安装默认只放置资源；`--apply` 才应用 GTK/Dock/输入预设并安排激活。
重叠的旧 Dock、User Themes、MacStyle 等扩展按 UUID 逐项停用，原状态记录用于恢复。
英文版保留现有的外部输入面板；中文版接管候选面板。安装不需要 sudo。

**电源行为：当前预设默认启用三秒倒计时，并把确认框默认按钮设为关机、重启或注销。**
应用报告 inhibitor 时保留原倒计时与默认按钮逻辑。可在扩展首选项关闭此功能，
停用后重新启用扩展或重登生效。HDR 助手默认关闭。

## 备份与恢复

替换已有文件必须传 `--backup-existing`。原件、设置旧值和恢复清单保存在：

```text
~/.local/state/linux-desktop-enhancements/installations/
```

完整包目录中可预览或执行恢复：

```bash
bash uninstall.sh --dry-run
bash uninstall.sh
# 安装后的文件被修改时，先保留修改副本再恢复：
bash uninstall.sh --force
```

待激活安装会生成一次性登录任务，检查扩展和 Dock/输入模块，失败时恢复。
任务脚本和 `activation.log` 位于 `~/.local/state/linux-desktop-enhancements/first-login/`。
资源跟随真实 XDG 目录安装；RC20 等磁盘上的个人备份不包含在发行包中。

## 本次变更与已知限制

- 将原来分散的扩展改为一个入口和一个 DockManager；共享外观与焦点监听，合并同一事件内的图标查询，复用 Shell 的网络客户端。
- 隔离 GObject 类型名，修复旧插件已经加载时的类型冲突；增加登录激活检查、失败恢复和输入配置保留。
- 同步当前本机修补：热点在设备/连接配置变化后更新，异步出现的快捷设置项持续遵循隐藏规则，输入面板在暂时没有显示器时安全隐藏。
- 未完整迁移旧 Dock 的所有个性化设置与机器专属硬盘图标。红色运行圆点、通知胶囊计数/定位、硬盘挂载和卸载后的持续掉帧反馈仍列为待验证问题，本版不宣称已解决。
- WhiteSur 图标和 Yaru 光标需自行安装；GTK 4/libadwaita、Qt 与 Flatpak 的主题及输入法行为受应用自身集成影响。
- 没有整机 FPS、CPU 或内存收益的基准结论；隔离测试不等同于高刷、多屏、真实磁盘热插拔和所有应用的实机兼容验证。

## 自定义硬盘图标

硬盘标识仅从本机 `~/.config/linux-beautify/drive-icons.json` 读取，不随发布包分发。
按自己的卷 UUID 配置名称、图标文件和排序，重新启用扩展后生效：

```json
{
  "YOUR_VOLUME_UUID": {"name": "Data", "file": "drive-p41-v2.svg", "order": 0}
}
```

图标文件需位于扩展的 `desktop/assets/` 中；包内附有 `drive-p41-v2.svg`、
`drive-rc20-v2.svg`、`drive-860evo-v2.svg`。没有配置的硬盘保留系统名称与图标。

## 文档与开发

- [中文版完整说明](docs/README.zh.md)
- [English installation and recovery](docs/README.en.md)
- [架构与资源生命周期](docs/ARCHITECTURE.md)
- [审计记录](docs/AUDIT.md) · [验证范围与复现命令](docs/VALIDATION.md)
- [第三方来源及许可](THIRD_PARTY_NOTICES.md)

离线构建两版（需 Python 3、`glib-compile-schemas`、`sassc`、`msgfmt`）：

```bash
python3 scripts/build.py
python3 -m unittest discover -s tests -p 'test_*.py'
node tests/resources.mjs
node tests/localization.mjs
gjs -m tests/drive-config.js
python3 tests/validate_runtime.py en zh
python3 tests/validate_embedded_input.py
```

产物位于 `dist/`。运行测试另需 GNOME 50、GJS、GTK 3/4、libadwaita、PyGObject 与 D-Bus，
使用临时 HOME、私有总线和 headless Wayland，不向活动桌面安装测试版本。
项目采用 GPL-3.0；保留上游版权、独立组件许可，以及输入引擎对应源码归档。

## English

Linux Beautify combines its own Dock, magnification, light/dark themes, rounded
windows, desktop actions and a hotspot toggle into one GNOME Shell extension.
**v3.1.2 is a prerelease for Ubuntu 26.04 amd64 / GNOME Shell 50.**
The Chinese edition embeds Fcitx5/Rime, Rime Ice and a native candidate panel;
the English edition excludes the entire input stack. Both use `linux-beautify@local`.

Download the [English full bundle](https://github.com/10wdldw/linux-desktop-enhancements/releases/download/v3.1.2/linux-beautify-en-3.1.2.tar.gz)
and [checksums](https://github.com/10wdldw/linux-desktop-enhancements/releases/download/v3.1.2/SHA256SUMS), then:

```bash
sha256sum --check --ignore-missing SHA256SUMS
tar -xzf linux-beautify-en-3.1.2.tar.gz
cd linux-beautify-en-3.1.2
python3 scripts/beautify.py doctor
bash install.sh --backup-existing --dry-run
bash install.sh --backup-existing --apply --theme system --defer-activation
```

`--apply` also sets the current user's GNOME session language to `en_US.UTF-8`;
that locale must already exist. The previous language is recorded for recovery.
Log out and back in to load the installed code. An upgrade disables the currently
running integrated extension until the new session activates it.

The current preset enables a **three-second logout/restart/shutdown countdown**
and focuses the action button unless an application inhibits the action. Disable
it in preferences and reload the extension if desired. HDR remains off by default.
Restore with `bash uninstall.sh`; originals live in
`~/.local/state/linux-desktop-enhancements/installations/`.

This release includes the current desktop fixes for hotspot availability, delayed
quick-settings tiles and temporary monitor loss. Earlier reports concerning Dock
notification capsules, running-dot appearance, incomplete legacy appearance
migration and stuttering after drive mount/unmount still need hardware regression
testing. No measured system-wide performance improvement is claimed.
