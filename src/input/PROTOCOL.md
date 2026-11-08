# Native GNOME input module

`panel.js`, `state.js`, `engine.js` and `engine.py` are newly authored project code,
licensed GPL-3.0-or-later. They do not import or redistribute the JavaScript from
`gnome-shell-extension-kimpanel`; no second GNOME extension is installed.

The public protocol reference is Fcitx5 5.1.19's
[`src/ui/kimpanel`](https://github.com/fcitx/fcitx5/tree/5.1.19/src/ui/kimpanel)
and `src/frontend/ibusfrontend`, by CSSlayer / Fcitx contributors, LGPL-2.1-or-later.
The corresponding complete Ubuntu source package accompanies the embedded engine
under `resources/runtime/sources/`. The interface names are protocol identifiers,
not an indication that KDE or a separate Kimpanel GNOME extension is bundled.

- `org.fcitx.GnomeHelper` at `/org/fcitx/GnomeHelper`: keyboard group synchronization.
- `org.kde.impanel` and `org.kde.impanel2` at `/org/kde/impanel`: candidate/preedit
  updates, caret geometry, candidate selection and page navigation.
- `org.kde.kimpanel.inputmethod`: signals sent by the engine.

The Shell panel acquires `org.kde.impanel` only when a mapped editable Clutter.Text
has focus. On focus loss it releases the name and the single engine signal
subscription; Fcitx's classic/client-side UI handles application windows. Updates
within an idle turn share a single redraw. Relative caret updates are anchored to
the focused Shell entry; fine-grained text attributes and input-method property
menus are currently not rendered by this small panel. The engine's own UI still
handles normal application editing and its schema switcher.

The engine is a native process because Fcitx/Rime cannot run as GNOME Shell
JavaScript. The extension and autostart use the same launcher and per-user flock.
An existing Fcitx5 is reused; it is never replaced or signalled by this launcher.
If it lacks Rime, re-login after applying the integrated edition so the supplied
launcher owns startup. Disabling the extension stops only an engine it started;
an autostart-owned or pre-existing engine continues independently.
