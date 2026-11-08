# Integrated architecture / 源码整合结构

```text
linux-beautify@local/             one metadata.json / extension.js / prefs.js
  core/                          shared settings, signal hub, scoped timers
  dock/                          attributed Dash-to-Dock library, one DockManager
  desktop/                       themes, magnifier, app actions, rounded windows
  features/                      optional power/HDR plain modules
  schemas/                       plugin-owned settings and Dock namespace
  themes/                        one stored copy of each light/dark theme
  input/                         Chinese edition only: native panel and launcher
  resources/                     Chinese edition only
    runtime/usr/                 Fcitx5/Rime/frontends + native dependencies
    runtime/sources/             exact corresponding source/build archives
    rime/                        one copy of distributed schemas/dictionaries
    input-method/                authored skins and mutable config templates
```

## Resource ownership

The single entry point creates a Runtime, DockManager, Desktop and, in Chinese,
IntegratedInput. Disable reverses that lifecycle and disposes pending managed
signals/timers. A failed enable cleans up partially initialized components.

SignalHub uses one native connection for a given object/signal even when several
internal modules subscribe. Desktop and magnifier share the same interface settings
object and color-scheme connection. Input focus observation and overview callbacks
share the same hub. One-shot sources remove themselves from tracking; disposing a
scope cancels outstanding work. Upstream Dock's own internal signals remain owned
by its existing lifecycle helpers; runtime diagnostics count only the explicitly
managed shared resources, not every GObject in Shell.

SharedState merges focus/overview/mapped bursts into one focus snapshot. Chinese
desktop input enhancement and the native panel consume the same snapshot; English
does not create that observer. Candidate revisions suppress identical protocol
content, while position-only changes reuse candidate widgets. TurnCache shares a
Dock item list within one synchronous pointer/frame call, invalidates on structural
changes and clears on return. Coordinates are not cached across frames. Shader
uniform values are cached per effect. Subscriber failures are isolated; partial
desktop initialization uses the entry point's rollback.

The magnifier receives DockManager.mainDock and listens to docks-ready, replacing
periodic actor-tree discovery. Input checking follows the current key-focus actor
rather than rescanning every Shell actor. Hotspot UI borrows Shell's existing
NetworkManager client instead of creating another. There are no per-feature
Extension objects and no feature-level extension-manager enable calls.

The complete installer writes immutable resources once under the extension; GTK,
Fcitx skins and distributed Rime files link there. Mutable presets/phrases are copied.
Rime output/user databases stay in the user data directory. The engine is native,
so it runs as one separate process using scoped loader paths. The shared launcher
uses flock and D-Bus ownership to reuse an existing instance and only signals its
own child. All component copyrights and corresponding engine sources are retained.

## Editions and diagnostics

Build-time edition.js selects the internal input factory. English deletes input/
and never copies input runtime/dictionaries; Chinese adds the full implementation.
Both use the same UUID and shared desktop/theme sources.

A read-only `/local/LinuxBeautify` interface on Shell's existing session bus exposes
`local.LinuxBeautify.Diagnostics.GetSnapshot`, returning JSON resource counts.
Focus test methods are exported only when `LINUX_BEAUTIFY_TEST_MODE=1` was present
when the extension was enabled. Tests use that flag in a private headless session.
These counts prove specific duplicate work was removed; they are not CPU/RSS
benchmarks or a guarantee about all upstream/native allocations.
