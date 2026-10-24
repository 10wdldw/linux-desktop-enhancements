import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import NM from 'gi://NM';

import {QuickToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const HotspotToggle = GObject.registerClass(
class HotspotToggle extends QuickToggle {
  _init() {
    super._init({
      title: '热点',
      iconName: 'network-wireless-hotspot-symbolic',
      toggleMode: true,
    });
    this._client = null;
    this._clientId = 0;
    this._gone = false;
    NM.Client.new_async(null, (obj, res) => {
      try {
        const client = NM.Client.new_finish(res);
        // The toggle can be destroyed (extension disabled, e.g. on lock) while
        // the client is still loading: do not resurrect it then.
        if (this._gone)
          return;
        this._client = client;
        this._clientId = client.connect('notify::active-connections', () => this._sync());
        this._sync();
      } catch (e) {
        logError(e, 'hotspot nm client');
      }
    });
    this.connect('clicked', () => this._clicked());
    // Drop the NM.Client together with the toggle. Its signal closure holds `this`
    // and the toggle holds the client, so every enable()/disable() cycle used to
    // leak a whole NM object cache plus its D-Bus subscriptions, and the stale
    // client kept calling _sync() on a destroyed toggle.
    this.connect('destroy', () => {
      this._gone = true;
      if (this._client && this._clientId)
        this._client.disconnect(this._clientId);
      this._clientId = 0;
      this._client = null;
    });
  }

  _isAp(connection) {
    if (!connection)
      return false;
    const wireless = connection.get_setting_wireless?.();
    if (wireless && wireless.mode === 'ap')
      return true;
    const id = connection.get_id?.() || '';
    return id === 'Hotspot' || id === '热点';
  }

  _hotspotConnection() {
    if (!this._client)
      return null;
    return this._client.get_connections().find(c => this._isAp(c)) || null;
  }

  _activeHotspot() {
    if (!this._client)
      return null;
    for (const active of this._client.get_active_connections()) {
      if (this._isAp(active.get_connection?.()) ||
          active.get_id?.() === 'Hotspot' ||
          active.get_id?.() === '热点')
        return active;
    }
    return null;
  }

  _wifiDevice() {
    if (!this._client)
      return null;
    return this._client.get_devices().find(
      d => d.get_device_type() === NM.DeviceType.WIFI) || null;
  }

  _sync() {
    this.checked = !!this._activeHotspot();
    this.visible = !!(this._hotspotConnection() || this._wifiDevice());
  }

  _clicked() {
    if (!this._client)
      return;
    const active = this._activeHotspot();
    if (active) {
      this._client.deactivate_connection_async(active, null, null);
      return;
    }
    const connection = this._hotspotConnection();
    const device = this._wifiDevice();
    if (connection) {
      this._client.activate_connection_async(connection, device, null, null, null);
      return;
    }
    try {
      GLib.spawn_command_line_async('nmcli device wifi hotspot');
    } catch (e) {
      logError(e, 'hotspot start');
    }
  }
});

const HotspotIndicator = GObject.registerClass(
class HotspotIndicator extends SystemIndicator {
  _init() {
    super._init();
    this._indicator = this._addIndicator();
    this._indicator.icon_name = 'network-wireless-hotspot-symbolic';
    this._toggle = new HotspotToggle();
    this._toggle.bind_property('checked',
      this._indicator, 'visible',
      GObject.BindingFlags.SYNC_CREATE);
    this.quickSettingsItems.push(this._toggle);
  }
});

// Visibility overrides belong to one enable/disable lifetime.
function hideIndicatorTiles(indicator, hidden) {
  if (!indicator)
    return;
  for (const item of [indicator, ...(indicator.quickSettingsItems ?? [])]) {
    const record = {item, wasVisible: item.visible, destroyed: false};
    record.destroyId = item.connect('destroy', () => { record.destroyed = true; });
    record.id = item.connect('notify::visible', actor => {
      if (actor.visible)
        actor.visible = false;
    });
    hidden.push(record);
    item.hide();
  }
}

export function enableQuickSettings() {
  const qs = Main.panel.statusArea.quickSettings;
  const state = {indicator: null, hidden: []};
  if (!qs)
    return state;
  hideIndicatorTiles(qs._nightLight, state.hidden);
  hideIndicatorTiles(qs._powerProfiles, state.hidden);
  state.indicator = new HotspotIndicator();
  qs.addExternalIndicator(state.indicator);
  return state;
}

export function disableQuickSettings(state) {
  if (state?.indicator) {
    for (const item of state.indicator.quickSettingsItems)
      item.destroy();
    state.indicator.destroy();
    state.indicator = null;
  }
  for (const {item, id, destroyId, wasVisible, destroyed} of state?.hidden?.splice(0) ?? []) {
    if (destroyed)
      continue;
    item.disconnect(id);
    item.disconnect(destroyId);
    item.visible = wasVisible;
  }
}
