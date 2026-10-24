import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as AppMenu from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import {DockMagnifier} from './magnifier.js';
import {enableQuickSettings, disableQuickSettings} from './qs.js';
import {enableEffect as enableRoundedCorners, disableEffect as disableRoundedCorners} from './rwc/manager/event_manager.js';

const DESKTOP_MENU_LABEL = '添加到桌面';
const APP_RENAME_LABEL = '重命名';
const APP_GRID_ICON_SIZE = 72;
const APP_GRID_ICON_TEXTURE_SIZE = APP_GRID_ICON_SIZE * 2;
const APP_GRID_ICON_RADIUS = 18;

function _entryText(entry) {
  return entry?.get_clutter_text?.() ?? entry?.clutter_text ?? null;
}

function _entryIsLive(entry) {
  if (!entry || entry._macImeDestroyed)
    return false;
  try {
    return !!entry.get_stage?.();
  } catch (_) {
    return false;
  }
}

function _configureImeEntry(entry, grab = true) {
  if (!_entryIsLive(entry))
    return;
  const text = _entryText(entry);
  if (!text)
    return;

  try {
    entry.can_focus = true;
    entry.reactive = true;
    text.editable = true;
    text.single_line_mode = true;
    // The GObject property path mis-marshals input hints as an enum in Shell
    // 50. Use Clutter's typed setters to avoid a critical on each focus change.
    text.set_input_purpose(Clutter.InputContentPurpose.NORMAL);
    text.set_input_hints(Clutter.InputContentHintFlags.NONE);
    if (grab) {
      entry.grab_key_focus();
      text.grab_key_focus();
    }
    try { Main.inputMethod?.setFocus?.(text); } catch (_) {}
    // Focus-in normally performs this update, but folder renaming changes
    // the reactive actor during an animation; refresh the shell's IBus
    // content type explicitly after the text actor is focused.
    Main.inputMethod?.update?.();
  } catch (e) {
    logError(e, 'IME entry setup');
  }
}

function _focusImeEntryLater(entry) {
  if (!entry)
    return;
  if (!entry._macImeDestroyHooked) {
    entry._macImeDestroyHooked = true;
    entry._macImeDestroyed = false;
    entry.connect('destroy', () => entry._macImeDestroyed = true);
  }
  _configureImeEntry(entry);

  // ModalDialog and the folder dialog both grab focus after their entry is
  // created. Re-apply the normal text-input mode after those grabs so Fcitx5
  // can keep the preedit and commit Chinese text into the entry.
  GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
    if (_entryIsLive(entry))
      _configureImeEntry(entry);
    return GLib.SOURCE_REMOVE;
  });
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
    if (_entryIsLive(entry))
      _configureImeEntry(entry);
    return GLib.SOURCE_REMOVE;
  });
  // AppFolderDialog switches from the label to the entry with a 300 ms
  // opacity/reaction transition. Grab focus once more after that transition
  // so IBus/Fcitx5 can attach its preedit to the actual ClutterText.
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 360, () => {
    if (_entryIsLive(entry))
      _configureImeEntry(entry);
    return GLib.SOURCE_REMOVE;
  });
}

function _desktopFileName(text) {
  return (text || '应用').replace(/[\\/:*?"<>|]/g, '_').trim() || '应用';
}

function _addAppToDesktop(app) {
  const appInfo = app?.app_info;
  const sourcePath = appInfo?.get_filename?.();
  if (!sourcePath)
    return;

  const desktopPath = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP) ||
    GLib.build_filenamev([GLib.get_home_dir(), 'Desktop']);
  const desktopDir = Gio.File.new_for_path(desktopPath);
  if (!desktopDir.query_exists(null))
    desktopDir.make_directory_with_parents(null);

  const title = appInfo.get_name?.() || app.get_name?.() || '应用';
  const stem = _desktopFileName(title);
  let destination = desktopDir.get_child(`${stem}.desktop`);
  let suffix = 2;
  while (destination.query_exists(null))
    destination = desktopDir.get_child(`${stem} (${suffix++}).desktop`);

  try {
    Gio.File.new_for_path(sourcePath).copy(
      destination, Gio.FileCopyFlags.NONE, null, null);
    try {
      destination.set_attribute_uint32(
        'unix::mode', 0o755, Gio.FileQueryInfoFlags.NONE, null);
    } catch (_) {}
    try {
      destination.set_attribute_boolean(
        'metadata::trusted', true, Gio.FileQueryInfoFlags.NONE, null);
    } catch (_) {}
  } catch (e) {
    logError(e, `copy ${sourcePath} to desktop`);
  }
}

function _appOverridePath(app) {
  const appInfo = app?.app_info;
  const sourcePath = appInfo?.get_filename?.();
  let fileName = sourcePath ? GLib.path_get_basename(sourcePath) : appInfo?.get_id?.();
  if (!fileName)
    return null;
  if (!fileName.endsWith('.desktop'))
    fileName += '.desktop';
  fileName = fileName.replace(/[\\/:*?"<>|]/g, '_');
  return GLib.build_filenamev([
    GLib.get_user_data_dir(), 'applications', fileName,
  ]);
}

function _desktopNameValue(name) {
  return String(name || '').replace(/\\/g, '\\\\').replace(/[\r\n]/g, ' ');
}

function _replaceDesktopName(contents, name) {
  const lines = String(contents).split('\n');
  const start = lines.findIndex(line => line.trim() === '[Desktop Entry]');
  if (start < 0)
    return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[.*\]\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }

  const value = _desktopNameValue(name);
  let nameIndex = -1;
  let localeIndex = -1;
  for (let i = start + 1; i < end; i++) {
    if (nameIndex < 0 && /^\s*Name=/.test(lines[i]))
      nameIndex = i;
    if (localeIndex < 0 && /^\s*Name\[zh_CN(?:[.@][^\]]+)?\]=/.test(lines[i]))
      localeIndex = i;
  }

  if (nameIndex < 0) {
    lines.splice(start + 1, 0, `Name=${value}`);
    nameIndex = start + 1;
    end++;
  } else {
    lines[nameIndex] = `Name=${value}`;
  }

  if (localeIndex < 0)
    lines.splice(nameIndex + 1, 0, `Name[zh_CN]=${value}`);
  else
    lines[localeIndex] = `Name[zh_CN]=${value}`;

  return lines.join('\n');
}

function _renameApp(app, name) {
  const appInfo = app?.app_info;
  const sourcePath = appInfo?.get_filename?.();
  const destinationPath = _appOverridePath(app);
  const cleanName = String(name || '').trim();
  if (!destinationPath || !cleanName)
    return false;

  try {
    const applicationsDir = Gio.File.new_for_path(
      GLib.build_filenamev([GLib.get_user_data_dir(), 'applications']));
    if (!applicationsDir.query_exists(null))
      applicationsDir.make_directory_with_parents(null);

    const destination = Gio.File.new_for_path(destinationPath);
    if (!destination.query_exists(null) && sourcePath) {
      Gio.File.new_for_path(sourcePath).copy(
        destination, Gio.FileCopyFlags.NONE, null, null);
      try {
        destination.set_attribute_uint32(
          'unix::mode', 0o644, Gio.FileQueryInfoFlags.NONE, null);
      } catch (_) {}
    }

    const [ok, bytes] = destination.load_contents(null);
    if (!ok)
      return false;
    const oldContents = new TextDecoder('utf-8').decode(bytes);
    const newContents = _replaceDesktopName(oldContents, cleanName);
    if (newContents === null)
      return false;
    if (newContents !== oldContents)
      GLib.file_set_contents(destinationPath, newContents);

    // Re-read desktop entries immediately so the new localized name appears
    // in the grid without requiring a shell restart.
    Shell.AppSystem.get_default().reload();
    return true;
  } catch (e) {
    logError(e, `rename application ${destinationPath}`);
    return false;
  }
}

export default class MacStyleSession extends Extension {
  enable() {
    this._patchLaunchAnimation();
    this._patchAppMenu();
    this._patchAppLabels();
    this._patchAppGrid();
    this._patchImeEntries();
    this._iface = Gio.Settings.new('org.gnome.desktop.interface');
    this._schemeId = this._iface.connect('changed::color-scheme', () => {
      this._loadShellTheme();
    });
    this._loadShellTheme();
    try {
      this._magnifier = new DockMagnifier();
      this._magnifier.enable();
    } catch (e) {
      logError(e, 'dock magnifier');
      this._magnifier = null;
    }
    try {
      this._qs = enableQuickSettings();
    } catch (e) {
      logError(e, 'quick settings');
      this._qs = null;
    }
    try {
      enableRoundedCorners();
      this._rounded = true;
    } catch (e) {
      logError(e, 'rounded corners');
      this._rounded = false;
    }
  }

  disable() {
    this._renameDialog?.close?.();
    this._renameDialog = null;
    this._unpatchImeEntries();
    this._unpatchAppMenu();
    this._unpatchAppLabels();
    this._unpatchAppGrid();
    this._unpatchLaunchAnimation();
    if (this._rounded) {
      try {
        disableRoundedCorners();
      } catch (e) {
        logError(e, 'rounded corners disable');
      }
      this._rounded = false;
    }
    try {
      disableQuickSettings(this._qs);
    } catch (e) {
      logError(e, 'quick settings disable');
    }
    this._qs = null;
    this._magnifier?.disable();
    this._magnifier = null;
    if (this._schemeId && this._iface) {
      this._iface.disconnect(this._schemeId);
    }
    this._schemeId = 0;
    this._iface = null;
    Main.setThemeStylesheet(null);
    Main.loadTheme();
  }

  // Clicking a dock icon zoomed a ghost copy of it across the screen before
  // the window showed up. Drop the animation so the click opens straight away.
  _patchLaunchAnimation() {
    const proto = AppDisplay.AppIcon.prototype;
    if (proto._macOrigAnimateLaunch)
      return;
    proto._macOrigAnimateLaunch = proto.animateLaunch;
    proto._macOrigAnimateLaunchAtPos = proto.animateLaunchAtPos;
    proto.animateLaunch = function () {};
    proto.animateLaunchAtPos = function () {};
  }

  _unpatchLaunchAnimation() {
    const proto = AppDisplay.AppIcon.prototype;
    if (!proto._macOrigAnimateLaunch)
      return;
    proto.animateLaunch = proto._macOrigAnimateLaunch;
    proto.animateLaunchAtPos = proto._macOrigAnimateLaunchAtPos;
    delete proto._macOrigAnimateLaunch;
    delete proto._macOrigAnimateLaunchAtPos;
  }

  _patchAppMenu() {
    const proto = AppMenu.AppMenu.prototype;
    if (proto._macOrigSetApp)
      return;

    const extension = this;
    proto._macOrigSetApp = proto.setApp;
    proto.setApp = function (app) {
      this._macOrigSetApp(app);
      if (!this._macDesktopItem)
        this._macDesktopItem = this.addAction(DESKTOP_MENU_LABEL,
          () => _addAppToDesktop(this._app));
      this._macDesktopItem.visible = !!this._app?.app_info?.get_filename?.();
      if (!this._macRenameItem)
        this._macRenameItem = this.addAction(APP_RENAME_LABEL,
          () => extension._openRenameDialog(this._app));
      this._macRenameItem.visible = !!this._app?.app_info?.get_filename?.();
    };
  }

  _unpatchAppMenu() {
    const proto = AppMenu.AppMenu.prototype;
    if (!proto._macOrigSetApp)
      return;
    proto.setApp = proto._macOrigSetApp;
    delete proto._macOrigSetApp;
  }

  _openRenameDialog(app) {
    if (!app?.app_info?.get_filename?.())
      return;

    this._renameDialog?.close?.();
    const dialog = new ModalDialog.ModalDialog({
      styleClass: 'macstyle-rename-dialog',
    });
    this._renameDialog = dialog;

    const entry = new St.Entry({
      style_class: 'macstyle-rename-entry',
      can_focus: true,
      reactive: true,
      x_expand: true,
    });
    entry.set_text(app.get_name?.() || app.app_info.get_name?.() || '');
    dialog.contentLayout.add_child(entry);

    let finished = false;
    const finish = save => {
      if (finished)
        return;
      finished = true;
      const name = entry.get_text?.() ?? entry.text ?? '';
      dialog.close();
      if (this._renameDialog === dialog)
        this._renameDialog = null;
      if (save)
        _renameApp(app, name);
    };

    dialog.setButtons([
      {label: '取消', action: () => finish(false), key: Clutter.KEY_Escape},
      {label: '确定', action: () => finish(true), key: Clutter.KEY_Return},
    ]);
    const text = _entryText(entry);
    text?.connect('activate', () => finish(true));
    dialog.open(global.get_current_time());
    _focusImeEntryLater(entry);
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      if (_entryIsLive(entry))
        _entryText(entry)?.set_selection(0, -1);
      return GLib.SOURCE_REMOVE;
    });
  }

  _patchImeEntries() {
    this._imeEnabled = true;
    this._imeEntryHooks = new Map();
    this._imeOverviewIds = [];
    this._imeScanSources = [];
    const rescan = () => {
      for (const source of this._imeScanSources)
        GLib.source_remove(source);
      this._imeScanSources = [];
      this._scanImeEntries();
      for (const delay of [120, 360]) {
        const source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
          // A fired source is gone: forget its id. Otherwise the list grew by 8
          // per overview opening and disable() then removed every stale id again
          // (a GLib-CRITICAL "Source ID not found" each: 80+ per boot in the journal).
          this._imeScanSources = this._imeScanSources.filter(s => s !== source);
          this._scanImeEntries();
          return GLib.SOURCE_REMOVE;
        });
        this._imeScanSources.push(source);
      }
    };
    for (const signal of ['showing', 'shown'])
      this._imeOverviewIds.push(Main.overview.connect(signal, rescan));
    const folderProto = AppDisplay.AppFolderDialog.prototype;
    if (!folderProto._macOrigShowImeEntry) {
      folderProto._macOrigShowImeEntry = folderProto._showFolderEntry;
      const extension = this;
      folderProto._showFolderEntry = function (...args) {
        folderProto._macOrigShowImeEntry.apply(this, args);
        extension._hookImeEntry(this._entry);
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          if (extension._imeEnabled)
            extension._hookImeEntry(this._entry);
          return GLib.SOURCE_REMOVE;
        });
      };
    }
    rescan();
  }

  _scanImeEntries() {
    const visit = actor => {
      if (!actor)
        return;
      try {
        if (actor instanceof St.Entry)
          this._hookImeEntry(actor);
        for (const child of actor.get_children?.() ?? [])
          visit(child);
      } catch (_) {}
    };
    visit(Main.layoutManager.uiGroup);
  }

  _hookImeEntry(entry) {
    if (!this._imeEnabled || !entry || this._imeEntryHooks?.has(entry))
      return;
    const text = _entryText(entry);
    const refresh = () => {
      if (entry.has_key_focus || text?.has_key_focus)
        _configureImeEntry(entry, false);
    };
    const record = {entry, text, ids: []};
    // Remember which object each handler id belongs to (see _unpatchImeEntries).
    try { record.ids.push([entry, entry.connect('key-focus-in', refresh)]); } catch (_) {}
    try { record.ids.push([entry, entry.connect('notify::mapped', refresh)]); } catch (_) {}
    if (text) {
      try { record.ids.push([text, text.connect('key-focus-in', refresh)]); } catch (_) {}
    }
    try {
      record.destroyId = entry.connect('destroy', () => this._imeEntryHooks?.delete(entry));
    } catch (_) {}
    this._imeEntryHooks?.set(entry, record);
    refresh();
  }

  _unpatchImeEntries() {
    this._imeEnabled = false;
    const folderProto = AppDisplay.AppFolderDialog.prototype;
    if (folderProto._macOrigShowImeEntry) {
      folderProto._showFolderEntry = folderProto._macOrigShowImeEntry;
      delete folderProto._macOrigShowImeEntry;
    }
    for (const source of this._imeScanSources ?? []) {
      try { GLib.source_remove(source); } catch (_) {}
    }
    for (const id of this._imeOverviewIds ?? []) {
      try { Main.overview.disconnect(id); } catch (_) {}
    }
    for (const [entry, record] of this._imeEntryHooks ?? []) {
      // Disconnect each id on the object that owns it. Trying both entry and text
      // for every id made one of the two fail each time ("instance has no handler
      // with id" GLib-GObject-CRITICAL, 70+ per boot in the journal).
      for (const [object, id] of record.ids ?? []) {
        try { object.disconnect(id); } catch (_) {}
      }
      try { if (record.destroyId) entry.disconnect(record.destroyId); } catch (_) {}
    }
    this._imeEntryHooks?.clear();
    this._imeOverviewIds = [];
    this._imeScanSources = [];
  }

  _patchAppGrid() {
    this._gridIcons = new Map();
    // Keep the AppGrid constructor native. Only increase the texture and
    // visible icon after GNOME has created the AppIcon, so Show Applications
    // keeps its normal pagination and never becomes empty during reload.
    this._restoreAppIconCreate(true);

    const visit = actor => {
      if (!actor)
        return;
      try {
        if (actor instanceof AppDisplay.AppIcon)
          this._styleAppGridIcon(actor.icon?.icon);
        for (const child of actor.get_children?.() ?? [])
          visit(child);
      } catch (_) {}
    };
    visit(Main.layoutManager.uiGroup);
  }

  _styleAppGridIcon(icon, originalSize = null) {
    if (!(icon instanceof St.Icon))
      return;
    this._gridIcons ??= new Map();
    if (!this._gridIcons.has(icon)) {
      const size = originalSize ?? icon.icon_size ?? APP_GRID_ICON_SIZE;
      const original = {
        size,
        style: icon.style,
        clip: icon.clip_to_allocation,
        destroyed: false,
      };
      original.destroyId = icon.connect('destroy', () => {
        original.destroyed = true;
        this._gridIcons?.delete(icon);
      });
      this._gridIcons.set(icon, original);
    }
    icon.set_icon_size(APP_GRID_ICON_SIZE);
    icon.set_size(APP_GRID_ICON_SIZE, APP_GRID_ICON_SIZE);
    icon.clip_to_allocation = true;
    icon.set_style(`border-radius: ${APP_GRID_ICON_RADIUS}px; overflow: hidden;`);
  }

  _restoreAppIconCreate(styleGrid = false) {
    const iconProto = AppDisplay.AppIcon.prototype;
    // Keep the native GNOME Shell 50 factory in one marker so enable/disable
    // and extension reloads never stack another wrapper on top of it. Keeping
    // this hook limited to the returned texture avoids wrapping AppIcon._init,
    // which is also used during the overview teardown.
    if (!styleGrid && !iconProto._macNativeCreateIcon && !iconProto._macGridWrapper)
      return;
    if (!iconProto._macNativeCreateIcon)
      iconProto._macNativeCreateIcon = iconProto._createIcon;
    if (!styleGrid) {
      for (const [icon, original] of this._gridIcons ?? []) {
        if (original.destroyed)
          continue;
        if (!(icon instanceof St.Icon))
          continue;
        try {
          icon.set_icon_size(original.size);
          icon.set_style(original.style);
          icon.clip_to_allocation = original.clip;
          icon.disconnect(original.destroyId);
        } catch (_) {}
      }
      this._gridIcons?.clear();
      iconProto._createIcon = iconProto._macNativeCreateIcon;
      delete iconProto._macGridWrapper;
      delete iconProto._macNativeCreateIcon;
      return;
    }
    const extension = this;
    const nativeCreateIcon = iconProto._macNativeCreateIcon;
    iconProto._createIcon = iconProto._macGridWrapper = function (size) {
      const requestedSize = Number(size) > 0 ? Number(size) : APP_GRID_ICON_SIZE;
      // Upload at 2x and display at 72px. This keeps the enlarged grid icon
      // crisp instead of stretching the original low-resolution texture.
      const icon = nativeCreateIcon.call(this,
        Math.max(requestedSize, APP_GRID_ICON_TEXTURE_SIZE));
      // App grid icons have a real Shell.App; Ubuntu Dock's Show Apps button
      // reuses AppIcon methods but has no application object of its own.
      if (styleGrid && icon) {
        extension._styleAppGridIcon(icon, requestedSize);
      }
      return icon;
    };
  }

  _unpatchAppGrid() {
    const gridProto = AppDisplay.AppGrid.prototype;
    if (gridProto._macOrigInit) {
      gridProto._init = gridProto._macOrigInit;
      delete gridProto._macOrigInit;
    }
    this._restoreAppIconCreate(false);
  }

  _configureAppLabel(appIcon) {
    const label = appIcon?.icon?.label;
    const text = label?.clutter_text;
    if (!label || !text)
      return;

    try {
      text.set({
        line_wrap: true,
        line_wrap_mode: Pango.WrapMode.WORD_CHAR,
        ellipsize: Pango.EllipsizeMode.NONE,
      });
      label.x_expand = true;
      label.x_align = Clutter.ActorAlign.CENTER;
      label.add_style_class_name('macstyle-full-app-label');
      if (this._fullAppLabels && !this._fullAppLabels.has(label)) {
        const id = label.connect('destroy', () => this._fullAppLabels?.delete(label));
        this._fullAppLabels.set(label, id);
      }
    } catch (_) {}
  }

  _patchAppLabels() {
    const proto = AppDisplay.AppIcon.prototype;
    if (proto._macOrigUpdateMultiline || proto._macOrigInitFullLabels)
      return;

    this._fullAppLabels = new Map();
    const extension = this;
    proto._macOrigUpdateMultiline = proto._updateMultiline;
    proto._updateMultiline = function (...args) {
      proto._macOrigUpdateMultiline.apply(this, args);
      extension._configureAppLabel(this);
    };
    proto._macOrigInitFullLabels = proto._init;
    proto._init = function (...args) {
      proto._macOrigInitFullLabels.apply(this, args);
      extension._configureAppLabel(this);
    };

    // The overview may already own AppIcon instances when the extension is
    // reloaded. Configure those existing labels too, instead of waiting for
    // the next hover event or overview rebuild.
    const visit = actor => {
      if (!actor)
        return;
      try {
        if (actor instanceof AppDisplay.AppIcon)
          extension._configureAppLabel(actor);
        for (const child of actor.get_children?.() ?? [])
          visit(child);
      } catch (_) {}
    };
    visit(Main.layoutManager.uiGroup);
  }

  _unpatchAppLabels() {
    const proto = AppDisplay.AppIcon.prototype;
    if (proto._macOrigUpdateMultiline) {
      proto._updateMultiline = proto._macOrigUpdateMultiline;
      delete proto._macOrigUpdateMultiline;
    }
    if (proto._macOrigInitFullLabels) {
      proto._init = proto._macOrigInitFullLabels;
      delete proto._macOrigInitFullLabels;
    }
    for (const [label, id] of this._fullAppLabels ?? []) {
      label.disconnect(id);
      label.remove_style_class_name('macstyle-full-app-label');
    }
    this._fullAppLabels?.clear();
    this._fullAppLabels = null;
  }

  _loadShellTheme() {
    const dark = this._iface.get_string('color-scheme') === 'prefer-dark';
    const name = dark ? 'MacStyle-Dark' : 'MacStyle-Light';
    const path = `${GLib.get_home_dir()}/.local/share/themes/${name}/gnome-shell/gnome-shell.css`;
    const file = Gio.File.new_for_path(path);
    if (!file.query_exists(null))
      return;
    Main.setThemeStylesheet(path);
    Main.loadTheme();
  }
}
