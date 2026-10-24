import Cairo from 'gi://cairo';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PointerWatcher from 'resource:///org/gnome/shell/ui/pointerWatcher.js';
import {DriveStabilizer} from './driveStabilizer.js';

// Sizes are logical pixels; monitor scaling is applied once at the boundary.
const MAX_ICON_SIZE_PX = 110;
// One parent transform moves visuals, badges, labels and native hit regions.
const DOCK_OFFSET_PX = 2;
const REST_ICON_SCALE = 1.1;
// Keep the plate's horizontal expansion equal to the growth of the glyphs.
const MAGNIFY_SPREAD = 1;
// Keep the original quick icon response. The plate follows the resulting
// live bounds in the same frame, so there is no slower second animation.
const MOTION_RESPONSE_US = 52000;
// Keep extra source pixels for every final pixel. 1.5x is the useful quality /
// upload-cost balance on a HiDPI desktop: fractional magnification still
// samples a supersized texture, without doubling every icon's GPU memory.
const ICON_RENDER_SCALE = 1.5;
// Expand the invisible click envelope without changing the visible icon.
// Final invisible click-envelope coefficients. These affect hit testing only;
// the visible icon size and magnification animation remain unchanged.
const HIT_WIDTH = 2;
const HIT_HEIGHT = 1;
const MAGNIFY_RADIUS = 1.5 * 1.60;
// Render the badge at high resolution, then scale it back to its logical size.
// A scale of 1 keeps the Android-style badge readable instead of shrinking it
// to the tiny fraction used by the old implementation.
const BADGE_SCALE = 1;
const BADGE_RENDER_SCALE = 2;
// The requested visible area is half of the current one, so width and height
// use sqrt(0.5) while the badge remains rendered at 2x resolution.
const BADGE_SIZE_SCALE = Math.SQRT1_2;
// Give the glyph a little more breathing room after the area reduction.
const BADGE_FONT_BOOST = 3;
const BADGE_FONT_FAMILY = 'Roboto';
const BADGE_RIGHT_SHIFT = 0.8;
const BADGE_UP_SHIFT = 0.5;
const BADGE_Y_SHIFT_PX = 4;
const BADGE_TEXT_Y_SHIFT_PX = 1;
const GAP = 12;
// Used only if Clutter.Timeline cannot attach to the stage frame clock.
const FALLBACK_FRAME_MS = 6;
// Detect initial hover at 60 Hz; active animation still uses the stage frame clock.
const POINTER_WATCH_MS = 16;
// The running dots are drawn with a radius of iconSize / 22, so one dot
// diameter is iconSize / 11. The plate, the icons and the dots each sit
// this many diameters below their default position.
const PLATE_DROP = 2;
const ICON_DROP = 3;
const DOT_DROP = 2.7;
// Extra drop for the running dots, in CSS px. 5px is the themed dot size,
// so 3px is 0.6 diameters. Multiplied by the stage scale at apply time.
const DOT_SHIFT_PX = 3;
const ASSETS = `${GLib.get_home_dir()}/.local/share/gnome-shell/extensions/macstyle-session@local/assets`;
const UNKNOWN_APP_ICON = `${ASSETS}/unknown-app.svg`;
const ONE_CLICK_PUBLISH_ICON = `${ASSETS}/one-click-publish.svg`;
// These are the standard placeholders returned for an app which did not
// provide an Icon= entry. Do not treat a merely similar name as a fallback:
// application icons such as `preferences-system` and `settings-symbolic` are
// legitimate application-provided artwork.
const DEFAULT_APP_ICON_NAMES = new Set([
  'application-default',
  'application-default-icon',
  'application-x-executable',
  'application-x-generic',
  'default-app',
  'default-application',
  'unknown',
  'unknown-app',
]);
const DRIVES = new Map([
  ['96F8EB6DF8EB49D7', {name: 'P41', file: 'drive-p41-v2.svg', order: 0}],
  ['D6E2651CE265025B', {name: 'RC20', file: 'drive-rc20-v2.svg', order: 1}],
  ['0CBE18C20CBE18C2', {name: '860EVO', file: 'drive-860evo-v2.svg', order: 2}],
]);

// Dock actors are rebuilt by Ubuntu Dock during startup, monitor changes,
// and drive mounts. A reference can therefore remain in a queued callback
// after its native actor has been disposed. Keep all later work off those
// stale objects so GJS never tries to read or write a disposed actor.
//
// Liveness is tracked from each actor's 'destroy' signal, NOT by touching the
// object: reading a property or calling a method on a disposed wrapper makes
// GJS log "has been already disposed" plus a stack trace, and try/catch cannot
// silence that (audit 2026-09-20: 9.5k such lines over 132 boots, >90% from
// here). An actor we hold a reference to must go through _watchDestroy() (or
// _remember()/_connect(), which do it) before it is probed.
const _dead = new WeakSet();
const _watched = new WeakSet();

function _watchDestroy(actor) {
  if (!actor || _watched.has(actor) || _dead.has(actor))
    return;
  _watched.add(actor);
  actor.connect('destroy', () => _dead.add(actor));
}

function _liveActor(actor) {
  if (!actor || _dead.has(actor))
    return false;
  try {
    return !!actor.get_stage?.();
  } catch (_) {
    return false;
  }
}

// St.ScrollView reports only its allocation, even with clipping disabled.
// Expand its paint volume so parent FBOs and damage tracking include overflow.
// This is a plain Effect: it allocates no framebuffer and draws no pixels.
const DockOverflowVolume = GObject.registerClass(
class DockOverflowVolume extends Clutter.Effect {
  _init(padding) {
    super._init();
    this.padding = padding;
  }

  vfunc_modify_paint_volume(volume) {
    const origin = volume.get_origin();
    const width = volume.get_width();
    const height = volume.get_height();
    volume.set_origin(new Graphene.Point3D({
      x: origin.x - this.padding.x,
      y: origin.y - this.padding.top,
      z: origin.z,
    }));
    volume.set_width(width + 2 * this.padding.x);
    volume.set_height(height + this.padding.top);
    return true;
  }
});

export class DockMagnifier {
  constructor() {
    this._dock = null;
    this._dash = null;
    this._saved = new Map();
    this._motion = new Map();
    this._connections = [];
    this._frame = 0;
    this._timeline = null;
    this._frameId = 0;
    this._pumping = false;
    this._lastFrame = 0;
    this._inFrame = false;
    this._near = false;
    this._active = false;
    this._hoverActor = null;
    this._hoverItem = null;
    this._hitActor = null;
    this._hitPressed = null;
    this._menuOpen = false;
    this._dragging = false;
    this._plateAnimating = false;
    this._plateVisualWidth = null;
    this._plateActor = null;
    this._revealInZone = false;
    this._layoutTransitionId = 0;
    this._geometryLaterId = 0;
    this._poll = 0;
    this._dark = false;
    // How far above the plate a pointer can still hit a magnified icon; see _hitReach().
    this._reach = null;
    // Pointer position seen by the previous frame, to tell a resting pointer from a moving one.
    this._framePx = null;
    this._framePy = null;
  }

  enable() {
    this._active = true;
    try {
      this._iface = Gio.Settings.new('org.gnome.desktop.interface');
      this._dark = this._iface.get_string('color-scheme') === 'prefer-dark';
      this._ifaceId = this._iface.connect('changed::color-scheme', () => {
        this._dark = this._iface.get_string('color-scheme') === 'prefer-dark';
        this._queuePrepare();
      });
    } catch (_) {
      this._dark = false;
    }
    try {
      // Keep a small read-only settings handle for the hidden fullscreen
      // reveal zone. _detach() can run during a Dock rebuild, so this handle
      // deliberately has an independent lifetime from the attached Dock.
      this._revealSettings = Gio.Settings.new('org.gnome.shell.extensions.dash-to-dock');
    } catch (_) {
      this._revealSettings = null;
    }
    this._syncDock();
    this._startDockDiscovery();
    this._startPointerWatch();
  }

  disable() {
    this._active = false;
    this._watch?.remove();
    this._watch = null;
    if (this._poll) GLib.source_remove(this._poll);
    this._poll = 0;
    this._revealSettings = null;
    if (this._ifaceId && this._iface) {
      try { this._iface.disconnect(this._ifaceId); } catch (_) {}
    }
    this._ifaceId = 0;
    this._iface = null;
    this._detach();
  }

  _startPointerWatch() {
    if (!this._active || !this._dash || this._watch)
      return;
    this._watch = PointerWatcher.getPointerWatcher().addWatch(POINTER_WATCH_MS,
      (x, y) => this._onPointer(x, y));
  }

  _startDockDiscovery() {
    if (!this._active || this._dock || this._poll)
      return;
    this._poll = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this._syncDock();
      if (this._dock) {
        this._poll = 0;
        return GLib.SOURCE_REMOVE;
      }
      return GLib.SOURCE_CONTINUE;
    });
  }

  _syncDock() {
    try {
      // Steady state: still attached to a live dock, nothing to look for. The
      // actor-tree walk in _findDock() only runs while nothing is attached
      // (it used to run once a second forever).
      if (this._dock && _liveActor(this._dock))
        return;
      const dock = this._findDock();
      if (dock !== this._dock) this._attach(dock);
    } catch (e) {
      // A failed attachment must not kill discovery or leave a half-posed dock.
      this._detach();
      logError(e, 'dock attachment');
    }
  }

  _findDock() {
    const visit = (actor, depth) => {
      if (!_liveActor(actor) || depth > 5) return null;
      try {
        if (actor.name === 'dashtodockContainer' && actor.dash)
          return actor;
        for (const child of actor.get_children()) {
          const found = visit(child, depth + 1);
          if (found) return found;
        }
      } catch (_) {}
      return null;
    };
    return visit(Main.layoutManager.uiGroup, 0);
  }

  _remember(actor, properties) {
    if (!actor || _dead.has(actor)) return;
    let saved = this._saved.get(actor);
    if (!saved) {
      saved = {properties: {}, destroyed: false, destroyId: 0};
      _watchDestroy(actor);
      saved.destroyId = actor.connect('destroy', () => {
        _dead.add(actor);
        saved.destroyed = true;
        this._saved.delete(actor);
        this._motion.delete(actor);
        for (const [item, state] of this._motion)
          if (state.visual === actor || state.label === actor) this._motion.delete(item);
          else if (state.texture === actor) state.texture = null;
      });
      this._saved.set(actor, saved);
    }
    for (const key of properties)
      if (!(key in saved.properties)) saved.properties[key] = actor[key];
  }

  _set(actor, values) {
    if (!actor || _dead.has(actor)) return;
    this._remember(actor, Object.keys(values));
    for (const [key, value] of Object.entries(values))
      if (actor[key] !== value) actor[key] = value;
  }

  _connect(object, signal, callback) {
    const connection = {object, id: object.connect(signal, callback), destroyId: 0};
    if (object instanceof Clutter.Actor) {
      _watchDestroy(object);
      connection.destroyId = object.connect('destroy', () => {
        _dead.add(object);
        connection.object = null;
        this._connections = this._connections.filter(c => c !== connection);
      });
    }
    this._connections.push(connection);
  }

  _attach(dock) {
    this._detach();
    if (!dock || !dock.has_style_class_name('bottom')) return;
    this._dock = dock;
    this._dash = dock.dash;
    // Native dwell/pressure also listens along the whole screen edge. Use
    // the same narrow gate as our pointer watch, and restore it on detach.
    const onPressureSensed = dock._onPressureSensed;
    this._set(dock, {_onPressureSensed: () => {
      const [x, y] = global.get_pointer();
      if (this._inHiddenRevealZone(x, y))
        onPressureSensed.call(dock);
    }});
    this._drives = new DriveStabilizer({
      specs: DRIVES, assets: ASSETS, onChanged: () => {
        if (!this._active)
          return;
        this._queuePrepare();
      },
    });
    this._drives.enable(this._dash).catch(e => logError(e, 'dock drives'));
    this._connect(dock, 'destroy', () => this._detach());
    // Ubuntu Dock's own destroy handler destroys the dash BEFORE the handler
    // above runs, and that removes the dash children one by one (child-removed)
    // from a half-dead tree - the source of the "already disposed" log storms.
    // Detach as soon as the dash itself goes: its 'destroy' handlers run before
    // its children are destroyed.
    this._connect(this._dash, 'destroy', () => this._detach());
    _watchDestroy(this._dash._showAppsIcon);
    _watchDestroy(this._dash._background);
    this._connect(this._dash._box, 'child-added', (_box, child) => {
      if (!this._active || _box !== this._dash?._box || !_liveActor(_box) || !_liveActor(child))
        return;
      this._poseItem(child);
      this._plateAnimating = true;
      this._animate();
      this._queuePrepare();
    });
    this._connect(this._dash._box, 'child-removed', (_box, child) => {
      if (!this._active || _box !== this._dash?._box || !_liveActor(_box))
        return;
      // Keep old centers for one idle turn. Native Dash then finishes its own
      // reallocation, after which the remaining icons can glide into place.
      const previousCenters = new Map();
      for (const item of this._items()) {
        if (item !== child && item.get_parent?.())
          previousCenters.set(item, this._centerX(item));
      }
      this._motion.delete(child);
      if (this._hoverItem === child)
        this._hoverItem = null;
      this._hideHover();
      this._plateAnimating = true;
      this._animate();
      if (this._layoutTransitionId) {
        try { GLib.source_remove(this._layoutTransitionId); } catch (_) {}
      }
      this._layoutTransitionId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        this._layoutTransitionId = 0;
        if (!this._active || !this._dash)
          return GLib.SOURCE_REMOVE;
        for (const [item, before] of previousCenters) {
          const state = this._motion.get(item);
          if (!state || !item.get_stage?.())
            continue;
          try {
            state.layoutShift = before - this._centerX(item);
          } catch (_) {}
        }
        this._animate();
        return GLib.SOURCE_REMOVE;
      });
      this._queuePrepare();
    });
    this._connect(this._dash, 'icon-size-changed', () => this._queuePrepare());
    this._connect(Main.layoutManager, 'startup-complete', () => this._queuePrepare());
    this._connect(Main.layoutManager, 'monitors-changed', () => this._queuePrepare());
    this._connect(dock, 'notify::mapped', () => {
      if (dock.mapped) this._queuePrepare();
    });
    this._connect(St.ThemeContext.get_for_stage(global.stage), 'changed', () => this._queuePrepare());
    if (Main.screenshotUI) {
      this._connect(Main.screenshotUI, 'notify::visible', () =>
        this._suspendForScreenshot());
    }
    const syncPlateAppearance = () => this._syncPlateActor();
    this._connect(Main.overview, 'showing', () => {
      this._raiseDock();
      syncPlateAppearance();
    });
    this._connect(Main.overview, 'hidden', syncPlateAppearance);
    this._connect(Main.overview, 'shown', () => {
      this._raiseDock();
      syncPlateAppearance();
    });
    this._connect(Main.overview, 'hiding', () => {
      syncPlateAppearance();
      this._menuOpen = false;
      if (this._near) this._reset();
    });
    this._connect(Main.overview, 'item-drag-begin', () => {
      this._dragging = true;
      this._watch?.remove();
      this._watch = null;
      // Native Dock drag feedback owns the frame while an icon is being
      // dragged. Stop magnification, hover paint and plate repaints so the
      // drag actor is not competing with our animation loop.
      this._snapRest();
      this._plateActor?.hide();
    });
    const finishItemDrag = () => {
      this._dragging = false;
      this._relaxClip();
      this._applyRestPose();
      this._syncPlateActor();
      this._startPointerWatch();
    };
    this._connect(Main.overview, 'item-drag-end', finishItemDrag);
    this._connect(Main.overview, 'item-drag-cancelled', finishItemDrag);
    this._connect(dock, 'hiding', () => {
      this._revealInZone = false;
      this._reset();
    });
    this._connect(dock, 'showing', () => {
      this._snapRest();
    });
    if (Main.overview.visible)
      this._raiseDock();

    // Keep one deterministic slide mask. Never alternate remove_clip/set_clip
    // during animation: damage tracking must see the same visual envelope.
    this._clipOwner = dock._box;
    this._clipDescriptor = Object.getOwnPropertyDescriptor(dock._box, 'set_clip');
    this._clipWrapper = (x, y, w, h) => {
      this._nativeClip = [x, y, w, h];
      if (this._dragging)
        Clutter.Actor.prototype.set_clip.call(dock._box, x, y, w, h);
      else
        this._relaxClip();
    };
    dock._box.set_clip = this._clipWrapper;
    if (dock._box.has_clip)
      this._nativeClip = dock._box.get_clip();
    this._connect(dock._slider, 'notify::slide-x', () => {
      if (!this._dragging)
        this._relaxClip();
      if ((dock._slider.slide_x ?? 1) < 0.999 && (this._near || this._pumping))
        this._reset();
      this._queueGeometrySync();
    });
    // Outer allocation notifications fire before their children are allocated.
    // Coalesce the complete layout into one sync immediately before painting.
    for (const actor of [dock, dock._slider, dock._box, this._dash,
      this._dash._dashContainer, this._dash._background, this._dash._box])
      this._connect(actor, 'notify::allocation', () => this._queueGeometrySync());
    for (const actor of [dock, this._dash]) {
      for (const property of ['visible', 'mapped'])
        this._connect(actor, `notify::${property}`, () => this._queueGeometrySync());
      // Clutter can advance native transitions after BEFORE_REDRAW callbacks.
      // Follow those transforms synchronously, so the independent Cairo layer
      // cannot lag the login slide/fade by one frame.
      for (const property of ['opacity', 'translation-x', 'translation-y'])
        this._connect(actor, `notify::${property}`, () => {
          this._syncPlateActor();
          if (!this._dragging)
            this._syncHover();
        });
    }
    // Monitor recovery can finish child allocation after BEFORE_REDRAW. Commit
    // the separate plate from the final layout before any stage view paints;
    // this signal does not request frames while the desktop is idle.
    this._connect(global.stage, 'before-paint', () => {
      this._syncPlateActor();
      const plate = this._plateActor;
      if (plate?.visible && !plate.has_allocation())
        plate.allocate_preferred_size(plate.x, plate.y);
    });
    this._prepare();
    this._startPointerWatch();
  }

  _queueGeometrySync() {
    if (!this._active || this._geometryLaterId || this._dragging)
      return;
    this._geometryLaterId = global.compositor.get_laters().add(
      Meta.LaterType.BEFORE_REDRAW, () => {
        this._geometryLaterId = 0;
        if (this._active && !this._dragging && _liveActor(this._dash)) {
          this._relaxClip();
          this._applyRestPose();
          this._updatePlate();
          this._syncHover();
        }
        return GLib.SOURCE_REMOVE;
      });
  }

  _queuePrepare() {
    if (!this._active || this._prepareId)
      return;
    this._prepareId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      this._prepareId = 0;
      if (this._active && _liveActor(this._dash))
        this._prepare();
      return GLib.SOURCE_REMOVE;
    });
  }

  _overflowPad() {
    const size = this._iconSize();
    const peak = this._maxScale();
    let x = Math.ceil(size * peak * 2);
    const plate = this._dash?._background;
    if (plate?.width > 0 && plate.scale_x > 1)
      x = Math.max(x, Math.ceil((plate.scale_x - 1) * plate.width / 2) + size);
    return {
      x,
      // Leave room for the rising icon, running dot and hover shadow.
      top: Math.ceil(size * peak +
        this._dotSize() * (ICON_DROP + DOT_DROP) + GAP + this._cssPx(16)),
    };
  }

  // Furthest distance above the plate at which a pointer can still hit a magnified
  // icon: the overflow room (peak icon height + dots + hover shadow) plus one more
  // icon height as margin. Cached until the next _prepare() (icon size / theme scale).
  _hitReach() {
    return this._reach ??= this._overflowPad().top + this._iconSize();
  }

  _unclip() {
    const dock = this._dock;
    const d = this._dash;
    if (!dock || !d) return;
    const actors = [
      dock, dock._slider, dock._box,
      d, d._dashContainer, d._scrollView, d._boxContainer, d._box, d._background,
    ];
    const sv = d._scrollView;
    if (sv) {
      try {
        for (const child of sv.get_children()) {
          actors.push(child);
          for (const grand of child.get_children())
            actors.push(grand);
        }
      } catch (_) {}
      if (sv.child && !actors.includes(sv.child))
        actors.push(sv.child);
      this._set(sv, {style: '-st-hfade-offset: 0px; -st-vfade-offset: 0px;'});
    }
    for (const actor of actors) {
      if (!actor) continue;
      this._set(actor, {clip_to_allocation: false});
      // Leave the leaf containers in the normal rendering path so their
      // overflow is not clipped. The top-level Dash itself must remain an
      // offscreen layer, however: its scaled icon pixels extend above the
      // native allocation and otherwise fall outside the redraw region when
      // a window underneath the translucent plate repaints.
      this._set(actor, {offscreen_redirect: actor === d
        ? Clutter.OffscreenRedirect.ALWAYS
        : Clutter.OffscreenRedirect.DISABLED});
      try {
        if (actor.clip_to_view)
          this._set(actor, {clip_to_view: false});
      } catch (_) {}
    }
    const slider = dock._slider;
    if (slider?.has_clip)
      slider.remove_clip();
    this._sliderClip = null;
    this._relaxClip();
  }

  _relaxClip() {
    const box = this._clipOwner;
    if (!box || !this._nativeClip || _dead.has(box)) return;
    const [x, y, w, h] = this._nativeClip;
    const pad = this._overflowPad();
    // Preserve the native bottom edge, which hides the Dock during sliding.
    Clutter.Actor.prototype.set_clip.call(box,
      x - pad.x, y - pad.top, w + 2 * pad.x, h + pad.top);
  }

  _roundRectPath(cr, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
    cr.newPath();
    cr.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    cr.arc(x + width - r, y + r, r, Math.PI * 1.5, Math.PI * 2);
    cr.arc(x + width - r, y + height - r, r, 0, Math.PI * 0.5);
    cr.arc(x + r, y + height - r, r, Math.PI * 0.5, Math.PI);
    cr.closePath();
  }

  _ensurePlateActor() {
    if (this._plateActor && !_dead.has(this._plateActor))
      return this._plateActor;
    const actor = new St.DrawingArea({
      name: 'macDockPlate',
      reactive: false,
      visible: false,
    });
    actor.clip_to_allocation = false;
    actor.offscreen_redirect = Clutter.OffscreenRedirect.DISABLED;
    _watchDestroy(actor);
    actor.connect('repaint', area => this._onPlatePaint(area));
    try {
      // Keep the plate in the normal chrome layer, directly below the Dock,
      // so it remains above fullscreen application windows without becoming
      // an input region of its own.
      Main.layoutManager.addChrome(actor);
    } catch (_) {
      Main.layoutManager.uiGroup.add_child(actor);
    }
    this._plateActor = actor;
    try {
      const parent = this._dock?.get_parent();
      if (parent && actor.get_parent() === parent)
        parent.set_child_below_sibling(actor, this._dock);
    } catch (_) {}
    return actor;
  }

  _onPlatePaint(area) {
    const cr = area.get_context();
    let width = area.width || 0;
    let height = area.height || 0;
    try {
      const size = area.get_surface_size();
      width = size[0] ?? size.width ?? width;
      height = size[1] ?? size.height ?? height;
    } catch (_) {}
    const plate = area._macPlateRect;
    if (!plate || width < 2 || height < 2) {
      cr.$dispose();
      return;
    }
    try { cr.setAntialias(Cairo.Antialias.BEST); } catch (_) {}
    try {
      cr.setOperator(Cairo.Operator.CLEAR);
      cr.paint();
      cr.setOperator(Cairo.Operator.OVER);
    } catch (_) {}

    const blur = this._cssPx(24);
    const offsetY = this._cssPx(8);
    const lightOverview = area._macPlateAppearance === 'light-overview';
    const shadowAlpha = lightOverview ? 0 : (this._dark ? 0.46 : 0.28);
    const sigma = Math.max(1, blur * 0.42);
    const maxSpread = Math.max(1, Math.ceil(blur));
    // Cairo has no portable drop-shadow primitive. Use a small number of
    // Gaussian-weighted bands instead of one band per physical pixel; the
    // old 48-pass HiDPI loop repainted on every animation frame and was the
    // main reason dragging an icon could collapse the dock frame rate.
    const shadowSteps = Math.min(12, maxSpread);
    const spreadStep = maxSpread / shadowSteps;
    const tail = Math.exp(-0.5 * (maxSpread / sigma) ** 2);
    for (let step = shadowSteps; step >= 0; step--) {
      const spread = step * spreadStep;
      const outerSpread = Math.min(maxSpread, spread + spreadStep);
      const profile = (Math.exp(-0.5 * (spread / sigma) ** 2) - tail) /
        Math.max(0.001, 1 - tail);
      const nextProfile = (Math.exp(-0.5 * (outerSpread / sigma) ** 2) - tail) /
        Math.max(0.001, 1 - tail);
      const alpha = Math.max(0, profile - nextProfile) * shadowAlpha;
      if (alpha < 0.0001)
        continue;
      this._roundRectPath(cr, plate.x - spread, plate.y + offsetY - spread,
        plate.width + spread * 2, plate.height + spread * 2,
        plate.radius + spread);
      cr.setSourceRGBA(0, 0, 0, alpha);
      cr.fill();
    }

    this._roundRectPath(cr, plate.x, plate.y, plate.width, plate.height, plate.radius);
    if (lightOverview)
      cr.setSourceRGBA(72 / 255, 72 / 255, 76 / 255, 0.85);
    else if (this._dark)
      cr.setSourceRGBA(34 / 255, 34 / 255, 34 / 255, 0.85);
    else
      cr.setSourceRGBA(1, 1, 1, 0.82);
    cr.fillPreserve();
    cr.setLineWidth(this._cssPx(1));
    if (lightOverview)
      cr.setSourceRGBA(1, 1, 1, 0.06);
    else if (this._dark)
      cr.setSourceRGBA(0, 0, 0, 0.75);
    else
      cr.setSourceRGBA(1, 1, 1, 0.72);
    cr.stroke();
    if (this._dark) {
      this._roundRectPath(cr, plate.x + this._cssPx(1), plate.y + this._cssPx(1),
        plate.width - this._cssPx(2), plate.height - this._cssPx(2),
        Math.max(0, plate.radius - this._cssPx(1)));
      cr.setLineWidth(this._cssPx(1));
      cr.setSourceRGBA(1, 1, 1, 0.05);
      cr.stroke();
    }
    cr.$dispose();
  }

  _syncPlateActor() {
    const actor = this._plateActor;
    const plate = this._dash?._background;
    if (!actor || !plate || !_liveActor(actor) || !_liveActor(plate))
      return;
    // Dock's own drag reveal changes slider allocation every frame. Keep the
    // Cairo plate out of that path; it will be positioned once when the drag
    // ends, instead of reallocating and repainting alongside the drag actor.
    if (this._dragging) {
      if (actor.visible)
        actor.hide();
      return;
    }
    const [x, y, baseWidth, baseHeight] = this._actorXYWH(plate);
    const width = Math.max(1, this._plateVisualWidth ?? baseWidth);
    if (!(baseWidth > 1 && baseHeight > 1) || !Number.isFinite(x + y + width + baseHeight)) {
      actor.hide();
      return;
    }
    const pad = this._cssPx(32);
    const center = x + baseWidth / 2;
    const nextX = center - width / 2 - pad;
    const nextY = y - pad;
    const nextActorWidth = width + pad * 2;
    const nextActorHeight = baseHeight + pad * 2;
    // Both overview pages share the light-theme palette. Dark mode always
    // retains its original plate, including its border and shadow.
    const appearance = this._dark ? 'dark'
      : (Main.overview.visibleTarget ? 'light-overview' : 'light');
    const appearanceChanged = actor._macPlateAppearance !== appearance;
    actor._macPlateAppearance = appearance;
    const previousRect = actor._macPlateRect;
    const geometryChanged = !previousRect ||
      Math.abs(previousRect.x - pad) > 0.25 ||
      Math.abs(previousRect.y - pad) > 0.25 ||
      Math.abs(previousRect.width - width) > 0.5 ||
      Math.abs(previousRect.height - baseHeight) > 0.5 ||
      Math.abs(actor.x - nextX) > 0.25 ||
      Math.abs(actor.y - nextY) > 0.25 ||
      Math.abs(actor.width - nextActorWidth) > 0.5 ||
      Math.abs(actor.height - nextActorHeight) > 0.5;
    if (actor.scale_x !== 1 || actor.scale_y !== 1)
      actor.set_scale(1, 1);
    if (geometryChanged) {
      actor.set_position(nextX, nextY);
      actor.set_size(nextActorWidth, nextActorHeight);
      actor._macPlateStageX = nextX;
      actor._macPlateStageY = nextY;
      actor._macPlateRect = {
        x: pad,
        y: pad,
        width,
        height: baseHeight,
        radius: this._cssPx(28),
      };
    }
    // Dash owns the native login slide/fade. The layout anchor itself is
    // transparent, so inherit Dash's paint opacity rather than the anchor's.
    actor.opacity = this._dash.get_paint_opacity();
    if (this._dash.mapped && this._dock.mapped && plate.visible)
      actor.show();
    else
      actor.hide();
    if (geometryChanged || appearanceChanged)
      actor.queue_repaint();
  }

  _prepare() {
    const d = this._dash;
    if (!_liveActor(d) || !_liveActor(d._box)) return;
    this._reach = null;
    const dot = this._dotSize();
    // Dock's root translation anchors it to the bottom; Dash's translation
    // belongs to the login animation. Move the stable box between them.
    this._remember(this._dock._box, ['translation_y']);
    this._dock._box.translation_y = this._saved.get(this._dock._box).properties.translation_y +
      this._cssPx(DOCK_OFFSET_PX);
    this._unclip();
    const scroll = d._scrollView;
    if (scroll && this._paintVolumeActor !== scroll) {
      this._removePaintVolume();
      this._paintVolumeActor = scroll;
      this._paintVolumeEffect = new DockOverflowVolume(this._overflowPad());
      scroll.add_effect_with_name('macDockOverflowVolume', this._paintVolumeEffect);
    } else if (this._paintVolumeEffect) {
      this._paintVolumeEffect.padding = this._overflowPad();
      this._paintVolumeEffect.queue_repaint();
    }
    this._ensurePlateActor();
    // Wallpaper that stays visible under the lowered plate. The plate is
    // translated down by PLATE_DROP on every startup layout, so the padding
    // has to include that shift. Adding the full GAP cancels the drop and
    // the pill sits at the default height.
    const EDGE_GAP = 4;
    this._set(this._dock._box, {style: `padding-bottom: ${EDGE_GAP + dot * PLATE_DROP}px;`});
    this._set(d._boxContainer, {style: 'padding: 0;'});
    this._set(d._background, {
      margin_top: 0,
      margin_bottom: this._cssPx(DOT_SHIFT_PX),
      translation_y: dot * PLATE_DROP,
      x_align: Clutter.ActorAlign.CENTER,
    });
    this._applyPlateShadow();
    this._applyGlassEffect();
    this._remember(d._background, ['scale_x', 'scale_y', 'pivot_point']);
    d._background.set_pivot_point(0.5, 1);
    this._set(d._showAppsIcon, {y_align: Clutter.ActorAlign.CENTER});
    this._set(d._separator, {visible: false, width: 0, opacity: 0});

    const launch = d._showAppsIcon.icon.icon;
    if (launch && !launch._macDockLaunch) {
      this._remember(launch, ['gicon', 'style']);
      launch.gicon = Gio.FileIcon.new(Gio.File.new_for_path(`${ASSETS}/launchpad.svg`));
      launch.set_style('background-image: none; icon-style: regular;');
      launch._macDockLaunch = true;
    }
    this._prepareDrives();
    for (const item of this._items()) {
      this._poseItem(item);
      const app = item.child;
      this._set(item, {clip_to_allocation: false});
      if (app)
        this._set(app, {clip_to_allocation: false});
      const visual = this._visual(item);
      if (visual) {
        this._set(visual, {clip_to_allocation: false});
        this._remember(visual, ['style']);
        visual.set_style('background-color: transparent; background: none; border-radius: 18px;');
      }
      // DockShowAppsIcon owns this signal; its child is just an St.Button.
      const menuSource = item === d._showAppsIcon ? item : app;
      if (menuSource && !menuSource._macMenuHooked &&
          GObject.signal_lookup('menu-state-changed', menuSource.constructor.$gtype)) {
        this._connect(menuSource, 'menu-state-changed', (_a, opened) => {
          this._menuOpen = !!opened;
          if (opened) {
            this._hideHover();
            this._raiseMenu(menuSource._menu);
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
              if (this._menuOpen)
                this._raiseMenu(menuSource._menu);
              return GLib.SOURCE_REMOVE;
            });
          } else {
            try { Main.layoutManager.untrackChrome(menuSource._menu?.actor); } catch (_) {}
            this._restoreMenuLayer();
          }
        });
        menuSource._macMenuHooked = true;
      }
      for (const area of app?._iconContainer?.get_children() ?? []) {
        if (area instanceof St.DrawingArea)
          this._set(area, {translation_y: dot * DOT_DROP + this._cssPx(DOT_SHIFT_PX)});
      }
      // The drawing area holding the dots is a sibling of the icon, so lowering
      // the icon leaves the dots where they are. The badge is placed off the
      // icon texture in _updateBadge, so it follows the icon down by itself.
      this._set(this._visual(item), {translation_y: dot * ICON_DROP});
      if (!this._motion.has(item)) this._target(item, this._restScale(item), 0);
      this._renderState(item, this._motion.get(item));
      if (app?.app)
        this._prepareDrag(app, item);
      this._prepareAppActivation(app);
      const container = app?._iconContainer;
      if (container && !container._macDockObserved) {
        container._macDockObserved = true;
        this._connect(container, 'child-added', () => this._queuePrepare());
      }
    }
    this._updatePlate();
    this._applyRestPose();
    this._queueGeometrySync();
  }

  _applyRestPose() {
    for (const item of this._items()) {
      const state = this._motion.get(item);
      if (state)
        this._renderState(item, state);
    }
    const plate = this._dash?._background;
    if (_liveActor(plate))
      plate.translation_y = this._dotSize() * PLATE_DROP;
  }

  _prepareDrag(app, item) {
    if (!app || app._macDragPatched)
      return;
    this._remember(app, ['getDragActor', 'getDragActorSource']);
    app._macDragPatched = true;
    const origGet = app.getDragActor?.bind(app);
    app.getDragActor = () => {
      const size = this._dash?.iconSize || 64;
      const actor = origGet ? origGet() : app.app?.create_icon_texture(size);
      try {
        if (actor.set_icon_size)
          actor.set_icon_size(size);
        actor.set_size(size, size);
        actor.scale_x = 1;
        actor.scale_y = 1;
      } catch (_) {}
      return actor;
    };
    app.getDragActorSource = () => app;
  }

  _prepareAppActivation(app) {
    if (!app || typeof app.activate !== 'function' || app._macDockActivatePatched)
      return;
    this._remember(app, ['activate']);
    const originalActivate = app.activate;
    app._macDockActivatePatched = true;
    app.activate = button => {
      if (button === 1 && this._handleAppClick(app))
        return;
      return originalActivate.call(app, button);
    };
  }

  _prepareTexture(item) {
    const visual = this._visual(item);
    const icon = visual?.icon;
    if (!(icon instanceof St.Icon)) return;
    const base = this._dash.iconSize;
    const factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
    // This is the same logical texture size used by the original curve. Do
    // not multiply it by the monitor scale: St.Icon applies that when it
    // uploads the texture, while the actor geometry remains in stage units.
    const hi = Math.ceil(base * this._maxScale() * ICON_RENDER_SCALE);
    const restPx = Math.max(1, Math.round(base * factor));
    this._remember(icon, ['icon_size', 'width', 'height', 'min_width_set', 'natural_width_set', 'min_height_set', 'natural_height_set', 'scale_x', 'scale_y', 'pivot_point', 'style', 'clip_to_allocation']);
    const nativeGicon = this._nativeAppGicon(item, icon);
    if (this._isOneClickPublish(item))
      this._setAssetIcon(icon, ONE_CLICK_PUBLISH_ICON, '_macOneClickPublish');
    else if (nativeGicon)
      this._restoreNativeIcon(icon, nativeGicon);
    else if (item?.child?.app && item !== this._dash._showAppsIcon)
      this._setAssetIcon(icon, UNKNOWN_APP_ICON, '_macUnknownApp');
    if (item === this._dash._showAppsIcon)
      this._setAssetIcon(icon, `${ASSETS}/launchpad.svg`, '_macDockLaunch');
    const customAsset = icon._macOneClickPublish ||
      icon._macUnknownApp || icon._macDockLaunch;
    if (customAsset && !icon._macCustomAssetObserved) {
      icon._macCustomAssetObserved = true;
      this._connect(icon, 'notify::gicon', () => {
        if (!this._active || icon._macAssetRepairId)
          return;
        icon._macAssetRepairId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          icon._macAssetRepairId = 0;
          if (this._active && icon.get_stage?.())
            this._poseItem(item);
          return GLib.SOURCE_REMOVE;
        });
      });
    }
    // Pin the layout box to rest size first so a large icon_size cannot
    // flash as a clipped, magnified placeholder while the SVG loads.
    icon.set_size(restPx, restPx);
    icon.clip_to_allocation = true;
    this._applyIconStyle(icon, customAsset);
    const artScale = this._artScale(item);
    icon.set_pivot_point(0.5, 0.5);
    icon.set_scale(artScale, artScale);
    if (icon._macDockBase !== base || icon._macDockFactor !== factor || icon.icon_size !== hi)
      icon.set_icon_size(hi);
    icon.set_size(restPx, restPx);
    icon._macDockBase = base;
    icon._macDockFactor = factor;
  }

  _poseItem(item) {
    if (!item || !this._visual(item)) return;
    const visual = this._visual(item);
    const bin = visual._iconBin;
    if (bin && !bin._macTextureObserved) {
      // BaseIcon.update() replaces the texture inside _iconBin. Repair it
      // before allocation/paint, preserving the current animation position.
      this._connect(bin, 'notify::child', () => {
        if (bin.child) this._poseItem(item);
      });
      bin._macTextureObserved = true;
    }
    this._prepareTexture(item);
    this._remember(visual, ['scale_x', 'scale_y', 'translation_y', 'pivot_point']);
    const state = this._motion.get(item);
    this._target(item, state?.targetScale ?? this._restScale(item), state?.targetX ?? 0);
    this._renderState(item, this._motion.get(item));
  }

  _setAssetIcon(icon, path, marker) {
    if (!icon)
      return;
    const uri = Gio.File.new_for_path(path).get_uri();
    this._remember(icon, ['gicon', 'style']);
    if (icon._macAssetUri !== uri)
      icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(path));
    icon._macAssetUri = uri;
    icon[marker] = true;
  }

  _restoreNativeIcon(icon, gicon) {
    if (!icon?._macUnknownApp || !gicon)
      return;
    this._remember(icon, ['gicon', 'style']);
    let sameIcon = icon.gicon === gicon;
    try { sameIcon ||= icon.gicon?.equal?.(gicon) ?? false; } catch (_) {}
    // Clear our cache before setting gicon: notify::gicon is synchronous, and
    // its repair callback must see this as a native texture rather than queue
    // another unknown-icon replacement.
    delete icon._macUnknownApp;
    delete icon._macAssetUri;
    if (!sameIcon)
      icon.gicon = gicon;
  }

  _appIdentity(item) {
    const info = item?.child?.app?.appInfo;
    if (!info)
      return '';
    const values = [
      info.get_id?.(),
      info.get_filename?.(),
      info.get_name?.(),
    ];
    return values.filter(Boolean).join(' ').toLowerCase();
  }

  _isOneClickPublish(item) {
    const identity = this._appIdentity(item);
    return /yi-jian-fa-bu|一键发布|one-click[ -]?publish/.test(identity);
  }

  _applyIconStyle(icon, customAsset = false) {
    if (!icon)
      return;
    const current = icon.style ?? '';
    const applied = icon._macDockAppliedStyle;
    const source = applied && current === applied
      ? (icon._macDockSourceStyle ?? '') : current;
    const shadow = this._dark
      ? 'icon-shadow: 0 3px 8px rgba(0, 0, 0, 0.56)'
      : 'icon-shadow: 0 3px 8px rgba(0, 0, 0, 0.30)';
    const rules = [source, 'border-radius: 18px', 'overflow: hidden', shadow]
      .filter(Boolean);
    if (customAsset)
      rules.push('background-image: none', 'icon-style: regular');
    const next = rules.join('; ');
    if (current !== next)
      icon.set_style(next);
    icon._macDockSourceStyle = source;
    icon._macDockAppliedStyle = next;
    icon.clip_to_allocation = false;
  }

  _applyPlateShadow() {
    const plate = this._dash?._background;
    if (!plate)
      return;
    // CSS box-shadow is rasterized at the native plate width and then becomes
    // soft when the plate is magnified. The independent Cairo plate actor is
    // the only visible background now; leave the native actor as a transparent
    // layout anchor so Dash allocation remains stable.
    this._remember(plate, ['opacity', 'scale_x', 'scale_y', 'offscreen_redirect',
      'clip_to_allocation']);
    this._set(plate, {
      opacity: 0,
      scale_x: 1,
      scale_y: 1,
      offscreen_redirect: Clutter.OffscreenRedirect.DISABLED,
    });
  }

  _applyGlassEffect() {
    const plate = this._dash?._background;
    if (!plate)
      return;
    // The light plate is painted by one CSS layer. Remove any legacy effect
    // left by an older session so it cannot double-paint the rounded plate.
    const effect = plate.get_effect?.('macDockGlass');
    if (effect) {
      try { plate.remove_effect(effect); } catch (_) {}
    }
  }

  _prepareDrives() {
    this._drives?.prepare();
  }

  _items() {
    const d = this._dash;
    if (!_liveActor(d) || !_liveActor(d._box))
      return [];
    let children = [];
    try { children = d._box.get_children(); } catch (_) { return []; }
    const result = [];
    for (const item of children) {
      if (!_liveActor(item))
        continue;
      try {
        if (item.visible && item.get_parent?.() && item.child?.icon &&
            item !== d._dragPlaceholder)
          result.push(item);
      } catch (_) {}
    }
    try {
      const showApps = d._showAppsIcon;
      if (_liveActor(showApps) && showApps.visible && showApps.get_parent?.())
        result.push(showApps);
    } catch (_) {}
    try { return result.sort((a, b) => this._centerX(a) - this._centerX(b)); }
    catch (_) { return result; }
  }

  _visual(item) { return item?.icon ?? item?.child?.icon ?? null; }
  _iconSize() { return (this._dash?.iconSize ?? 52) * St.ThemeContext.get_for_stage(global.stage).scale_factor; }

  _nativeAppGicon(item, icon) {
    const app = item?.child?.app;
    if (!app || item === this._dash?._showAppsIcon)
      return null;
    let appGicon = null;
    try { appGicon = app.appInfo?.get_icon?.() ?? null; } catch (_) {}
    if (this._isOwnAppGicon(appGicon))
      return appGicon;

    // A Shell window can briefly be represented by a generic tracker app
    // while its Dash icon already has the desktop entry's GIcon. Preserve
    // that real visual icon rather than replacing it with our fallback.
    let visualGicon = null;
    try { visualGicon = icon?.gicon ?? null; } catch (_) {}
    if (!icon?._macUnknownApp && this._isOwnAppGicon(visualGicon))
      return visualGicon;

    // An old unknown-app replacement may still be on an existing actor when
    // this extension is refreshed. _remember() kept the native GIcon before
    // the replacement, so it can be restored without waiting for Dash to
    // recreate the item.
    const savedGicon = this._saved?.get(icon)?.properties?.gicon;
    return this._isOwnAppGicon(savedGicon) ? savedGicon : null;
  }

  _isOwnAppGicon(gicon) {
    if (!gicon)
      return false;
    let names = [];
    try { names = gicon.get_names?.() ?? []; } catch (_) { return false; }
    // FileIcon (DaVinci Resolve is one) and other non-themed GIcons do not
    // expose names. Their existence itself is an explicit app icon.
    if (!names.length)
      return true;
    return !names.every(name => DEFAULT_APP_ICON_NAMES.has(
      `${name}`.trim().toLowerCase().replace(/-symbolic$/, '')));
  }

  _artScale(item) { return 1; }

  _restScale(item) {
    return Math.min(REST_ICON_SCALE, this._maxScale());
  }

  _maxScale() {
    return this._cssPx(MAX_ICON_SIZE_PX) / this._iconSize();
  }
  _dotSize() { return Math.round((this._dash?.iconSize ?? 52) / 11); }
  _cssPx(px) { return px * St.ThemeContext.get_for_stage(global.stage).scale_factor; }

  _centerX(item) {
    if (!_liveActor(item))
      return 0;
    const parent = item?.get_parent?.();
    if (!parent || !_liveActor(parent))
      return 0;
    try {
      const box = item.get_allocation_box();
      const point = new Graphene.Point3D({x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2, z: 0});
      // Parent-to-stage transform deliberately excludes the item's animated
      // translation and the visual's scale. Targets cannot feed back on themselves.
      return parent.apply_relative_transform_to_point(global.stage, point).x;
    } catch (_) {
      return 0;
    }
  }

  _raiseDock() {
    if (this._menuOpen)
      return;
    const dock = this._dock;
    const parent = dock?.get_parent();
    if (parent)
      parent.set_child_above_sibling(dock, null);
  }

  _isFullyShown() {
    const d = this._dock;
    if (!d || d._dockState === 0 || d._dockState === 3)
      return false;
    return (d._slider?.slide_x ?? 1) >= 0.999;
  }

  _inHiddenRevealZone(x, y) {
    const dock = this._dock;
    const monitor = dock?._monitor;
    if (!dock || !monitor || !dock._autohideIsEnabled || dock._ignoreHover ||
        Main.overview.visibleTarget || this._menuOpen || this._dragging ||
        this._screenshotActive())
      return false;
    if (dock._dockState !== 0 && dock._dockState !== 3)
      return false;
    if (monitor.inFullscreen) {
      try {
        if (this._revealSettings &&
            !this._revealSettings.get_boolean('autohide-in-fullscreen'))
          return false;
      } catch (_) {}
    }
    const bottom = monitor.y + monitor.height;
    if (y < bottom - 1 || y >= bottom)
      return false;
    const plate = this._dash?._background;
    if (!_liveActor(plate) || !plate.has_allocation())
      return false;
    // Sliding only moves the background vertically. Its current horizontal
    // allocation gives the actual Dock span, including after icon changes.
    const [left, , width] = this._actorXYWH(plate);
    const right = left + width;
    return width > 0 && x >= Math.max(monitor.x, left) &&
      x < Math.min(monitor.x + monitor.width, right);
  }

  _snapRest() {
    this._near = false;
    this._hoverItem = null;
    this._syncHover();
    for (const [item, state] of this._motion) {
      state.targetScale = this._restScale(item);
      state.targetX = 0;
      state.scale = this._restScale(item);
      state.tx = 0;
      state.layoutShift = 0;
      this._renderState(item, state);
    }
    this._updatePlate();
    this._stopFrames();
  }

  _screenshotActive() {
    // The screenshot UI owns the pointer while selecting an area/window.
    // Include its asynchronous capture and closing fade, not a recording
    // continuing after the controls have closed.
    return !!(Main.screenshotUI?.visible ||
      Main.screenshotUI?._openingCoroutineInProgress);
  }

  _suspendForScreenshot() {
    if (!this._screenshotActive())
      return false;
    this._revealInZone = false;
    // Stop an existing magnification immediately; resetting with _reset()
    // would itself start another shrink animation under the screenshot UI.
    if (this._near || this._hoverItem || this._pumping)
      this._snapRest();
    return true;
  }

  _onPointer(x, y) {
    const d = this._dock;
    if (!d || !this._dash) return;
    if (this._suspendForScreenshot())
      return;
    if (this._dragging)
      return;
    // Keep interpolating toward rest while the dock is hiding so fullscreen
    // autohide still plays the shrink animation.
    if (!this._isFullyShown()) {
      const inRevealZone = this._inHiddenRevealZone(x, y);
      if (inRevealZone && !this._revealInZone) {
        this._revealInZone = true;
        // Reuse Ubuntu Dock's pressure callback so its normal delayed hide
        // guard remains active after the bottom edge has shown it.
        try {
          if (typeof d._onPressureSensed === 'function')
            d._onPressureSensed();
          else
            d._show?.();
        } catch (_) {
          try { d._show?.(); } catch (_) {}
        }
      } else if (!inRevealZone) {
        this._revealInZone = false;
      }
      if (this._near || this._pumping)
        this._reset();
      return;
    }
    if (this._pumping && !this._inFrame)
      return;
    if (Main.overview.visible)
      this._raiseDock();
    const plate = this._dash._background;
    const [bx, by] = plate.get_transformed_position();
    const [bw, bh] = plate.get_transformed_size();
    const onBar = x >= bx && x <= bx + bw && y >= by && y <= by + bh + GAP;
    // The icon hit test sorts and transforms every dock item, so run it only where
    // an icon can actually be hit: no hit box reaches further above the plate than
    // one fully magnified icon plus the dot/shadow room (_hitReach), and with the
    // pointer on the bar the icon result is not needed at all. Before this, every
    // pointer motion anywhere on screen paid for it while the dock was shown.
    const hit = onBar || (y >= by - this._hitReach() && !!this._iconAt(x, y));
    if (hit) {
      this._near = true;
      this._raiseDock();
      this._magnify(x);
    } else if (this._near) {
      this._reset();
    }
  }

  _magnify(x) {
    const items = this._items();
    if (!items.length) return;
    const centers = items.map(item => this._centerX(item));
    let nearest = 0;
    centers.forEach((c, i) => {if (Math.abs(x - c) < Math.abs(x - centers[nearest])) nearest = i;});
    const left = centers[nearest - 1] ?? centers[nearest] - this._iconSize() - 16;
    const right = centers[nearest + 1] ?? centers[nearest] + this._iconSize() + 16;
    const pitch = x < centers[nearest] ? centers[nearest] - left : right - centers[nearest];
    const hover = nearest + (x - centers[nearest]) / Math.max(1, pitch);
    const peak = this._maxScale();
    const scales = items.map((item, i) => {
      const rest = this._restScale(item);
      const distance = Math.min(1, Math.abs(i - hover) / MAGNIFY_RADIUS);
      return rest + (peak - rest) * (1 + Math.cos(Math.PI * distance)) / 2;
    });
    const widths = scales.map((s, i) =>
      (s - this._restScale(items[i])) * this._iconSize() * MAGNIFY_SPREAD);
    let offset = -widths.reduce((a, b) => a + b, 0) / 2;
    items.forEach((item, i) => {
      this._target(item, scales[i], offset + widths[i] / 2);
      offset += widths[i];
    });
    this._hoverItem = items[nearest];
    this._syncHover();
    this._animate();
  }

  _stageBox(actor) {
    try {
      const box = actor.get_allocation_box();
      const parent = actor.get_parent();
      if (parent && box) {
        const p1 = parent.apply_relative_transform_to_point(global.stage,
          new Graphene.Point3D({x: box.x1, y: box.y1, z: 0}));
        const p2 = parent.apply_relative_transform_to_point(global.stage,
          new Graphene.Point3D({x: box.x2, y: box.y2, z: 0}));
        const w = p2.x - p1.x;
        const h = p2.y - p1.y;
        if (w > 1 && h > 1)
          return [p1.x, p1.y, w, h];
      }
    } catch (_) {}
    return this._actorXYWH(actor);
  }

  _actorXYWH(actor) {
    let x = 0, y = 0, w = 0, h = 0;
    try {
      const pos = actor.get_transformed_position();
      x = pos.x ?? pos[0];
      y = pos.y ?? pos[1];
    } catch (_) {}
    try {
      const size = actor.get_transformed_size();
      if (Array.isArray(size) && size.length >= 3 && typeof size[0] === 'boolean') {
        w = size[1];
        h = size[2];
      } else if (Array.isArray(size)) {
        w = size[0];
        h = size[1];
      } else {
        w = size.width;
        h = size.height;
      }
    } catch (_) {}
    if (!(w > 1 && h > 1)) {
      w = actor.width || 0;
      h = actor.height || 0;
    }
    return [Number(x) || 0, Number(y) || 0, Number(w) || 0, Number(h) || 0];
  }

  _hideHover() {
    const actor = this._hoverActor;
    if (!actor || _dead.has(actor))
      return;
    actor.hide();
    actor.set_scale(1, 1);
    actor._macRaised = false;
  }

  _raiseMenu(menu) {
    const actor = menu?.actor;
    if (!actor)
      return;
    const seen = new Set();
    const raise = current => {
      if (!current || seen.has(current) || _dead.has(current))
        return;
      _watchDestroy(current);
      seen.add(current);
      this._menuActorStates ??= new Map();
      if (!this._menuActorStates.has(current)) {
        this._menuActorStates.set(current, {
          clip_to_allocation: current.clip_to_allocation,
          clip_to_view: current.clip_to_view,
          offscreen_redirect: current.offscreen_redirect,
        });
      }
      this._menuHooks ??= new Map();
      if (!this._menuHooks.has(current)) {
        try {
          const id = current.connect('child-added', () => {
            if (this._menuOpen)
              this._raiseMenu(menu);
          });
          this._menuHooks.set(current, id);
        } catch (_) {}
      }
      try {
        current.clip_to_allocation = false;
        current.clip_to_view = false;
        current.offscreen_redirect = Clutter.OffscreenRedirect.DISABLED;
      } catch (_) {}
      try { Main.layoutManager.trackChrome(current); } catch (_) {}
      try {
        let cursor = current;
        while (cursor) {
          const parent = cursor.get_parent();
          if (!parent)
            break;
          parent.set_child_above_sibling(cursor, null);
          if (parent === Main.layoutManager.uiGroup || parent === global.stage)
            break;
          cursor = parent;
        }
      } catch (_) {}
      try {
        for (const child of current.get_children())
          raise(child);
      } catch (_) {}
    };
    raise(actor);
    try {
      let current = actor;
      while (current) {
        const parent = current.get_parent();
        if (!parent)
          break;
        parent.set_child_above_sibling(current, null);
        if (parent === Main.layoutManager.uiGroup || parent === global.stage)
          break;
        current = parent;
      }
    } catch (_) {}
    try {
      if (this._dock?.get_parent() && actor.get_parent() === this._dock.get_parent())
        actor.get_parent().set_child_above_sibling(actor, this._dock);
    } catch (_) {}
  }

  _restoreMenuLayer() {
    for (const [actor, saved] of this._menuActorStates ?? []) {
      if (_dead.has(actor))
        continue;
      try {
        actor.clip_to_allocation = saved.clip_to_allocation;
        actor.clip_to_view = saved.clip_to_view;
        actor.offscreen_redirect = saved.offscreen_redirect;
      } catch (_) {}
    }
    for (const [actor, id] of this._menuHooks ?? []) {
      if (_dead.has(actor))
        continue;
      try { actor.disconnect(id); } catch (_) {}
    }
    this._menuActorStates?.clear();
    this._menuHooks?.clear();
  }

  _ensureHover() {
    if (this._hoverActor && !_dead.has(this._hoverActor))
      return this._hoverActor;
    const actor = new St.DrawingArea({
      name: 'macDockHover',
      reactive: false,
    });
    _watchDestroy(actor);
    actor.connect('repaint', a => this._onHoverPaint(a));
    actor.clip_to_allocation = false;
    this._hoverActor = actor;
    try {
      Main.layoutManager.addTopChrome(actor);
    } catch (_) {
      Main.layoutManager.uiGroup.add_child(actor);
    }
    return actor;
  }

  _onHoverPaint(area) {
    const cr = area.get_context();
    let width = area.width, height = area.height;
    try {
      const size = area.get_surface_size();
      width = size[0] ?? size.width ?? width;
      height = size[1] ?? size.height ?? height;
    } catch (_) {}
    if (width < 2 || height < 2) {
      cr.$dispose();
      return;
    }
    try { cr.setAntialias(Cairo.Antialias.BEST); } catch (_) {}
    const radius = Math.min(area._macRadius || Math.min(width, height) * 0.22,
      Math.min(width, height) / 2);
    const draw = (inset, alpha) => {
      const w = width - inset * 2;
      const h = height - inset * 2;
      const r = Math.max(0, Math.min(radius - inset, Math.min(w, h) / 2));
      if (w < 2 || h < 2)
        return;
      if (this._dark)
        cr.setSourceRGBA(1, 1, 1, alpha);
      else
        cr.setSourceRGBA(0, 0, 0, alpha);
      cr.newPath();
      cr.arc(inset + r, inset + r, r, Math.PI, Math.PI * 1.5);
      cr.arc(inset + w - r, inset + r, r, Math.PI * 1.5, Math.PI * 2);
      cr.arc(inset + w - r, inset + h - r, r, 0, Math.PI * 0.5);
      cr.arc(inset + r, inset + h - r, r, Math.PI * 0.5, Math.PI);
      cr.closePath();
      cr.fill();
    };
    draw(0, this._dark ? 0.20 : 0.14);
    draw(this._cssPx(1), this._dark ? 0.08 : 0.06);
    cr.$dispose();
  }

  _syncHover() {
    // Overlay failures must not abort _onFrame before icon scales are applied.
    try {
      this._syncHoverOverlay();
    } catch (e) {
      logError(e, 'dock hover overlay');
    }
  }

  _syncHoverOverlay() {
    const actor = this._ensureHover();
    const active = this._hoverItem;
    if (this._menuOpen || !active || !this._near || !this._isFullyShown()) {
      this._hideHover();
      this._layoutHit();
      return;
    }

    const visual = this._visual(active);
    const texture = visual?.icon;
    const state = this._motion.get(active);
    const scale = state?.scale || texture?.scale_x || visual?.scale_x || 1;
    const host = texture || visual || active;
    let [x, y, w, h] = this._stageBox(host);
    const max = this._iconSize() * 4;
    if (!(w > 1 && h > 1) || !Number.isFinite(x + y + w + h) || w > max || h > max) {
      this._hideHover();
      this._layoutHit();
      return;
    }
    const pad = this._cssPx(2);
    const bw = Math.max(2, w + pad * 2);
    const bh = Math.max(2, h + pad * 2);
    const peak = this._maxScale();
    const peakW = Math.ceil(bw * peak);
    const peakH = Math.ceil(bh * peak);
    if (actor._macPeakW !== peakW || actor._macPeakH !== peakH) {
      actor._macPeakW = peakW;
      actor._macPeakH = peakH;
      actor._macRadius = this._cssPx(16) * peak;
      actor.set_size(peakW, peakH);
      actor.queue_repaint();
    }
    const pivotY = (h + pad) / bh;
    const cx = x + w / 2;
    const cy = y + h;
    actor.set_pivot_point(0.5, pivotY);
    actor.set_position(cx - peakW / 2, cy - peakH * pivotY);
    actor.set_scale(scale / peak, scale / peak);
    actor.show();
    if (!actor._macRaised) {
      actor.get_parent()?.set_child_above_sibling(actor, null);
      actor._macRaised = true;
    }
    this._layoutHit();
  }

  _scaledGlyphBox(item) {
    const visual = this._visual(item);
    const texture = visual?.icon;
    const host = texture || visual;
    if (!host)
      return null;
    const state = this._motion.get(item);
    const scale = state?.scale || 1;
    const [x, y, w, h] = this._stageBox(host);
    if (!(w > 1 && h > 1))
      return null;
    const sw = w * scale;
    const sh = h * scale;
    return [x + (w - sw) / 2, y + (h - sh), sw, sh];
  }

  _hitBox(item) {
    const box = this._scaledGlyphBox(item);
    if (!box)
      return null;
    const [ix, iy, iw, ih] = box;
    const hw = iw * HIT_WIDTH;
    const hh = ih * HIT_HEIGHT;
    return [ix + (iw - hw) / 2, iy + (ih - hh) / 2, hw, hh];
  }

  _iconAt(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const item of this._items()) {
      const box = this._hitBox(item);
      if (!box)
        continue;
      const [ix, iy, iw, ih] = box;
      if (x < ix || x > ix + iw || y < iy || y > iy + ih)
        continue;
      const cx = ix + iw / 2;
      const cy = iy + ih / 2;
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best;
  }

  _ensureHit() {
    if (this._hitActor && !_dead.has(this._hitActor))
      return this._hitActor;
    const actor = new St.Widget({
      name: 'macDockHit',
      reactive: true,
      opacity: 1,
    });
    this._hitActor = actor;
    try {
      Main.layoutManager.addTopChrome(actor);
    } catch (_) {
      Main.layoutManager.uiGroup.add_child(actor);
    }
    this._connect(actor, 'button-press-event', (_a, event) => this._onHitPress(event));
    this._connect(actor, 'button-release-event', (_a, event) => this._onHitRelease(event));
    return actor;
  }

  _layoutHit() {
    const actor = this._ensureHit();
    // Keep the expanded hit layer live for the whole visible Dock. Previously
    // it appeared only after pointer tracking had already entered the native
    // Dock bar, so a click in the enlarged outer area could still miss it.
    if (!this._isFullyShown() || this._menuOpen || this._dragging || this._screenshotActive()) {
      actor.hide();
      actor.reactive = false;
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const item of this._items()) {
      const box = this._hitBox(item);
      if (!box)
        continue;
      const [x, y, w, h] = box;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
    if (!Number.isFinite(minX)) {
      actor.hide();
      actor.reactive = false;
      return;
    }
    actor.set_position(minX, minY);
    actor.set_size(maxX - minX, maxY - minY);
    actor.reactive = true;
    actor.show();
    try { Main.layoutManager._queueUpdateRegions(); } catch (_) {}
  }

  _onHitPress(event) {
    const [x, y] = event.get_coords();
    this._hitPressed = this._iconAt(x, y);
    return this._hitPressed ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
  }

  _handleAppClick(targetOrApp) {
    const app = targetOrApp?.app ?? targetOrApp;
    if (!app)
      return false;

    let windows = [];
    try {
      const nativeWindows = targetOrApp?.getInterestingWindows?.() ??
        app.get_windows?.() ?? [];
      windows = [...nativeWindows].filter(window => window);
    } catch (_) {}
    if (windows.length === 0)
      return false;

    const isMinimized = window => {
      try {
        return !!window.minimized;
      } catch (_) {
        return false;
      }
    };

    // A click on an app with several minimized windows should restore the
    // whole app, rather than letting Ubuntu Dock raise only its first window.
    if (windows.length > 1 && windows.every(isMinimized)) {
      let restored = false;
      for (const window of windows) {
        try {
          if (typeof window.unminimize === 'function')
            window.unminimize();
          else
            Main.activateWindow(window);
          restored = true;
        } catch (_) {}
      }

      // Give focus to one restored window without switching workspaces once
      // for every window in the application.
      if (restored) {
        try {
          const activeWorkspace = global.workspace_manager.get_active_workspace();
          const focusWindow = windows.find(window =>
            window.get_workspace?.() === activeWorkspace) ?? windows[0];
          Main.activateWindow(focusWindow);
        } catch (_) {}
      }
      return restored;
    }

    let focusedWindow = null;
    try {
      focusedWindow = global.display.focus_window ??
        global.display.get_focus_window?.();
    } catch (_) {}

    let ownsFocusedWindow = false;
    if (focusedWindow) {
      try {
        ownsFocusedWindow =
          Shell.WindowTracker.get_default().get_window_app(focusedWindow) === app;
      } catch (_) {}
    }
    if (!ownsFocusedWindow && focusedWindow)
      try { ownsFocusedWindow = windows.includes(focusedWindow); } catch (_) {}
    if (!ownsFocusedWindow && focusedWindow) {
      let focusedPid = 0;
      try { focusedPid = focusedWindow.get_pid?.() ?? 0; } catch (_) {}
      if (focusedPid > 0) {
        try { ownsFocusedWindow = app.get_pids?.().includes(focusedPid); } catch (_) {}
      }
    }

    if (ownsFocusedWindow) {
      let activeWorkspace = null;
      try {
        activeWorkspace = global.workspace_manager.get_active_workspace();
      } catch (_) {}

      let minimizedAny = false;
      for (const window of windows) {
        try {
          const onActiveWorkspace = !activeWorkspace ||
            window.get_workspace?.() === activeWorkspace;
          const visible = typeof window.showing_on_its_workspace !== 'function' ||
            window.showing_on_its_workspace();
          if (!window.minimized && onActiveWorkspace && visible) {
            window.minimize();
            minimizedAny = true;
          }
        } catch (_) {}
      }
      if (minimizedAny)
        return true;
    }

    // A non-focused application with multiple windows should bring all of
    // them back together. This also fixes the first-window-only behavior of
    // the native Dock action.
    let activated = false;
    for (const window of windows) {
      try {
        Main.activateWindow(window);
        activated = true;
      } catch (_) {}
    }
    return activated;
  }

  _onHitRelease(event) {
    const [x, y] = event.get_coords();
    const item = this._iconAt(x, y);
    const pressed = this._hitPressed;
    this._hitPressed = null;
    if (!item || item !== pressed)
      return Clutter.EVENT_PROPAGATE;
    const button = event.get_button();
    const showApps = this._dash?._showAppsIcon;
    try {
      if (item === showApps) {
        if (button === 3)
          showApps.popupMenu?.();
        else if (showApps.toggleButton)
          showApps.toggleButton.checked = !showApps.toggleButton.checked;
        return Clutter.EVENT_STOP;
      }
      const target = item.child;
      if (button === 1 && this._handleAppClick(target))
        return Clutter.EVENT_STOP;
      if (button === 3)
        target?.popupMenu?.();
      else if (typeof target?.activate === 'function')
        target.activate(button);
      else
        target?.emit('clicked', button);
    } catch (e) {
      logError(e, 'dock hit');
    }
    return Clutter.EVENT_STOP;
  }

  _target(item, scale, tx) {
    let state = this._motion.get(item);
    if (!state) {
      const visual = this._visual(item);
      this._remember(item, ['translation_x']);
      this._remember(visual, ['scale_x', 'scale_y', 'pivot_point']);
      visual.set_scale(1, 1);
      const texture = visual?.icon;
      if (texture) {
        this._remember(texture, ['scale_x', 'scale_y', 'pivot_point']);
        texture.set_pivot_point(0.5, 1);
      } else {
        visual.set_pivot_point(0.5, 1);
      }
      const label = item.label;
      if (label) this._remember(label, ['translation_y']);
      state = {
        visual,
        texture,
        label,
        artScale: this._artScale(item),
        scale: this._restScale(item),
        // Dock items are centered by the native allocation. Never inherit a
        // stale horizontal translation when an icon is added at runtime.
        tx: 0,
        layoutShift: 0,
      };
      this._motion.set(item, state);
    }
    const visual = this._visual(item);
    const texture = visual?.icon;
    if (state.visual !== visual) state.visual = visual;
    if (state.texture !== texture) {
      state.texture = texture;
      if (texture) this._remember(texture, ['scale_x', 'scale_y', 'pivot_point']);
    }
    state.artScale = this._artScale(item);
    state.layoutShift ??= 0;
    state.targetScale = scale;
    state.targetX = tx;
  }

  _animate() {
    if (this._pumping) return;
    this._pumping = true;
    this._framePx = null;
    this._lastFrame = GLib.get_monotonic_time();
    try {
      this._timeline = new Clutter.Timeline({
        actor: global.stage,
        duration: 1000,
        repeat_count: -1,
      });
      this._frameId = this._timeline.connect('new-frame', () => this._onFrame());
      this._timeline.start();
    } catch (_) {
      this._timeline = null;
      this._frameId = 0;
      this._frame = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FALLBACK_FRAME_MS, () => {
        this._onFrame();
        return this._pumping ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
      });
    }
  }

  _onFrame() {
    if (!this._pumping) return;
    if (this._suspendForScreenshot())
      return;
    const now = GLib.get_monotonic_time();
    const dt = Math.max(0, now - (this._lastFrame || now));
    this._lastFrame = now;
    if (Main.overview.visible)
      this._raiseDock();
    let pointerMoved = true;
    if (this._isFullyShown()) {
      this._inFrame = true;
      const [x, y] = global.get_pointer();
      pointerMoved = x !== this._framePx || y !== this._framePy;
      this._framePx = x;
      this._framePy = y;
      this._onPointer(x, y);
      this._inFrame = false;
    } else if (this._near || this._hoverItem) {
      this._near = false;
      this._hoverItem = null;
      for (const [item, state] of this._motion) {
        state.targetScale = this._restScale(item);
        state.targetX = 0;
      }
    }
    // Restore the original icon response. The plate is sized from these same
    // interpolated scales below, so neither can get ahead of the other.
    const alpha = 1 - Math.exp(-dt / MOTION_RESPONSE_US);
    const layoutAlpha = 1 - Math.exp(-dt / 90000);
    let moving = false;
    for (const [item, state] of this._motion) {
      if (!_liveActor(item) || !_liveActor(state.visual)) {
        this._motion.delete(item);
        continue;
      }
      state.scale += (state.targetScale - state.scale) * alpha;
      state.tx += (state.targetX - state.tx) * alpha;
      if (Math.abs(state.targetScale - state.scale) < 0.001 && Math.abs(state.targetX - state.tx) < 0.04) {
        state.scale = state.targetScale;
        state.tx = state.targetX;
      } else {
        moving = true;
      }
      state.layoutShift += (0 - (state.layoutShift ?? 0)) * layoutAlpha;
      if (Math.abs(state.layoutShift) < 0.04)
        state.layoutShift = 0;
      else
        moving = true;
      this._renderState(item, state);
    }
    this._updatePlate();
    this._syncHover();
    // A pointer resting on the dock changes nothing once the icons have settled, so
    // stop the frame pump then as well (the pointer watcher restarts it on the next
    // motion). It used to run at display rate for as long as the pointer stayed near.
    if (!moving && !this._plateAnimating && (!this._near || !pointerMoved)) this._stopFrames();
  }

  _stopFrames() {
    this._pumping = false;
    if (this._frame) {
      try { GLib.source_remove(this._frame); } catch (_) {}
      this._frame = 0;
    }
    const timeline = this._timeline;
    const frameId = this._frameId;
    this._timeline = null;
    this._frameId = 0;
    if (!timeline) return;
    try { if (frameId) timeline.disconnect(frameId); } catch (_) {}
    try { timeline.stop(); } catch (_) {}
  }

  _renderState(item, state) {
    if (!state || !_liveActor(item) || !_liveActor(state.visual))
      return;
    // Scale the glyph only. The overview-icon keeps identity so :hover
    // background-color (the translucent rounded plate) still paints.
    if (state.visual)
      state.visual.set_scale(1, 1);
    if (state.texture instanceof St.Icon) {
      state.texture.set_pivot_point(0.5, 1);
      const artScale = state.artScale ?? this._artScale(item);
      state.texture.set_scale(artScale * state.scale, artScale * state.scale);
    }
    const iconSize = this._iconSize();
    const dotSize = this._dotSize();
    const dotShift = this._cssPx(DOT_SHIFT_PX);
    const drop = dotSize * ICON_DROP;
    if (state.visual)
      state.visual.translation_y = drop;
    const app = item.child;
    for (const area of app?._iconContainer?.get_children() ?? []) {
      if (area instanceof St.DrawingArea)
        area.translation_y = dotSize * DOT_DROP + dotShift;
    }
    item.translation_x = state.tx + (state.layoutShift ?? 0);
    if (state.label) state.label.translation_y = -iconSize * (state.scale - this._restScale(item));
    this._updateBadge(item, state);
  }

  _prepareBadge(label) {
    if (!label) return;
    this._remember(label, ['style', 'text']);

    const currentText = String(label.text ?? '');
    const appliedText = label._macBadgeAppliedText;
    const sourceText = appliedText && currentText === appliedText
      ? (label._macBadgeSourceText ?? currentText)
      : currentText;
    if (label._macBadgePreparedSourceText !== sourceText) {
      const numeric = Number(sourceText.replace(/,/g, ''));
      const badgeText = (Number.isFinite(numeric) && numeric > 99) ||
        /^[0-9]+(?:\.[0-9]+)?[kKmMbB]$/.test(sourceText)
        ? '99+'
        : sourceText;
      const isCapsule = (Number.isFinite(numeric) && numeric >= 10) ||
        /^[0-9]+(?:\.[0-9]+)?[kKmMbB]$/.test(sourceText);
      if (currentText !== badgeText)
        label.text = badgeText;
      label._macBadgeSourceText = sourceText;
      label._macBadgeAppliedText = badgeText;
      if (/^[1-9]$/.test(badgeText)) {
        label.add_style_class_name('macstyle-single-digit-badge');
        label._macBadgeSingleDigit = true;
      } else {
        label.remove_style_class_name('macstyle-single-digit-badge');
        label._macBadgeSingleDigit = false;
      }
      if (isCapsule) {
        label.add_style_class_name('macstyle-capsule-badge');
        label._macBadgeCapsule = true;
      } else {
        label.remove_style_class_name('macstyle-capsule-badge');
        label._macBadgeCapsule = false;
      }
      label._macBadgePreparedSourceText = sourceText;
    }

    // Ubuntu Dock recalculates this inline style when the icon size, theme or
    // scale factor changes. Keep that source style and reapply our badge
    // treatment without multiplying the font size on every animation frame.
    const currentStyle = label.style ?? '';
    const appliedStyle = label._macBadgeAppliedStyle;
    const sourceStyle = appliedStyle && currentStyle === appliedStyle
      ? label._macBadgeSourceStyle
      : currentStyle;
    if (label._macBadgePreparedSourceStyle === sourceStyle && currentStyle === appliedStyle)
      return;
    const match = sourceStyle?.match(/(?:^|;)\s*font-size:\s*([0-9.]+)px/i);
    const baseFontSize = Number(match?.[1]);
    if (!Number.isFinite(baseFontSize) || baseFontSize <= 0) return;

    const nextStyle = [
      sourceStyle,
      `font-size: ${(baseFontSize + BADGE_FONT_BOOST) * BADGE_RENDER_SCALE}px`,
      `font-family: ${BADGE_FONT_FAMILY}`,
      'font-weight: 700',
      'letter-spacing: -0.28px',
      'font-feature-settings: "pnum" 1',
    ].join('; ');
    if (currentStyle !== nextStyle)
      label.set_style(nextStyle);
    label._macBadgeSourceStyle = sourceStyle;
    label._macBadgeAppliedStyle = nextStyle;
    label._macBadgePreparedSourceStyle = sourceStyle;
  }

  _updateBadge(item, state) {
    const texture = state.visual.icon;
    if (!texture?.get_transformed_position || !texture.has_allocation()) return;
    const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
    const badgeYShift = scaleFactor * BADGE_Y_SHIFT_PX;
    const badgeTextYShift = scaleFactor * BADGE_TEXT_Y_SHIFT_PX;
    for (const indicator of item.child?._indicator?._indicators ?? []) {
      const bin = indicator._notificationBadgeBin;
      if (!bin?.child || !bin.has_allocation()) continue;
      const label = bin.child;
      this._remember(bin, ['translation_x', 'translation_y']);
      this._remember(label, ['pivot_point', 'scale_x', 'scale_y']);
      this._prepareBadge(label);
      // Keep the badge's final area at half of its current area, then apply
      // exactly the same live magnification ratio as the icon. Using the
      // item's own rest scale also keeps the Show Applications item correct.
      const restScale = Math.max(0.001, this._restScale(item));
      const iconRatio = state.scale / restScale;
      const badgeScale = BADGE_SCALE / BADGE_RENDER_SCALE * BADGE_SIZE_SCALE * iconRatio;
      label.set_pivot_point(0, 0);
      label.set_scale(badgeScale, badgeScale);
      const clutterText = label._macBadgeTextActor ??=
        (label.clutterText ?? label.clutter_text);
      if (clutterText) {
        this._remember(clutterText, ['translation_y']);
        const savedTextY = this._saved.get(clutterText)?.properties.translation_y ?? 0;
        clutterText.translation_y = savedTextY - badgeTextYShift / Math.max(0.001, badgeScale);
      }
      const [x, y] = texture.get_transformed_position();
      const [width] = texture.get_transformed_size();
      const inset = 2 * scaleFactor * state.scale;
      // Position relative to the actual rendered badge diameter. Keep the
      // existing anchor correction, then move the badge another half-radius
      // toward the lower-left as requested.
      const badgeDiameter = Math.max(1, label.height * badgeScale);
      const badgeRadius = badgeDiameter / 2;
      const lowerLeftShift = badgeRadius * 0.5;
      const [ok, cx, cy] = bin.get_parent().transform_stage_point(
        x + width - inset - badgeRadius + badgeDiameter * BADGE_RIGHT_SHIFT - lowerLeftShift,
        y + inset + badgeRadius - badgeDiameter * BADGE_UP_SHIFT + lowerLeftShift - badgeYShift
      );
      if (ok) {
        bin.translation_x = cx - bin.x - label.x - label.width * badgeScale / 2;
        bin.translation_y = cy - bin.y - label.y - label.height * badgeScale / 2;
      }
    }
  }

  _updatePlate() {
    const plate = this._dash?._background;
    if (!_liveActor(plate) || !_liveActor(this._dash)) return;
    plate.translation_y = this._dotSize() * PLATE_DROP;
    let extra = 0;
    for (const [item, state] of this._motion)
      extra += Math.max(0, state.scale - this._restScale(item)) *
        this._iconSize() * MAGNIFY_SPREAD;
    // Keep the plate's layout width fixed. Growing its preferred width makes
    // the centered Dash resize on every animation frame; near an end icon the
    // pointer then changes the nearest item again, which makes the whole dock
    // oscillate left and right. Transform only the already-unclipped plate so
    // its visual width can grow without feeding back into dock allocation.
    const base = this._dash._dashContainer?.width || plate.width || 0;
    const width = Math.max(1, base);
    const targetWidth = width + extra;
    this._plateVisualWidth = targetWidth;
    this._plateAnimating = false;
    // Never stretch CSS or shadow pixels. The independent Cairo actor follows
    // the already-eased icon bounds in this frame, with no extra lag.
    if (plate.scale_x !== 1 || plate.scale_y !== 1)
      plate.set_scale(1, 1);
    this._syncPlateActor();
  }

  _reset() {
    this._near = false;
    this._hoverItem = null;
    this._syncHover();
    for (const [item] of this._motion) this._target(item, this._restScale(item), 0);
    this._animate();
  }

  _removePaintVolume() {
    if (this._paintVolumeActor && !_dead.has(this._paintVolumeActor))
      this._paintVolumeActor.remove_effect(this._paintVolumeEffect);
    this._paintVolumeActor = null;
    this._paintVolumeEffect = null;
  }

  _detach() {
    this._watch?.remove();
    this._watch = null;
    if (this._geometryLaterId)
      global.compositor.get_laters().remove(this._geometryLaterId);
    this._geometryLaterId = 0;
    this._removePaintVolume();
    this._restoreMenuLayer();
    this._drives?.disable();
    this._drives = null;
    if (this._prepareId) GLib.source_remove(this._prepareId);
    this._prepareId = 0;
    if (this._layoutTransitionId) {
      try { GLib.source_remove(this._layoutTransitionId); } catch (_) {}
      this._layoutTransitionId = 0;
    }
    this._stopFrames();
    for (const {object, id, destroyId} of this._connections) {
      if (!object) continue;
      try {
        if (object instanceof Clutter.Actor && !_liveActor(object))
          continue;
        if (id > 0 && GObject.signal_handler_is_connected(object, id))
          object.disconnect(id);
        if (destroyId > 0 && GObject.signal_handler_is_connected(object, destroyId))
          object.disconnect(destroyId);
        delete object._macDockObserved;
        delete object._macHoverHooked;
        delete object._macMenuHooked;
        delete object._macTextureObserved;
      } catch (_) {}
    }
    this._connections = [];
    if (this._clipOwner && this._clipOwner.set_clip === this._clipWrapper) {
      if (this._nativeClip && !_dead.has(this._clipOwner))
        Clutter.Actor.prototype.set_clip.call(this._clipOwner, ...this._nativeClip);
      if (this._clipDescriptor) Object.defineProperty(this._clipOwner, 'set_clip', this._clipDescriptor);
      else delete this._clipOwner.set_clip;
    }
    for (const key of ['_hoverActor', '_hitActor', '_plateActor']) {
      const actor = this[key];
      this[key] = null;
      // The Shell destroys chrome actors before the Dock during shutdown.
      // A disposed wrapper must never be passed back into native cleanup.
      if (!actor || _dead.has(actor))
        continue;
      Main.layoutManager.untrackChrome(actor);
      actor.destroy();
    }
    this._hitPressed = null;
    this._clipOwner = null;
    this._nativeClip = null;
    if (this._sliderClip) {
      try { this._sliderClip.remove_clip(); } catch (_) {}
      this._sliderClip = null;
    }
    const dash = this._dash;
    let background = null;
    try { background = dash?._background ?? null; } catch (_) {}
    const spacer = background?._macSpacer;
    const glass = _liveActor(background) ? background.get_effect?.('macDockGlass') : null;
    if (glass) {
      try { background.remove_effect(glass); } catch (_) {}
    }
    if (spacer) {
      try { spacer.get_parent()?.remove_child(spacer); } catch (_) {}
      try { spacer.destroy(); } catch (_) {}
      try { delete background._macSpacer; } catch (_) {}
    }
    for (const [actor, saved] of this._saved) {
      if (saved.destroyed || !_liveActor(actor))
        continue;
      try {
        if (saved.destroyId > 0 && GObject.signal_handler_is_connected(actor, saved.destroyId))
          actor.disconnect(saved.destroyId);
        for (const [key, value] of Object.entries(saved.properties)) {
          try { actor[key] = value; } catch (_) {}
        }
        delete actor._macDockLaunch;
        delete actor._macUnknownApp;
        delete actor._macOneClickPublish;
        delete actor._macCustomAssetObserved;
        if (actor._macAssetRepairId) {
          try { GLib.source_remove(actor._macAssetRepairId); } catch (_) {}
          delete actor._macAssetRepairId;
        }
        delete actor._macAssetUri;
        delete actor._macDockBase;
        delete actor._macDockFactor;
        delete actor._macHiQueued;
        delete actor._macDragPatched;
        delete actor._macDockActivatePatched;
        delete actor._macDockSourceStyle;
        delete actor._macDockAppliedStyle;
        delete actor._macDockAppliedShadowStyle;
        delete actor._macBadgeSourceText;
        delete actor._macBadgeAppliedText;
        delete actor._macBadgePreparedSourceText;
        delete actor._macBadgeSourceStyle;
        delete actor._macBadgeAppliedStyle;
        delete actor._macBadgePreparedSourceStyle;
        delete actor._macBadgeTextActor;
        if (actor._macBadgeSingleDigit)
          actor.remove_style_class_name('macstyle-single-digit-badge');
        delete actor._macBadgeSingleDigit;
        if (actor._macBadgeCapsule)
          actor.remove_style_class_name('macstyle-capsule-badge');
        delete actor._macBadgeCapsule;
      } catch (_) {}
    }
    this._saved.clear();
    this._motion.clear();
    this._plateAnimating = false;
    this._plateVisualWidth = null;
    this._layoutTransitionId = 0;
    this._near = false;
    this._dragging = false;
    this._revealInZone = false;
    this._reach = null;
    this._dock = null;
    this._dash = null;
    this._startDockDiscovery();
  }
}
