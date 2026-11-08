// SPDX-License-Identifier: GPL-3.0-or-later
// One native signal connection per (object, signal), shared by feature modules.
export class SignalHub {
  constructor(onError = error => console.error(error)) { this.objects = new Map(); this.onError = onError; }

  subscribe(object, signal, callback) {
    let signals = this.objects.get(object);
    if (!signals) { signals = new Map(); this.objects.set(object, signals); }
    let entry = signals.get(signal);
    if (!entry) {
      entry = {callbacks: new Map(), id: 0};
      entry.id = object.connect(signal, (...args) => {
        for (const [token, listener] of [...entry.callbacks]) {
          if (!entry.callbacks.has(token)) continue;
          try { listener(...args); } catch (error) { this.onError(error); }
        }
      });
      signals.set(signal, entry);
    }
    const token = Symbol(signal);
    entry.callbacks.set(token, callback);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      entry.callbacks.delete(token);
      if (entry.callbacks.size) return;
      try { object.disconnect(entry.id); } catch (_) { /* Actor may be gone. */ }
      signals.delete(signal);
      if (!signals.size) this.objects.delete(object);
    };
  }

  count() { return [...this.objects.values()].reduce((sum, signals) => sum + signals.size, 0); }
}

export class ResourceScope {
  constructor(clock, hub) {
    this.clock = clock;
    this.hub = hub;
    this.sources = new Set();
    this.signals = new Set();
    this.jobs = new Map();
    this.cleanups = new Set();
    this.disposed = false;
  }

  observe(object, signal, callback) {
    if (this.disposed) return () => {};
    const unsubscribe = this.hub.subscribe(object, signal, callback);
    const stop = () => { unsubscribe(); this.signals.delete(stop); };
    this.signals.add(stop);
    return stop;
  }

  _add(kind, args, callback) {
    if (this.disposed) return 0;
    let id;
    id = this.clock[kind](...args, () => {
      if (this.disposed) return false;
      let again = false;
      try { again = !!callback() && !this.disposed && this.sources.has(id); }
      finally { if (!again) this.sources.delete(id); }
      return again;
    });
    this.sources.add(id);
    return id;
  }

  timeout(priority, milliseconds, callback) { return this._add('timeout', [priority, milliseconds], callback); }
  idle(priority, callback) { return this._add('idle', [priority], callback); }
  remove(id) {
    if (!this.sources.delete(id)) return;
    for (const [key, value] of this.jobs) if (value === id) this.jobs.delete(key);
    this.clock.remove(id);
  }

  queue(key, priority, callback) {
    if (this.disposed) return 0;
    if (this.jobs.has(key)) return this.jobs.get(key);
    const id = this.idle(priority, () => {
      this.jobs.delete(key);
      callback();
      return false;
    });
    this.jobs.set(key, id);
    return id;
  }

  own(cleanup) {
    if (this.disposed) { cleanup(); return () => {}; }
    const stop = () => { if (this.cleanups.delete(stop)) cleanup(); };
    this.cleanups.add(stop);
    return stop;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const stop of [...this.signals, ...this.cleanups]) {
      try { stop(); } catch (error) { this.hub.onError(error); }
    }
    for (const id of [...this.sources]) {
      try { this.remove(id); } catch (error) { this.hub.onError(error); }
    }
    this.jobs.clear();
  }
}

// One read per burst of related events. Subscribers own only their subscription.
export class SharedState {
  constructor(scope, read, priority = 0, onError = error => console.error(error)) {
    this.scope = scope; this.read = read; this.priority = priority;
    this.onError = onError; this.listeners = new Map();
  }
  observe(scope, callback) {
    const token = Symbol();
    this.listeners.set(token, callback);
    const stop = scope.own(() => this.listeners.delete(token));
    this.invalidate();
    return stop;
  }
  invalidate() {
    this.scope.queue('state', this.priority, () => {
      if (!this.listeners.size) return;
      const state = this.read();
      for (const [token, listener] of [...this.listeners]) {
        if (!this.listeners.has(token)) continue;
        try { listener(state); } catch (error) { this.onError(error); }
      }
    });
  }
}

// A synchronous event/frame gets one snapshot. Never cache actors across frames.
export class TurnCache {
  constructor() { this.depth = 0; this.values = new Map(); }
  run(callback) {
    this.depth++;
    try { return callback(); }
    finally { if (--this.depth === 0) this.values.clear(); }
  }
  get(key, read) {
    if (!this.depth) return read();
    if (!this.values.has(key)) this.values.set(key, read());
    return this.values.get(key);
  }
  clear() { this.values.clear(); }
}
