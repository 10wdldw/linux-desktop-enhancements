// SPDX-License-Identifier: GPL-3.0-or-later
// Original implementation of Fcitx's public Kimpanel D-Bus protocol. See PROTOCOL.md.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {InputState} from './state.js';

const PATH = '/org/kde/impanel';
const V1 = `<node><interface name="org.kde.impanel">
  <signal name="PanelCreated"/><signal name="SelectCandidate"><arg type="i"/></signal>
  <signal name="LookupTablePageUp"/><signal name="LookupTablePageDown"/>
  <signal name="MovePreeditCaret"><arg type="i"/></signal>
  <signal name="TriggerProperty"><arg type="s"/></signal>
</interface></node>`;
const V2 = `<node><interface name="org.kde.impanel2">
  <signal name="PanelCreated2"/>
  <method name="SetSpotRect"><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
  <method name="SetRelativeSpotRect"><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
  <method name="SetRelativeSpotRectV2"><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="d" direction="in"/></method>
  <method name="SetLookupTable"><arg type="as" direction="in"/><arg type="as" direction="in"/><arg type="as" direction="in"/><arg type="b" direction="in"/><arg type="b" direction="in"/><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
</interface></node>`;
const HELPER = `<node><interface name="org.fcitx.GnomeHelper"><method name="LockXkbGroup"><arg type="i" direction="in"/></method></interface></node>`;

export class NativeInputPanel {
  constructor(context) {
    this.context = context; this.scope = context.scope('input');
    this.state = new InputState(); this.owner = 0; this.subscription = 0;
    this.redraws = 0; this.pending = 0; this.active = false;
    this.layoutUpdates = 0; this.ignoredUpdates = 0; this.generation = 0;
  }
  enable() {
    this.bus = Gio.DBus.session;
    this.actor = new St.BoxLayout({style_class: 'linux-beautify-input', vertical: true, visible: false});
    Main.layoutManager.addTopChrome(this.actor);
    this.v1 = Gio.DBusExportedObject.wrapJSObject(V1, {});
    this.v1.export(this.bus, PATH);
    this.v2 = Gio.DBusExportedObject.wrapJSObject(V2, this);
    this.v2.export(this.bus, PATH);
    this.helper = Gio.DBusExportedObject.wrapJSObject(HELPER, {
      LockXkbGroup: group => { if (group >= 0 && group < 4) global.backend.lock_layout_group(group); },
    });
    this.helper.export(this.bus, '/org/fcitx/GnomeHelper');
    this.helperOwner = Gio.bus_own_name_on_connection(this.bus, 'org.fcitx.GnomeHelper', Gio.BusNameOwnerFlags.NONE, null, null);
    this.context.observeFocus(this.scope, state => this.syncFocus(state));
    this.scope.observe(this.context.settings, 'changed::input-font', () => this.schedule());
    this.scope.observe(this.context.settings, 'changed::input-vertical', () => this.schedule());
  }
  syncFocus({focus, editing}) {
    if (this.focus !== focus) {
      this.state.reset(); this.spot = null; this.actor.hide();
    }
    this.focus = editing ? focus : null;
    if (editing && !this.owner) {
      this.subscription = this.bus.signal_subscribe(null, 'org.kde.kimpanel.inputmethod', null, null, null,
        Gio.DBusSignalFlags.NONE, (_bus, _sender, _path, _iface, name, parameters) => {
          if (!this.active) return;
          if (this.state.signal(name, parameters.deep_unpack())) this.schedule();
          else this.ignoredUpdates++;
        });
      const generation = ++this.generation;
      this.owner = Gio.bus_own_name_on_connection(this.bus, 'org.kde.impanel', Gio.BusNameOwnerFlags.NONE,
        () => {
          if (this.scope.disposed || generation !== this.generation) return;
          this.active = true; this.v1.emit_signal('PanelCreated', null); this.v2.emit_signal('PanelCreated2', null);
          this.schedule();
        },
        () => {
          if (generation !== this.generation) return;
          this.active = false; this.actor?.hide();
        });
    } else if (!editing && this.owner) {
      this.release();
    }
    if (!editing) this.actor.hide();
  }
  release() {
    this.active = false;
    this.generation++;
    if (this.pending) this.scope.remove(this.pending);
    this.pending = 0;
    if (this.subscription) this.bus.signal_unsubscribe(this.subscription);
    this.subscription = 0;
    if (this.owner) Gio.bus_unown_name(this.owner);
    this.owner = 0; this.state.reset(); this.spot = null; this.actor?.hide();
  }
  SetSpotRect(x, y, width, height) {
    const next = [x, y + height];
    if (this.spot && this.spot[0] === next[0] && this.spot[1] === next[1]) return;
    this.spot = next; this.schedule();
  }
  SetRelativeSpotRect(_x, _y, _width, _height) { this.spot = null; this.schedule(); }
  SetRelativeSpotRectV2(x, y, width, height, _scale) { this.SetRelativeSpotRect(x, y, width, height); }
  SetLookupTable(...values) { if (this.state.lookup(...values)) this.schedule(); else this.ignoredUpdates++; }
  schedule() {
    if (this.pending || this.scope.disposed) return;
    this.pending = this.scope.idle(GLib.PRIORITY_DEFAULT_IDLE, () => {
      this.pending = 0; this.render(); return GLib.SOURCE_REMOVE;
    });
  }
  emit(name, index = null) {
    this.v1.emit_signal(name, index === null ? null : new GLib.Variant('(i)', [index]));
  }
  render() {
    if (!this.active || !this.focus) { this.actor.hide(); return; }
    const state = this.state;
    const fontName = this.context.settings.get_string('input-font');
    const vertical = this.context.settings.get_boolean('input-vertical') || state.layout === 2;
    if (this._renderedRevision !== state.revision || this._font !== fontName || this._vertical !== vertical) {
      this.rebuildContent(state, fontName, vertical);
    }
    if (!this.actor.get_n_children()) { this.actor.hide(); return; }
    this.layoutUpdates++;
    const [fx, fy] = this.focus.get_transformed_position();
    const [, fh] = this.focus.get_transformed_size();
    const monitor = Main.layoutManager.findMonitorForActor(this.focus) || Main.layoutManager.primaryMonitor;
    // Display reconfiguration can briefly leave Shell without a monitor.
    if (!monitor) { this.actor.hide(); return; }
    const [x, y] = this.spot || [fx, fy + fh];
    const [, width] = this.actor.get_preferred_width(-1);
    const [, height] = this.actor.get_preferred_height(width);
    this.actor.set_position(Math.max(monitor.x, Math.min(x, monitor.x + monitor.width - width)),
      Math.max(monitor.y, Math.min(y, monitor.y + monitor.height - height)));
    this.actor.show();
  }
  rebuildContent(state, fontName, vertical) {
    this.redraws++;
    this._renderedRevision = state.revision; this._font = fontName; this._vertical = vertical;
    for (const child of this.actor.get_children()) child.destroy();
    const font = Pango.FontDescription.from_string(fontName);
    const family = (font.get_family() || 'Sans').replace(/[";{}]/g, '');
    const size = Math.min(36, Math.max(9, font.get_size() / Pango.SCALE || 14));
    this.actor.set_style(`font-family: "${family}"; font-size: ${size}pt;`);
    const label = text => new St.Label({text: String(text), style_class: 'linux-beautify-input-text'});
    if (state.showPreedit && state.preedit) this.actor.add_child(label(state.preedit));
    if (state.showAux && state.aux) this.actor.add_child(label(state.aux));
    if (state.showLookup && state.texts.length) {
      const row = new St.BoxLayout({vertical});
      state.texts.forEach((text, index) => {
        const button = new St.Button({label: `${state.labels[index] || ''} ${text}`.trim(),
          can_focus: false, style_class: 'linux-beautify-candidate' + (index === state.cursor ? ' selected' : '')});
        button.connect('clicked', () => this.emit('SelectCandidate', index)); row.add_child(button);
      });
      this.actor.add_child(row);
      if (state.hasPrev || state.hasNext) {
        const pages = new St.BoxLayout();
        for (const [enabled, text, signal] of [[state.hasPrev, '‹', 'LookupTablePageUp'], [state.hasNext, '›', 'LookupTablePageDown']]) {
          const button = new St.Button({label: text, reactive: enabled, can_focus: false, style_class: 'linux-beautify-candidate'});
          button.connect('clicked', () => this.emit(signal)); pages.add_child(button);
        }
        this.actor.add_child(pages);
      }
    }
  }
  snapshot() {
    return {panelInstances: 1, redraws: this.redraws, layoutUpdates: this.layoutUpdates, ignoredUpdates: this.ignoredUpdates, candidates: this.state.texts.length, cursor: this.state.cursor, visible: !!this.actor?.visible,
      inputMethodSignalSubscriptions: this.subscription ? 1 : 0, ownsPanelName: this.active};
  }
  disable() {
    this.release(); this.scope.dispose(); this.pending = 0;
    if (this.helperOwner) Gio.bus_unown_name(this.helperOwner);
    this.helperOwner = 0;
    for (const object of [this.v1, this.v2, this.helper]) object?.unexport();
    this.v1 = this.v2 = this.helper = null;
    this.actor?.destroy(); this.actor = null; this.focus = null;
  }
}
