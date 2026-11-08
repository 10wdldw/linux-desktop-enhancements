import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Volume identifiers are user configuration, never part of the release payload.
// Read once when attaching a Dock; no extra volume watcher or polling is needed.
export function loadDriveSpecs(assets, configPath = GLib.build_filenamev([
  GLib.get_user_config_dir(), 'linux-beautify', 'drive-icons.json'])) {
  const specs = new Map();
  const file = Gio.File.new_for_path(configPath);
  if (!file.query_exists(null))
    return specs;
  try {
    const [, contents] = file.load_contents(null);
    const config = JSON.parse(new TextDecoder().decode(contents));
    if (!config || typeof config !== 'object' || Array.isArray(config))
      return specs;
    for (const [uuid, spec] of Object.entries(config)) {
      if (!uuid || !spec || typeof spec.name !== 'string' || !spec.name.trim() ||
          typeof spec.file !== 'string' || !/^[a-zA-Z0-9_-]+\.svg$/.test(spec.file) ||
          !Gio.File.new_for_path(GLib.build_filenamev([assets, spec.file])).query_exists(null))
        continue;
      specs.set(uuid, {name: spec.name, file: spec.file,
        order: Number.isFinite(spec.order) ? spec.order : 0});
    }
  } catch (error) {
    console.warn(`Linux Beautify: cannot read drive icon configuration: ${error.message}`);
  }
  return specs;
}

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

// Pin custom drive names and icons on the internal Dock's Removables.
// Mount updates rewrite the generic volume icon and then the metadata icon.
// Each write emits notify::icon, rebuilds the Dash actor and keeps the
// stage redrawing. Holding the backing property stops that loop.
export class DriveStabilizer {
  constructor({specs, assets, onChanged}) {
    this._specs = specs;
    this._assets = assets;
    this._onChanged = onChanged;
    this._infos = new Map();
    this._methods = [];
    this._manager = null;
    this._removables = null;
    this._removablesMethod = null;
    this._dash = null;
  }

  enable(dash, manager) {
    this.disable();
    this._dash = dash;
    this._manager = manager;
    this._wrap(manager, '_ensureLocations', original => {
      const owner = this;
      return function (...args) {
        const result = original.apply(this, args);
        owner._syncRemovables();
        return result;
      };
    });
    this.prepare();
    this._onChanged();
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
      property.latest = next;
    };
    Object.defineProperty(info, key, {
      configurable: true,
      enumerable: own?.enumerable ?? native.enumerable,
      get: property.get,
      set: property.set,
    });
    if (!equalValue(native.get.call(info), value))
      native.set.call(info, value);
    return property;
  }

  _pinInfo(info, spec) {
    if (this._infos.has(info))
      return;
    const record = {properties: [], destroy: null};
    this._infos.set(info, record);
    const icon = Gio.FileIcon.new(Gio.File.new_for_path(`${this._assets}/${spec.file}`));
    for (const [key, value] of [['name', spec.name], ['icon', icon]]) {
      const property = this._pinProperty(info, key, value);
      if (property)
        record.properties.push(property);
    }
    record.destroy = this._wrap(info, 'destroy', original => {
      const owner = this;
      return function (...args) {
        owner._releaseInfo(this, false);
        return original.apply(this, args);
      };
    });
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
