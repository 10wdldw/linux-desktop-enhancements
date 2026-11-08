# Linux Beautify · English Edition 3.1.2

One GNOME extension provides an integrated Dock, magnification, light/dark themes,
rounded windows, desktop shortcuts, app renaming and a hotspot toggle. Its UUID is
`linux-beautify@local`; editions replace each other. It does not load standalone
Ubuntu Dock, User Themes or Kimpanel extensions.

## Requirements and installation

Targets Ubuntu 26.04 amd64 with GNOME Shell 50, Python 3, GSettings and the normal
GNOME/GTK desktop libraries. The English edition includes no Chinese input module,
engine, dictionaries or input configuration. WhiteSur icons and Yaru cursors remain
external resources. GTK 4/libadwaita applications may retain their own styling.

Extract the complete `.tar.gz` and enter its directory:

```bash
python3 scripts/beautify.py doctor
bash install.sh --dry-run --backup-existing
bash install.sh --backup-existing --apply --theme dark
```

Resource-only installation is passive. `--apply` applies GTK/Dock presets, activates
the plugin and **sets the current user's GNOME session language to en_US.UTF-8**,
as requested. Ensure that locale has been generated. AccountsService saves the
per-user language; the previous value is recorded for rollback/uninstall. English
takes effect after re-login. No global system locale is rewritten.

A running Shell caches loaded code. Pending installs schedule automatic activation
after re-login. Upgrading an active integrated extension disables it until that new
session; standalone legacy plugins remain enabled until migration. If manual
activation is needed after re-login, run:

```bash
python3 scripts/beautify.py activate
```

Activation disables only enabled overlapping legacy UUIDs and records their state
for restoration: Ubuntu Dock / Dash to Dock, User Themes, MacStyle, Kimpanel, and the
old optional power/HDR extensions. It never replaces the complete enabled-extension
list. Direct enabling through GNOME Extensions requires disabling these overlaps
first; the integrated plugin rejects duplicate Shell hooks.
Because this edition owns no input panel, it leaves an existing Kimpanel extension enabled.

## Shared resources and preferences

One DockManager is owned by the main plugin. Appearance settings/signals are shared;
Dock discovery does not poll or traverse the actor tree. The hotspot feature borrows
Shell's existing network client. Immutable themes live once under the extension;
standard XDG theme directories contain links to those assets.

Preferences provide interface language, Dock auto-hide behavior and the optional
power/HDR modules. Disable/re-enable after changing language or optional modules.
The Shell theme follows GNOME's light/dark setting. The installer explicitly applies
GTK presets only when `--apply` is supplied.

The three-second power countdown is on by default. It automatically
performs logout, restart or shutdown unless an application inhibits the action.
The HDR helper is off by default and only exposes explicit `/local/HdrScanout` D-Bus
control. It never activates the Mutter flag automatically; intentionally calling
`SetIgnoreColorState true` can distort SDR fullscreen colors. Disabling clears it.

## Recovery and artifacts

Existing targets require `--backup-existing`; originals and transaction records live
under `~/.local/state/linux-desktop-enhancements/installations/`. No sudo or system
extension patches are used. Installation failure rolls back managed changes.

```bash
bash uninstall.sh --dry-run
bash uninstall.sh
bash uninstall.sh --force  # preserve edited installed files, then restore originals
```

Uninstall restores recorded files/settings, the prior account language and affected
extension states. Multiple edition replacements can be uninstalled one layer at a
time. Replacing a managed Chinese edition withdraws its launcher/input configuration
and restores pre-Chinese originals; reversing the English layer restores the Chinese edition. A Shell ZIP installs the same single extension but skips GTK theme links and
the transaction installer; use the complete bundle for full setup and recovery.

GPL-3.0 project code; upstream notices, exact pinned Dock source and separately
licensed theme assets are documented in `THIRD_PARTY_NOTICES.md` and `licenses/`.

## Upgrade recovery in 3.1.1

All 21 GObject classes have explicit LinuxBeautify type names to avoid collisions with
previously loaded standalone plugins. Replacing cached code requires a fresh GNOME
session, even when the previous extension is disabled or in ERROR. Pending installs
prepare a one-shot login activation with runtime health checks and rollback; the
recovery scripts and logs live under the user state directory, independently of the
original package. `--defer-activation` requests this explicitly. The Chinese installer
also supports `--preserve-input` to keep existing Fcitx/Rime configuration, dictionaries,
startup entries and environment integration.

## 3.1.2 prerelease scope

Includes hotspot device/profile updates, delayed quick-settings tile handling and
a guard for temporary monitor loss in the input panel. Legacy Dock appearance
migration, notification capsules, running-dot appearance and stuttering after drive
mount/unmount still require hardware regression testing. Isolated validation does
not establish that these earlier reports are resolved.

Custom drive names/icons are read from `~/.config/linux-beautify/drive-icons.json`
as `{"YOUR_VOLUME_UUID":{"name":"Data","file":"drive-p41-v2.svg","order":0}}`.
The SVG must exist under the extension’s `desktop/assets/`. Reload the extension
to apply changes; unconfigured volumes retain native icons. Releases contain no
private volume identifiers.
