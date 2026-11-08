import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import NM from 'gi://NM';

import {QuickToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {translate as _} from './i18n.js';

const HotspotToggle = GObject.registerClass({GTypeName: 'LinuxBeautifyHotspotToggle'},
class HotspotToggle extends QuickToggle {
  _init(context) {
    super._init({
      title: _('Hotspot'),
      iconName: 'network-wireless-hotspot-symbolic',
      toggleMode: true,
    });
    this._client = null;
    this._clientIds = [];
    this._gone = false;
    context.networkClient().then(client => {
      if (this._gone || !client) return;
      this._client = client;
      // A driver can expose Wi-Fi after Shell has already started. Refresh
      // availability on device/profile changes as well as activation changes.
      this._clientIds = ['notify::active-connections', 'device-added',
        'device-removed', 'connection-added', 'connection-removed']
        .map(signal => client.connect(signal, () => this._sync()));
      this._sync();
    }).catch(e => logError(e, 'shared hotspot client'));
    this.connect('clicked', () => this._clicked());
    // Drop the NM.Client together with the toggle. Its signal closure holds `this`
    // and the toggle holds the client, so every enable()/disable() cycle used to
    // leak a whole NM object cache plus its D-Bus subscriptions, and the stale
    // client kept calling _sync() on a destroyed toggle.
    this.connect('destroy', () => {
      this._gone = true;
      for (const id of this._clientIds)
        this._client.disconnect(id);
      this._clientIds = [];
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

const HotspotIndicator = GObject.registerClass({GTypeName: 'LinuxBeautifyHotspotIndicator'},
class HotspotIndicator extends SystemIndicator {
  _init(context) {
    super._init();
    this._indicator = this._addIndicator();
    this._indicator.icon_name = 'network-wireless-hotspot-symbolic';
    this._toggle = new HotspotToggle(context);
    this._toggle.bind_property('checked',
      this._indicator, 'visible',
      GObject.BindingFlags.SYNC_CREATE);
    this.quickSettingsItems.push(this._toggle);
  }
});

// Follow both asynchronously created indicators and replacement menu tiles.
// The scope owns every signal and restores surviving actors on disable.
function installTileVisibility(qs, scope) {
  const hidden = new Map();
  const hide = indicator => {
    if (!indicator)
      return;
    for (const item of [indicator, ...(indicator.quickSettingsItems ?? [])]) {
      if (hidden.has(item))
        continue;
      const record = {wasVisible: item.visible};
      hidden.set(item, record);
      const stopVisible = scope.observe(item, 'notify::visible', () => {
        if (item.visible)
          item.hide();
      });
      const stopDestroy = scope.observe(item, 'destroy', () => {
        stopVisible();
        stopDestroy();
        hidden.delete(item);
      });
      item.hide();
    }
  };
  const sync = () => {
    for (const key of ['_nightLight', '_powerProfiles'])
      hide(qs[key]);
  };
  if (qs._indicators)
    scope.observe(qs._indicators, 'child-added', sync);
  if (qs.menu?._grid)
    scope.observe(qs.menu._grid, 'child-added', sync);
  scope.observe(qs.menu, 'open-state-changed', (_menu, open) => {
    if (open)
      sync();
  });
  scope.own(() => {
    for (const [item, {wasVisible}] of hidden)
      item.visible = wasVisible;
    hidden.clear();
  });
  sync();
}

export function enableQuickSettings(context) {
  const qs = Main.panel.statusArea.quickSettings;
  const state = {indicator: null, scope: context.scope('quick-settings-visibility')};
  if (!qs)
    return state;
  try {
    installTileVisibility(qs, state.scope);
    state.indicator = new HotspotIndicator(context);
    qs.addExternalIndicator(state.indicator);
  } catch (error) {
    disableQuickSettings(state);
    throw error;
  }
  return state;
}

export function disableQuickSettings(state) {
  if (state?.indicator) {
    for (const item of state.indicator.quickSettingsItems)
      item.destroy();
    state.indicator.destroy();
    state.indicator = null;
  }
  state?.scope?.dispose();
}
