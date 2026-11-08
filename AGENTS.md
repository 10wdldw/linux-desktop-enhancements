# Agent maintenance notes

This is a source-integrated GNOME Shell 50 project, not an installer/controller for
multiple extensions. Both editions have exactly one UUID: `linux-beautify@local`.

- `src/extension.js` is the only Shell entry point. `src/core/` owns shared resources;
  `src/dock/` is the attributed upstream library; `src/desktop/` implements desktop,
  theme, magnification and rounded windows. Power/HDR are optional plain modules.
- Chinese `src/input/` adds a native D-Bus panel and embedded Fcitx5/Rime launcher.
  Do not reintroduce another Kimpanel extension or import its GPL-2 implementation.
  English builds exclude the entire input module and engine/dictionary payload.
- The user's latest requirement explicitly authorizes embedding an actual input
  engine. Use official pinned packages and corresponding source, never the user's
  patched installed binaries. Preserve all component notices and hashes.
- Shared immutable themes/dictionaries live once under the installed extension;
  conventional XDG resource locations use symlinks. Mutable configuration, learned
  words and personal phrases remain ordinary user-owned files.
- Every GObject registration must use a unique explicit `LinuxBeautify...`
  GTypeName. Disabling a legacy extension does not unregister its types. Test
  migration after legacy modules have actually loaded, not just clean startup.
- No machine backups, configuration dumps, installed extension trees, drive UUIDs,
  learned dictionaries, sync/session IDs or separate cursor project in releases.
- No sudo, system extension changes, global library paths or rewriting the entire
  enabled-extension list. Disable only overlapping known UUIDs, record old states,
  and restore them on uninstall. Fail before double-loading overlapping Shell hooks.
- Resource install is passive. `--apply` opts into presets and activation; English
  also sets the current user's GNOME language to en_US.UTF-8 as requested. Record
  and restore the prior account language. Chinese language changes are explicit.
- The current desktop preset enables the three-second end-session countdown;
  document this default and preserve inhibitors. HDR remains off by default.
  Never invoke real logout/power actions or turn on the HDR flag for tests.
- Back up replaced files, roll back failed transactions, preserve modified installed
  files on forced uninstall, and support layered edition replacement.
- Tests must use temporary HOME, private D-Bus/settings and headless GNOME. Do not
  install into the live desktop or redeploy the user's actual Rime data to test.
  AccountsService uses the host system bus: headless migration test packages must
  disable account-language presets. Language transactions are tested with mocks.
- Keep bilingual docs and THIRD_PARTY_NOTICES accurate. Run installer, shared resource,
  localization, headless runtime and embedded-engine input tests before release.
