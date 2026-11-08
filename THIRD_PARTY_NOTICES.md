# Third-party sources and licenses

The integrated GNOME extension and original project changes are distributed under
GPL-3.0 (new files specify GPL-3.0-or-later). Upstream copyright and license terms
are retained. The top-level license does not replace component licenses.

## Integrated Dock library

`src/dock/` derives from [Dash to Dock / Ubuntu Dock](https://github.com/micheleg/dash-to-dock),
Ubuntu Dock branch commit **3218a87ce099a70dd696b9e633c09e7f06b1d425** (version 105),
by Michele G, Florian Müllner and the upstream contributors. Upstream's README
permits GPL version 2 **or later**; `COPYING` preserves the GPL-2 text. Some files
retain additional notices, including the BSD-1-Clause terms of
`desktopIconsIntegration.js`. See `src/dock/SOURCE.json`.

This project removes the standalone extension entry point, metadata and settings
window; renames its settings schema to `org.gnome.shell.extensions.linux-beautify.dock`;
uses one DockManager owned by the main extension; and supplies shared assets,
translations and one stylesheet. No installed Ubuntu system-extension tree was
copied. The build excludes unused optional source/media from runtime only.

## Desktop integration and rounded windows

`src/desktop/` adapts the user's MacStyle desktop implementation. The rounded-window
code in `src/desktop/rwc/` derives from
[flexagoon / Rounded Window Corners](https://github.com/flexagoon/rounded-window-corners),
GPL-3.0. The upstream notice remains in `rwc/UPSTREAM.md`; the complete license is
`licenses/Rounded-Window-Corners-GPL-3.0.txt`. That original local snapshot did not
retain its upstream commit; none is guessed.

Project changes introduce shared settings/signals, event-driven Dock attachment,
focus-only input discovery, theme lifecycle restoration and a borrowed Shell
NetworkManager client. Machine-specific drive pinning was removed. Optional
power-countdown/HDR features are internal project modules, disabled by default.
Version 3.1.0 additionally coalesces shared focus snapshots and candidate updates,
caches Dock item enumeration within one call/frame, avoids unchanged hit-region
updates and caches rounded-corner uniforms per effect instance.

## Themes

`themes/MacStyle-Light` and `themes/MacStyle-Dark` are local adaptations whose metadata
matches [WhiteSur GTK Theme](https://github.com/vinceliuice/WhiteSur-gtk-theme), MIT,
by vinceliuice and contributors. The local copy did not retain an upstream commit.
`licenses/WhiteSur-MIT.txt` and embedded GNOME/LGPL stylesheet notices are retained.
WhiteSur icons, the separate cursor project and user-specific theme dumps are not
bundled. Pure-color Fcitx skin templates under `input-method/` are original project
configuration, with no imported third-party PNG skin artwork.

## Embedded input engine — Chinese edition

The Chinese edition embeds **Fcitx5 5.1.19**, **fcitx5-rime 5.1.13**, **librime 1.16.1**,
Lua/character-code plugins and GTK/Qt input frontends. These are native dynamic
components, not another GNOME extension. Original sources:

- [Fcitx5](https://github.com/fcitx/fcitx5), CSSlayer / Fcitx contributors, primarily LGPL-2.1-or-later.
- [fcitx5-rime](https://github.com/fcitx/fcitx5-rime), primarily LGPL-2.1-or-later.
- [librime](https://github.com/rime/librime), RIME Developers, BSD-3-Clause, with additional plugin notices.
- [Fcitx GTK](https://github.com/fcitx/fcitx5-gtk) and [Fcitx Qt](https://github.com/fcitx/fcitx5-qt), with per-file LGPL/BSD notices.

`vendor/input-runtime/SOURCE.json` records all **34 official Ubuntu 26.04 amd64
binary packages**, their versions/archive paths/SHA-256 values, and **19 matching
source packages**. Complete corresponding upstream archives, Debian patches and
build descriptions accompany the runtime under `resources/runtime/sources/`.
All binary-package copyright notices remain under `resources/runtime/usr/share/doc/`;
standard license texts are in `usr/share/common-licenses/`. This includes the terms
for OpenCC, yaml-cpp, LevelDB, Marisa, glog/gflags, Lua, XCB helper libraries and
Rime Prelude. Consult those copyright files for each component's authors and terms.

`scripts/vendor_input_runtime.py` downloads and verifies official archive payloads,
not installed/local patched binaries. Toolkit modules receive only a relative
`$ORIGIN/../../..` RUNPATH via patchelf; modified hashes are recorded separately.
Unused spelling/emoji/test/lua-addon-loader modules and dangling documentation links
are omitted. No engine source patch is applied. Fcitx's runtime library paths are
scoped to its child process; toolkit-module RUNPATH allows dynamic relinking without
setting an application-wide LD_LIBRARY_PATH. System glibc, graphics, GTK/Qt and desktop
services remain the host platform ABI, not private copies.

## Native input panel and Rime Ice — Chinese edition

`src/input/` is original project code implementing Fcitx's documented/public D-Bus
interfaces; see `PROTOCOL.md` for its reference and limitations. The earlier
independent GPL-2 Kimpanel GNOME implementation is **not included or imported**.

`vendor/rime-ice/` is a reviewed source-only snapshot of
[Rime Ice / 雾凇拼音](https://github.com/iDvel/rime-ice), by Dvel and contributors,
GPL-3.0. Its original license, README, file attribution and `SOURCE.json` remain;
`licenses/Rime-Ice-GPL-3.0.txt` preserves the full license. The exact original
snapshot commit is unknown. Dictionary and Lua/OpenCC sources are included;
learned user databases, sync records and personal phrases are excluded.
`custom_phrase.txt` is an empty distribution template and is never installed over
an existing personal phrase file. Mutable input overrides are original project
presets. The English edition contains no input module, engine or dictionary data.
