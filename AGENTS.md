# Agent maintenance notes

## Project scope

This repository packages the user's local GNOME desktop components:

- `macstyle-session@local`: the user's GNOME Shell / Ubuntu Dock integration, including rounded-window code and bundled assets.
- `quick-power-countdown@local`: the user's end-session countdown adjustment.
- `hdr-scanout@local`: an opt-in HDR direct-scanout helper. It is intentionally disabled by default.
- `themes/MacStyle-Light` and `themes/MacStyle-Dark`: the local theme copies used with MacStyle Session.

Do not add the separate cursor-theme project. Do not copy machine backups, diagnostics, crash reports, desktop settings, absolute home paths, or installed system-extension trees into the package.

## Compatibility and behavior

- The package targets Ubuntu with GNOME Shell 50 and Ubuntu Dock.
- `Quick Power Countdown` automatically carries out the default session action after three seconds when there are no inhibitors. Preserve its inhibitor-aware safety branch.
- `HDR Scanout Helper` must remain disabled and must not enable its Mutter flag as an installation side effect. The flag can produce incorrect SDR colors.
- `MacStyle Session` expects its paired themes and the Ubuntu Dock API. The separate User Themes extension is needed to switch Shell themes.
- The theme metadata references external WhiteSur icon and Yaru cursor themes; do not silently bundle them.

## Change rules

- Treat `extensions/` and `themes/` as distributable source, not a mirror to update from the live desktop automatically. Review the diff before copying any new local version in.
- Keep machine-specific state out of the package. Use relative paths and `$HOME` only at runtime when resolving the installing user's own home directory.
- The installer must stay user-scoped, avoid `sudo`, preserve existing extension and theme directories through recoverable backups, and never rewrite the complete GNOME enabled-extension list.
- Never auto-enable HDR Scanout Helper or auto-change the active theme. If an enable option is added, make the behavior explicit and opt-in.
- Keep existing upstream notices intact. Update `THIRD_PARTY_NOTICES.md` whenever bundled upstream-derived code or theme assets change. The package-wide license is GPL-3.0; preserve third-party license boundaries and notices, especially WhiteSur's MIT terms and the embedded GNOME/LGPL notices.
- Do not modify Ubuntu system extensions or apply system patches as part of the normal installer.

## Documentation

Keep `README.md` in Chinese and English. Document prerequisites, install/backup behavior, extension activation, the Quick Power countdown consequence, the HDR color caveat, and upstream dependencies in both languages.

