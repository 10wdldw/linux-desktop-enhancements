# Linux 桌面美化 · 中文版 3.1.2

一个 GNOME 插件提供内部 Dock、图标放大、浅深主题、窗口圆角、应用操作和热点开关，
同时内嵌 **Fcitx5 5.1.19、fcitx5-rime 5.1.13、Rime 1.16.1**、Lua 支持、
雾凇拼音与自然码/小鹤双拼、输入皮肤和项目原生候选面板。
UUID：`linux-beautify@local`。不需要单独的 Ubuntu Dock、User Themes 或 Kimpanel 扩展。

## 环境与安装

目标为 Ubuntu 26.04 **amd64**、GNOME Shell 50。使用系统已有 Python 3、GSettings、
D-Bus 和 GNOME/GTK/Qt/图形基础库。输入引擎、Rime 和相应前端已随包附带，不要求
预装系统 fcitx5/fcitx5-rime。GTK/Qt 应用使用其自身对应版本的系统工具包 ABI；
沙箱/Flatpak 应用仍受各自输入法集成机制约束，不承诺所有应用都可主题化。

解压完整 `.tar.gz`，进入目录：

```bash
python3 scripts/beautify.py doctor
bash install.sh --backup-existing --dry-run
bash install.sh --backup-existing --apply --theme dark
```

默认只安装资源；`--apply` 才应用 GTK/Dock、Fcitx 配置、用户启动项和激活。
首次发现扩展或替换本会话已经加载过的版本时，安装器会安排下次登录自动激活。
迁移分散旧插件时，它们在当前会话保持启用；升级已运行的整合版时会先停用整合版，
其 Dock 等功能在重登后恢复。注销重登后检查 Dock 和输入模块，失败则恢复。
手动激活命令：

```bash
python3 scripts/beautify.py activate
```

安装器逐项禁用已开启的重叠旧扩展，记录它们的状态，不覆盖整个扩展列表、不改系统
扩展、不使用 sudo。直接在扩展管理器启用时，需先关闭重叠扩展，否则本插件拒绝重复加载。
中文版和英文版 UUID 相同，同一时间只运行一个版本。

已有 Fcitx/Rime 配置时，可保留快捷键、输入方案、词库、启动项及环境集成：

```bash
bash install.sh --backup-existing --apply --theme system --preserve-input --defer-activation
```

`--defer-activation` 显式等待新的 GNOME 会话，避免重用缓存的旧 JS 模块。自动激活与恢复脚本
保存在用户系统盘的 `~/.local/state/linux-desktop-enhancements/first-login/`，不依赖安装包所在盘。
该目录中的 `activation.log` 记录运行检查；失败时还记录 Shell 错误。

## 内嵌输入法

Shell 中的候选面板是本项目内部模块；普通应用由内嵌 Fcitx 经典/客户端界面处理。
引擎与皮肤不是同一层：引擎实际完成拼音转换、词库部署和文字提交。
输入法原生进程由扩展或同一个自动启动项调用带锁启动器，只启动一份。
检测到用户已有 Fcitx5 时复用它；若旧实例没有 Rime，应用设置并重登后由内嵌启动器启动。
不会使用 `--replace` 强制替换正在运行的输入法。

普通 Fcitx 配置位于 `~/.config/fcitx5/`；词库位置为
`~/.local/share/fcitx5/rime/`。不可变分发资源软链接到扩展目录，个人短语、学习数据库、
编译输出和自定义设置仍是用户文件。已有 `custom_phrase.txt` 和学习词库不会被覆盖。
首次使用会编译分发词库，可能短暂等待；可手动用本项目启动器部署：

```bash
~/.local/bin/linux-beautify-ime version
~/.local/bin/linux-beautify-ime status
~/.local/bin/linux-beautify-ime deploy
```

默认 `Ctrl+Space` 切换输入。输入面板的字体、横纵候选设置在插件首选项中。
可通过 Rime 的方案选择菜单切换自然码或小鹤双拼。
关闭插件只停止它自己启动的引擎；原有实例或自动启动项持有的实例继续运行。
插件不会再启动另外的 Kimpanel GNOME 扩展。

## 外观、语言和可选功能

Shell 主题跟随浅深色设置；`--theme light|dark|system` 决定明确应用的 GTK 外观。
GTK 4/libadwaita 应用可能保留自己的外观。WhiteSur 图标、Yaru 光标及独立光标项目未内嵌。

中文版插件界面默认简体中文；不会默认修改会话语言。确需切换时在 `--apply` 后加
`--set-session-language`，要求相应 UTF-8 locale 已生成；通过 AccountsService 记录和恢复
原用户语言，注销重登生效。英文版 `--apply` 按用户要求默认设置会话英语。

三秒电源倒计时默认开启。没有应用 inhibitor 阻止时，会在三秒后自动执行
注销、重启或关机，并把默认按钮从「取消」改为对应操作。HDR 助手默认关闭；只暴露显式 D-Bus 接口，不自动开启直通标志。
手动调用该标志可能使 SDR 全屏颜色失真，关闭助手会清除标志。

## 备份、卸载与分发

已有目标仅在显式 `--backup-existing` 时替换。原件、设置旧值、旧扩展状态与恢复清单
位于 `~/.local/state/linux-desktop-enhancements/installations/`。

```bash
bash uninstall.sh --dry-run
bash uninstall.sh
# 已修改安装文件时，保存修改后再恢复旧件：
bash uninstall.sh --force
```

失败安装自动回滚；多次切换版本可逐层卸载。个人学习词库不会被卸载器批量删除。
资源只安装到当前用户的真实 XDG 目录；若该目录位于系统盘，运行配置也落在系统盘，
不会强制写入 RC20。机器级全量备份和 RC20 归档由先前的备份流程独立管理，不塞入项目。

完整包包含恢复安装器；Shell ZIP 同样只有一个扩展并携带内嵌引擎，但绕过完整安装器
将不创建 GTK 主题链接、完整输入环境与事务恢复清单，推荐使用完整包。
开源源码、原版权和对应输入引擎源代码归档随包保留，详见 `THIRD_PARTY_NOTICES.md`。

## 3.1.2 预发布范围

本版同步热点设备变化监听、异步快捷设置项处理和候选面板的无显示器保护。
旧 Dock 个性化设置与机器专属硬盘图标未完整迁移；通知胶囊、红色运行圆点和
挂载/卸载硬盘后的掉帧反馈仍需实机回归。隔离测试不代表这些反馈已经解决。

硬盘图标映射读取 `~/.config/linux-beautify/drive-icons.json`，格式为
`{"YOUR_VOLUME_UUID":{"name":"Data","file":"drive-p41-v2.svg","order":0}}`。
`file` 为扩展 `desktop/assets/` 中的 SVG 文件名。重启扩展后读取，未配置的卷使用系统图标；
发布包不携带任何本机卷标识。
