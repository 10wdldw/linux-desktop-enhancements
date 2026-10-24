import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

function descriptorFor(object, key) {
  for (let cursor = object; cursor; cursor = Object.getPrototypeOf(cursor)) {
    const descriptor = Object.getOwnPropertyDescriptor(cursor, key);
    if (descriptor)
      return descriptor;
  }
  return null;
}

function equalValue(left, right) {
  return left === right || (!!left && !!right && !!left.equal?.(right));
}

/** Keep custom drive presentation stable while Ubuntu Dock updates mount state. */
export class DriveStabilizer {
  constructor({specs, assets, onChanged = null}) {
    this._specs = specs;
    this._assets = assets;
    this._onChanged = onChanged;
    this._infos = new Map();
    this._methods = [];
    this._generation = 0;
    this._manager = null;
    this._removables = null;
    this._removablesMethod = null;
    this._dash = null;
  }

  async enable(dash, manager = null) {
    this.disable();
    this._dash = dash;
    const generation = this._generation;
    if (!manager) {
      // Ubuntu Dock deliberately exports its live manager for other extensions.
      const extension = Main.extensionManager.lookup('ubuntu-dock@ubuntu.com');
      const uri = extension?.dir?.get_uri() ??
        (extension?.path ? Gio.File.new_for_path(extension.path).get_uri() : null);
      if (!uri)
        return false;
      const module = await import(`${uri}/extension.js`);
      if (generation !== this._generation)
        return false;
      manager = module.dockManager;
    }
    if (!manager)
      return false;
    this._manager = manager;

    // The manager may replace Removables when the user changes dock settings.
    this._wrap(manager, '_ensureLocations', original => {
      const owner = this;
      return function (...args) {
        const result = original.apply(this, args);
        owner._syncRemovables();
        return result;
      };
    });
    this.prepare();
    this._onChanged?.();
    return true;
  }

  prepare(dash = this._dash) {
    this._syncRemovables();
    for (const item of dash?._box?.get_children() ?? []) {
      const info = item.child?.app?.appInfo;
      const spec = this._specFor(info);
      if (!spec)
        continue;
      this._pinInfo(info, spec);
      item.setLabelText(spec.name);
    }
  }

  _specFor(info) {
    return this._specs.get(info?.volume?.get_uuid());
  }

  _wrap(object, key, makeWrapper) {
    const original = object[key];
    if (typeof original !== 'function')
      return null;
    const own = Object.getOwnPropertyDescriptor(object, key);
    const wrapper = makeWrapper(original);
    object[key] = wrapper;
    const record = {object, key, own, wrapper};
    this._methods.push(record);
    return record;
  }

  _restoreMethod(record) {
    const {object, key, own, wrapper} = record;
    if (object[key] !== wrapper)
      return;
    if (own)
      Object.defineProperty(object, key, own);
    else
      delete object[key];
  }

  _syncRemovables() {
    const removables = this._manager?.removables;
    if (!removables || removables === this._removables)
      return;
    // A settings change can replace Removables repeatedly. Release the old
    // wrapper now instead of retaining each former manager until disable().
    if (this._removablesMethod) {
      this._restoreMethod(this._removablesMethod);
      this._methods = this._methods.filter(method => method !== this._removablesMethod);
    }
    this._removables = removables;
    this._removablesMethod = this._wrap(removables, 'getApps', original => {
      const owner = this;
      return function (...args) {
        const apps = original.apply(this, args).slice();
        const slots = [];
        const custom = [];
        apps.forEach((app, index) => {
          const spec = owner._specFor(app.appInfo);
          if (!spec)
            return;
          owner._pinInfo(app.appInfo, spec);
          slots.push(index);
          custom.push({app, spec});
        });
        custom.sort((left, right) => left.spec.order - right.spec.order);
        slots.forEach((slot, index) => {
          apps[slot] = custom[index].app;
        });
        return apps;
      };
    });
    // Pin the current infos now; later additions are pinned by getApps() before
    // Dash._redisplay() creates their actors. Never reorder the actor box here:
    // native redisplay otherwise interprets our move as animated remove/add.
    removables.getApps();
  }

  _pinProperty(info, key, value) {
    const own = Object.getOwnPropertyDescriptor(info, key);
    const native = descriptorFor(info, key);
    if (!native?.get || !native?.set || own?.configurable === false)
      return null;
    const property = {key, own, native, latest: native.get.call(info)};
    property.get = function () {
      return native.get.call(this);
    };
    property.set = function (next) {
      // MountableVolumeAppInfo writes the generic volume icon on each mount
      // update and then asynchronously writes the metadata icon. Keep the native
      // backing property pinned so neither write emits notify::icon or destroys
      // the displayed texture. Retain the last upstream value for disable().
      property.latest = next;
    };
    Object.defineProperty(info, key, {
      configurable: true,
      enumerable: own?.enumerable ?? native.enumerable,
      get: property.get,
      set: property.set,
    });
    try {
      if (!equalValue(native.get.call(info), value))
        native.set.call(info, value);
    } catch (error) {
      if (own)
        Object.defineProperty(info, key, own);
      else
        delete info[key];
      throw error;
    }
    return property;
  }

  _pinInfo(info, spec) {
    if (this._infos.has(info))
      return;
    const record = {properties: [], destroy: null};
    this._infos.set(info, record);
    const icon = Gio.FileIcon.new(Gio.File.new_for_path(`${this._assets}/${spec.file}`));
    try {
      for (const [key, value] of [['name', spec.name], ['icon', icon]]) {
        const property = this._pinProperty(info, key, value);
        if (property)
          record.properties.push(property);
      }
      // These infos are GObjects with a JS destroy() method, not Clutter actors.
      // Unpin before native teardown writes icon=null and releases resources.
      record.destroy = this._wrap(info, 'destroy', original => {
        const owner = this;
        return function (...args) {
          owner._releaseInfo(this, false);
          return original.apply(this, args);
        };
      });
    } catch (error) {
      this._releaseInfo(info, true);
      throw error;
    }
  }

  _releaseInfo(info, restoreValues) {
    const record = this._infos.get(info);
    if (!record)
      return;
    this._infos.delete(info);
    if (record.destroy) {
      this._restoreMethod(record.destroy);
      this._methods = this._methods.filter(method => method !== record.destroy);
    }
    for (const property of record.properties) {
      const current = Object.getOwnPropertyDescriptor(info, property.key);
      if (current?.get !== property.get || current?.set !== property.set)
        continue;
      if (property.own)
        Object.defineProperty(info, property.key, property.own);
      else
        delete info[property.key];
      if (restoreValues && !equalValue(property.native.get.call(info), property.latest))
        property.native.set.call(info, property.latest);
    }
  }

  disable() {
    this._generation++;
    // Undo getApps first so icon notifications during restoration cannot enter
    // that wrapper and pin an info again.
    for (const method of this._methods.slice().reverse())
      this._restoreMethod(method);
    this._methods = [];
    for (const info of Array.from(this._infos.keys()))
      this._releaseInfo(info, true);
    this._manager = null;
    this._removables = null;
    this._removablesMethod = null;
    this._dash = null;
  }
}
