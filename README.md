# Linux Desktop Enhancements / Linux 桌面美化与优化

Personal GNOME Shell extensions and matching MacStyle themes, collected as a small, reusable package. / 将个人使用的 GNOME Shell 扩展与配套 MacStyle 主题整理为可复用的小型套件。

## 中文

本项目整理了三项本地 GNOME 扩展及配套浅色/深色桌面主题。目标环境是 Ubuntu、GNOME Shell 50；不包含普通鼠标指针项目，也不替换系统扩展或全局桌面配置。

### 包含内容

| 组件 | 用途 | 默认状态 |
| --- | --- | --- |
| MacStyle Session | Mac 风格 Shell 主题接入、Ubuntu Dock 悬停放大、窗口圆角及本机定制 | 安装但不自动启用 |
| Quick Power Countdown | 缩短关机/重启/注销确认倒计时至 3 秒；检测到阻止退出的应用时保留保护倒计时 | 安装但不自动启用 |
| HDR Scanout Helper | 通过会话 D-Bus 按需切换 Mutter 的 HDR 直通调试标志 | 安装但保持禁用 |
| MacStyle-Light / MacStyle-Dark | 配套 GTK、GNOME Shell 和窗口主题 | 安装但不自动切换当前主题 |

### 安装

需要 Ubuntu/GNOME Shell 50。先解压本包并进入目录：

```bash
bash scripts/install.sh
```

如果目标扩展或主题已经存在，安装器会停止，避免覆盖。确认要替换时使用：

```bash
bash scripts/install.sh --backup-existing
```

被替换的目录会移到 `~/.local/state/linux-desktop-enhancements/backups/`。安装器不使用 sudo，不更改系统目录，不自动启用扩展或切换桌面设置。

安装后如需启用 MacStyle 和电源倒计时扩展，可在 GNOME 扩展应用中手动开启。若要切换主题，先确认系统已安装 GNOME 的 User Themes 扩展，然后在 Tweaks/优化工具中选择 `MacStyle-Light` 或 `MacStyle-Dark`。此主题元数据引用 WhiteSur 图标主题和 Yaru 光标主题；本包不包含这两个独立资源。

HDR 助手默认保持禁用。仅在了解颜色副作用后手动启用：开启后 SDR 全屏应用也可能被直接扫描输出，颜色可能异常。它不会自动打开 HDR 标志；需要时可在 Shell 会话中调用：

```bash
gnome-extensions enable hdr-scanout@local
gdbus call --session --dest org.gnome.Shell --object-path /local/HdrScanout \
  --method local.HdrScanout.SetIgnoreColorState true
```

关闭时将 `true` 改为 `false`。禁用该扩展也会自动清除此标志。

### 验证与限制

- 本包按本机 GNOME Shell 50 环境整理；不承诺兼容其他 Shell 主版本或非 Ubuntu Dock 环境。
- Quick Power Countdown 的 3 秒倒计时会自动执行默认操作。启用前请确认自己接受这个行为；如果有应用阻止退出，原有较长倒计时和取消流程会保留。
- Ubuntu Dock、User Themes、WhiteSur 图标主题、Yaru 光标主题由系统或用户另行提供。
- 本项目按 GPL-3.0 发布；第三方主题及代码仍受各自随附许可和声明约束，详见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 本机还存在针对 Ubuntu Dock、Snap 权限提示和输入法的版本相关本地调整；它们不是独立的用户扩展，本便携包不会修改 `/usr/share`、Fcitx 配置或应用启动项。相关机器级维护记录留在原工作区，不作为跨机器安装内容。
- 上游组件和主题的来源、授权边界见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

### 目录

- `extensions/`：三个 GNOME Shell 扩展的完整用户级安装目录。
- `themes/`：MacStyle 浅色与深色主题。
- `scripts/install.sh`：用户级安装器。
- `AGENTS.md`：供 Codex/其他代码 agent 使用的维护说明。
- `docs/AGENT_USAGE.md`：面向任务执行 agent 的中英文工作流程。
- `THIRD_PARTY_NOTICES.md`：组件来源和授权核对记录。
- `scripts/`：可选的检查和安装脚本。

## English

This package collects three local GNOME Shell extensions and their light/dark MacStyle themes. It targets Ubuntu with GNOME Shell 50. It does not include the unrelated cursor-theme project, replace system extensions, or modify global desktop settings.

### Included components

| Component | Purpose | Default behavior |
| --- | --- | --- |
| MacStyle Session | Mac-style Shell theme integration, Ubuntu Dock hover magnification, rounded windows, and local customizations | Installed, not enabled automatically |
| Quick Power Countdown | Sets logout/shutdown/restart confirmation to 3 seconds; retains the longer protection flow when apps inhibit the action | Installed, not enabled automatically |
| HDR Scanout Helper | Toggles Mutter's HDR direct-scanout debug flag on demand over session D-Bus | Installed and left disabled |
| MacStyle-Light / MacStyle-Dark | Matching GTK, GNOME Shell, and window themes | Installed without changing the active theme |

### Install

Ubuntu with GNOME Shell 50 is required. Extract the package, enter its directory, and run:

```bash
bash scripts/install.sh
```

The installer stops if a target extension or theme already exists. To replace existing targets after reviewing them, run:

```bash
bash scripts/install.sh --backup-existing
```

Replaced directories are moved to `~/.local/state/linux-desktop-enhancements/backups/`. The installer does not use sudo, write to system directories, enable extensions, or change desktop settings.

After installation, enable MacStyle Session and Quick Power Countdown manually in GNOME Extensions if desired. To switch themes, ensure GNOME User Themes is installed and select `MacStyle-Light` or `MacStyle-Dark` in Tweaks. The theme metadata references the separate WhiteSur icon theme and Yaru cursor theme; neither is bundled.

HDR Scanout Helper is disabled by default. Enable it only if you understand the color side effect: SDR fullscreen applications may also be direct-scanned out and display incorrect colors. The extension never enables the flag automatically. To opt in from the Shell session:

```bash
gnome-extensions enable hdr-scanout@local
gdbus call --session --dest org.gnome.Shell --object-path /local/HdrScanout \
  --method local.HdrScanout.SetIgnoreColorState true
```

Pass `false` to turn the flag off. Disabling the extension also clears it.

### Package contents

- `extensions/`: complete user-level directories for the three GNOME Shell extensions.
- `themes/`: the MacStyle light and dark themes.
- `scripts/install.sh`: user-level installer.
- `AGENTS.md`: maintenance rules for Codex and other code agents.
- `docs/AGENT_USAGE.md`: bilingual task workflow for agents.
- `THIRD_PARTY_NOTICES.md`: component origin and licensing review notes.

### Validation and limits

- This package was assembled for the local GNOME Shell 50 environment. Other Shell major versions and non-Ubuntu-Dock environments are not claimed as supported.
- Quick Power Countdown automatically performs the selected action after three seconds. Review this behavior before enabling it. The existing longer countdown and cancel flow remain when an application inhibits logout/shutdown/restart.
- Ubuntu Dock, GNOME User Themes, WhiteSur icons, and Yaru cursors are supplied separately by the system or user.
- This project is distributed under GPL-3.0; third-party themes and code remain subject to their own bundled licenses and notices. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- This machine also has version-specific local changes to Ubuntu Dock, Snap permission prompts, and input-method configuration. They are not standalone user extensions; this portable package does not modify `/usr/share`, Fcitx settings, or application launchers. Machine-specific maintenance records remain in the original workspace and are not treated as cross-machine install content.
- Review [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for upstream origins and license boundaries.

