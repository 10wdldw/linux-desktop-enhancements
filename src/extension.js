// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Runtime} from './core/runtime.js';
import {DockManager} from './dock/docking.js';
import {Desktop} from './desktop/index.js';
import {setLanguage} from './desktop/i18n.js';
import Power from './features/power.js';
import Hdr from './features/hdr.js';
import {createInput} from './edition.js';

const LEGACY = ['ubuntu-dock@ubuntu.com', 'dash-to-dock@micxgx.gmail.com',
  'user-theme@gnome-shell-extensions.gcampax.github.com', 'macstyle-session@local',
  'kimpanel@kde.org', 'quick-power-countdown@local', 'hdr-scanout@local'];

export default class LinuxBeautify extends Extension {
  enable() {
    const legacy = this.metadata['beautify-edition'] === 'zh' ? LEGACY : LEGACY.filter(uuid => uuid !== 'kimpanel@kde.org');
    const overlapping = global.settings.get_strv('enabled-extensions').filter(uuid => legacy.includes(uuid));
    if (overlapping.length) throw new Error(`Disable overlapping extensions before enabling Linux Beautify: ${overlapping.join(', ')}`);
    try {
      this.runtime = new Runtime(this);
      const language = this.runtime.settings.get_string('language');
      setLanguage(language === 'default' ? this.metadata['default-language'] : language);
      // A library adapter, not an Extension instance or an extension-manager controller.
      const adapter = {uuid: this.uuid, path: `${this.path}/dock`, dir: this.dir.get_child('dock'),
        metadata: this.metadata, getSettings: () => this.runtime.dockSettings,
        openPreferences: () => this.openPreferences()};
      this.runtime.dockManager = new DockManager(adapter);
      this.desktop = new Desktop(this.runtime); this.desktop.enable();
      this.input = createInput(this.runtime); this.input?.enable();
      if (this.runtime.settings.get_boolean('quick-power-countdown')) {
        this.power = new Power(); this.power.enable();
      }
      if (this.runtime.settings.get_boolean('hdr-helper')) {
        this.hdr = new Hdr(); this.hdr.enable();
      }
      let testMethods = '';
      if (GLib.getenv('LINUX_BEAUTIFY_TEST_MODE') === '1') {
        testMethods = '<method name="TestFocus"/><method name="TestBlur"/><method name="TestDock"><arg type="s" direction="out"/></method><method name="TestFocusBurst"><arg type="i" direction="out"/></method><method name="TestWindow"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>';
      }
      this.diagnostics = Gio.DBusExportedObject.wrapJSObject(`<node><interface name="local.LinuxBeautify.Diagnostics">
        <method name="GetSnapshot"><arg type="s" direction="out"/></method>${testMethods}</interface></node>`, {
        GetSnapshot: () => JSON.stringify({...this.runtime.snapshot(),
          roundedWindows: global.get_window_actors().filter(actor => !!actor.rwcCustomData).length,
          shadowActors: global.get_window_actors().filter(actor => !!actor.rwcCustomData?.shadow).length,
          theme: this.desktop?._loadedTheme?.includes('MacStyle-Dark') ? 'dark' : 'light',
          magnifierAttached: !!this.desktop?._magnifier?._dock, dockStyle: this.runtime.dockManager.mainDock?.style_class, dockPosition: this.runtime.dockSettings.get_string('dock-position'),
          edition: this.metadata['beautify-edition'], dockInstances: DockManager.allDocks.length,
          input: this.input?.snapshot() ?? null, activeModules: ['dock', 'desktop', 'theme', ...(this.input ? ['input'] : [])]}),
        TestFocus: () => {
          this.testEntry?.destroy(); this.testEntry = new St.Entry({text: '', can_focus: true, width: 300, height: 50});
          Main.layoutManager.addTopChrome(this.testEntry); this.testEntry.set_position(100, 100);
          this.testEntry.grab_key_focus();
        },
        TestBlur: () => { global.stage.set_key_focus(null); this.testEntry?.destroy(); this.testEntry = null; },
        TestFocusBurst: () => {
          const before = this.runtime.stats.focusSnapshots;
          for (let i = 0; i < 40; i++) this.runtime.focusState?.invalidate();
          return before;
        },
        TestDock: () => {
          const magnifier = this.desktop._magnifier;
          const before = {...this.runtime.stats};
          let items;
          magnifier._itemsCache.run(() => { for (let i = 0; i < 20; i++) items = magnifier._items(); });
          const scans = this.runtime.stats.dockItemScans - before.dockItemScans;
          const requests = this.runtime.stats.dockItemRequests - before.dockItemRequests;
          if (items.length) magnifier._magnify(magnifier._centerX(items[0]));
          const enlarged = [...magnifier._motion.values()].some(state => state.targetScale > 1.11);
          magnifier._reset();
          return JSON.stringify({items: items.length, scans, requests, enlarged,
            cacheRetained: magnifier._itemsCache.values.size});
        },
        TestWindow: action => {
          const actor = global.get_window_actors().find(item => item.metaWindow.get_title() === 'Beautify functional validation');
          if (!actor) return JSON.stringify({found: false});
          const win = actor.metaWindow;
          if (action === 'minimize') win.minimize();
          else if (action === 'unminimize') win.unminimize();
          else if (action === 'maximize') win.maximize(Meta.MaximizeFlags.BOTH);
          else if (action === 'unmaximize') win.unmaximize(Meta.MaximizeFlags.BOTH);
          return JSON.stringify({found: true, rounded: !!actor.rwcCustomData,
            minimized: win.minimized, maximized: win.maximizedHorizontally && win.maximizedVertically});
        },
      });
      this.diagnostics.export(Gio.DBus.session, '/local/LinuxBeautify');
    } catch (error) { this.disable(); throw error; }
  }
  disable() {
    const errors = [];
    const cleanup = callback => { try { callback(); } catch (error) { errors.push(error); } };
    cleanup(() => { this.diagnostics?.unexport(); this.diagnostics = null; });
    cleanup(() => { this.testEntry?.destroy(); this.testEntry = null; });
    for (const key of ['hdr', 'power', 'input', 'desktop']) {
      cleanup(() => { this[key]?.disable(); this[key] = null; });
    }
    cleanup(() => this.runtime?.dockManager?.destroy());
    cleanup(() => this.runtime?.dispose());
    if (this.runtime && GLib.getenv('LINUX_BEAUTIFY_TEST_MODE') === '1')
      console.log(`LinuxBeautify cleanup ${JSON.stringify({...this.runtime.snapshot(), dockManagerReleased: !DockManager._singleton})}`);
    this.runtime = null;
    for (const error of errors) logError(error, 'LinuxBeautify cleanup');
  }
}
