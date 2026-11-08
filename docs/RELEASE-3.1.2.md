# Linux Beautify 3.1.2 / Linux 桌面美化

本次将仓库中原来分散的插件替换为一个整合扩展，并发布两个可下载版本：
**中文版含 Fcitx5/Rime 输入法，英文版不含输入法**。
目标环境：Ubuntu 26.04 amd64、GNOME Shell 50。两版共用 `linux-beautify@local`。

这是当前桌面实现的**预发布版**。此前反馈的 Dock 通知胶囊、运行圆点、外观迁移及
硬盘挂载/卸载后的流畅度仍需实机回归，不将它们列为已修复。

## 包含的变化

- 一个入口管理 Dock、放大、主题、圆角、桌面操作和热点；共享监听与资源生命周期。
- 中文内嵌 Fcitx5 5.1.19、fcitx5-rime 5.1.13、Rime 1.16.1、雾凇拼音/双拼及原生候选面板。
- 独立 GObject 类型名避免旧插件类型冲突；增加下一次登录自动激活、运行检查及失败恢复。
- 保留现有输入环境的 `--preserve-input` 和显式延迟激活的 `--defer-activation`。
- 合入当前本机的热点设备/配置变化处理、异步快捷设置项生命周期和输入面板无显示器保护。
- 硬盘图标映射改为读取用户配置，发布包不携带个人硬盘标识。
- 更新中英文 README、安装/升级/恢复指引、已知限制和验证记录。

## 下载与安装

推荐选择 `linux-beautify-zh-3.1.2.tar.gz` 或 `linux-beautify-en-3.1.2.tar.gz`。
下载 `SHA256SUMS` 后执行 `sha256sum --check --ignore-missing SHA256SUMS`。
解压完整包，在包目录执行：

```bash
python3 scripts/beautify.py doctor
bash install.sh --backup-existing --dry-run
bash install.sh --backup-existing --apply --theme system --defer-activation
```

已有 Fcitx/Rime 环境时加 `--preserve-input`。正常注销重登后加载新代码。
升级整合版会先停用当前实例，Dock 在重登后恢复。
英文版 `--apply` 同时设置当前用户会话语言为 `en_US.UTF-8`，旧值可恢复。
**当前预设默认启用三秒关机/重启/注销倒计时与对应默认按钮**，应用 inhibitor 情况保留原行为；
可在首选项关闭并重新加载扩展。HDR 助手默认关闭。

完整包内 `bash uninstall.sh` 可恢复安装事务；备份位于
`~/.local/state/linux-desktop-enhancements/installations/`。
Shell ZIP 不包含完整安装事务与环境设置流程，推荐完整包。

## 验证

32 项安装器测试、共享资源、本地化、两版隔离 Shell 运行、三次启停、GTK 窗口/主题、
中文候选合并与内嵌引擎 `nihao ` → “你好”通过；硬盘配置有效性检查通过。
两版旧插件迁移与模拟重新登录激活检查通过。详见仓库 `docs/VALIDATION.md`。未执行真实电源动作或实机磁盘热插拔，不宣称性能提升百分比。

## English

Two editions of one source-integrated GNOME extension: **Chinese with embedded
Fcitx5/Rime**, and **English without the input stack**. Targets Ubuntu 26.04 amd64 /
GNOME Shell 50. Includes shared Dock/theme/desktop resources, migration recovery,
hotspot availability updates, delayed quick-settings handling and a monitor-loss
guard for the candidate panel. Private drive identifiers move to user configuration.

This is a **prerelease**. Previous Dock badge, appearance migration and drive-related
stuttering reports still require hardware regression testing. Prefer the full tar
bundle; checksums and extension-only ZIPs are also provided. Back up with
`--backup-existing`, apply with `--apply`, and re-login to load new code. English
apply changes the user's session language. The three-second end-session countdown
is enabled by default; HDR is off. See README for installation and recovery.
