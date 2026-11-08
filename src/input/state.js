// SPDX-License-Identifier: GPL-3.0-or-later
// Plain protocol state; UI updates are coalesced by the panel's idle callback.
export class InputState {
  constructor() { this.revision = 0; this.reset(); }
  _set(values) {
    let changed = false;
    for (const [key, value] of Object.entries(values)) {
      const old = this[key];
      const equal = Array.isArray(value) ? Array.isArray(old) && old.length === value.length && old.every((v, i) => v === value[i]) : old === value;
      if (!equal) { this[key] = value; changed = true; }
    }
    if (changed) this.revision++;
    return changed;
  }
  reset() {
    return this._set({preedit: '', aux: '', showPreedit: false, showAux: false,
      showLookup: false, labels: [], texts: [], cursor: -1, hasPrev: false, hasNext: false, layout: 0});
  }
  lookup(labels, texts, _attrs, hasPrev, hasNext, cursor, layout) {
    return this._set({labels: labels.slice(0, 100), texts: texts.slice(0, 100), hasPrev, hasNext, cursor, layout});
  }
  signal(name, values) {
    switch (name) {
    case 'UpdatePreeditText': return this._set({preedit: values[0]});
    case 'UpdateAux': return this._set({aux: values[0]});
    case 'ShowPreedit': return this._set({showPreedit: values[0]});
    case 'ShowAux': return this._set({showAux: values[0]});
    case 'ShowLookupTable': return this._set({showLookup: values[0]});
    case 'UpdateLookupTableCursor': return this._set({cursor: values[0]});
    case 'UpdateLookupTable': return this.lookup(values[0], values[1], [], false, false, -1, 0);
    case 'Enable': return !values[0] && this.reset();
    default: return false;
    }
  }
}
