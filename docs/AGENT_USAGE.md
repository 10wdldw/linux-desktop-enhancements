# Agent Usage / Agent 使用说明

## 中文

### 开始前

1. 先读根目录 `README.md`、`AGENTS.md` 和 `THIRD_PARTY_NOTICES.md`。
2. 确认用户要的是只读盘点、修改源码、打包，还是在当前桌面安装；不要把这些目标混为一谈。
3. 只读检查当前 GNOME Shell 主版本、相关扩展是否安装/启用、目标主题是否存在。不要读取或导出无关个人配置。

### 修改和安装

- 插件源码以 `extensions/` 为准；主题以 `themes/` 为准。不要直接把正在运行的用户扩展目录复制回项目，先审阅差异，避免把机器专属状态带入包。
- 默认只制作或检查包。只有用户明确要求安装到当前桌面时才运行 `scripts/install.sh`。
- 安装器遇到已存在目标时会停止。先报告冲突；只有用户明确要求替换时才用 `--backup-existing`，并说明备份位置。
- 不运行 `sudo`，不修改 `/usr/share`、系统扩展、Fcitx 设置或用户主题设置。
- 不触发实际关机、重启或注销。Quick Power Countdown 会在无 inhibitor 时 3 秒后自动执行默认动作；仅检查代码或在隔离环境验证。
- HDR Scanout Helper 始终默认禁用。除非用户明确要求，不启用它，也不调用 `SetIgnoreColorState true`。
- 不自动切换亮/暗主题，不把完整扩展启用列表覆盖成项目自带列表。

### 发布

- 项目采用 GPL-3.0；保留 `THIRD_PARTY_NOTICES.md` 中第三方主题、圆角窗口代码和 GNOME/LGPL 的单独声明。
- 不要删除或覆盖上游许可文本，也不要把第三方文件误写成用户原创。
- 上传前排除备份、诊断、截图、崩溃报告和本机状态文件。

## English

### Before starting

1. Read the root `README.md`, `AGENTS.md`, and `THIRD_PARTY_NOTICES.md`.
2. Distinguish read-only inventory, source changes, packaging, and installation on the current desktop.
3. Read only the GNOME Shell major version and the relevant extensions/theme presence and enabled state. Do not export unrelated personal settings.

### Changes and installation

- Treat `extensions/` and `themes/` as the packaged source of truth. Do not copy a running extension directory back into the package without reviewing the diff for machine-specific state.
- Default to inspecting or preparing the package. Run `scripts/install.sh` on the current desktop only when the user explicitly asks for installation.
- The installer stops on existing targets. Report the conflict first; use `--backup-existing` only when the user requests replacement, and report where the recoverable backup is stored.
- Do not use `sudo` or modify `/usr/share`, system extensions, Fcitx settings, or active theme settings.
- Never trigger real shutdown, reboot, or logout. Quick Power Countdown performs the default action after three seconds when there are no inhibitors; inspect it or validate only in an isolated environment.
- Keep HDR Scanout Helper disabled by default. Do not enable it or call `SetIgnoreColorState true` without an explicit user request.
- Do not switch the active light/dark theme automatically or replace the complete enabled-extension list.

### Release

- The project uses GPL-3.0; preserve the separate notices for third-party themes, rounded-window code, and GNOME/LGPL material in `THIRD_PARTY_NOTICES.md`.
- Do not remove upstream license texts or misrepresent third-party files as user-authored.
- Exclude backups, diagnostics, screenshots, crash reports, and machine state from uploads.

