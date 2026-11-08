// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ResourceScope, SignalHub, SharedState} from './resources.js';

export class Runtime {
  constructor(extension) {
    this.extension = extension;
    this.settings = extension.getSettings();
    this.interface = Gio.Settings.new('org.gnome.desktop.interface');
    this.dockSettings = extension.getSettings('org.gnome.shell.extensions.linux-beautify.dock');
    this.hub = new SignalHub();
    this.scopes = new Map();
    this.pending = new Set();
    this.stats = {interfaceSettingsObjects: 1, newNetworkClients: 0, dockDiscoveryPolls: 0, fullInterfaceScans: 0, themeLoads: 0, focusSnapshots: 0, dockItemScans: 0, dockItemRequests: 0};
    this.clock = {
      timeout: (priority, ms, callback) => GLib.timeout_add(priority, ms, callback),
      idle: (priority, callback) => GLib.idle_add(priority, callback),
      remove: id => GLib.source_remove(id),
    };
  }

  scope(name) {
    if (!this.scopes.has(name)) this.scopes.set(name, new ResourceScope(this.clock, this.hub));
    return this.scopes.get(name);
  }

  appearance(scope, callback) { return scope.observe(this.interface, 'changed::color-scheme', callback); }

  observeFocus(scope, callback) {
    if (!this.focusState) {
      const owner = this.scope('focus');
      this.focusState = new SharedState(owner, () => {
        this.stats.focusSnapshots++;
        const focus = global.stage.get_key_focus();
        if (this.focusActor !== focus) {
          for (const stop of this.focusStops ?? []) stop();
          this.focusActor = focus;
          this.focusStops = [];
          if (focus instanceof Clutter.Actor) {
            const mapped = owner.observe(focus, 'notify::mapped', () => this.focusState.invalidate());
            const destroyed = owner.observe(focus, 'destroy', () => {
              mapped(); destroyed(); this.focusActor = null; this.focusStops = [];
              this.focusState?.invalidate();
            });
            this.focusStops = [mapped, destroyed];
          }
        }
        let entry = null;
        for (let actor = focus, depth = 0; actor && depth < 12; depth++, actor = actor.get_parent?.()) {
          if (actor instanceof St.Entry) { entry = actor; break; }
        }
        const editing = focus instanceof Clutter.Text && focus.get_editable() && focus.is_mapped() &&
          ![Clutter.InputContentPurpose.PASSWORD, Clutter.InputContentPurpose.PIN].includes(focus.get_input_purpose());
        return {focus, entry, editing, overviewVisible: Main.overview.visible};
      }, GLib.PRIORITY_DEFAULT_IDLE);
      owner.observe(global.stage, 'notify::key-focus', () => this.focusState.invalidate());
      for (const name of ['showing', 'shown', 'hiding', 'hidden'])
        owner.observe(Main.overview, name, () => this.focusState.invalidate());
    }
    return this.focusState.observe(scope, callback);
  }

  networkClient() {
    // Borrow Shell's existing NetworkManager client. Never start another one.
    const available = () => Main.panel.statusArea.quickSettings?._network?._client ?? null;
    const current = available();
    if (current) return Promise.resolve(current);
    if (this.networkRequest) return this.networkRequest;
    const request = new Promise(resolve => {
      this.pending.add(resolve);
      let tries = 0;
      this.scope('network').timeout(GLib.PRIORITY_DEFAULT, 50, () => {
        const client = available();
        if (!client && ++tries < 40) return GLib.SOURCE_CONTINUE;
        this.pending.delete(resolve); resolve(client);
        return GLib.SOURCE_REMOVE;
      });
    });
    this.networkRequest = request;
    request.then(() => { if (this.networkRequest === request) this.networkRequest = null; });
    return request;
  }

  snapshot() {
    return {...this.stats, interfaceSettingsObjects: this.interface ? 1 : 0,
      appearanceSignalConnections: this.interface ? (this.hub.objects.get(this.interface)?.size ?? 0) : 0, managedSignalConnections: this.hub.count(),
      focusSignalConnections: this.hub.objects.get(global.stage)?.has('notify::key-focus') ? 1 : 0,
      managedSources: [...this.scopes.values()].reduce((sum, scope) => sum + scope.sources.size, 0),
      pendingClients: this.pending.size, externalExtensionControllers: 0};
  }

  dispose() {
    for (const resolve of this.pending) resolve(null);
    this.pending.clear();
    for (const scope of this.scopes.values()) scope.dispose();
    this.focusState = null;
    this.focusActor = null;
    this.focusStops = [];
    this.networkRequest = null;
    this.interface = null;
    this.dockSettings = null;
    this.settings = null;
  }
}
