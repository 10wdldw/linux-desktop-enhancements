/** Hardcoded rounded-corner prefs so we can run inside macstyle-session. */

const GLOBAL = {
  padding: {left: 1, right: 1, top: 1, bottom: 1},
  keepRoundedCorners: {maximized: false, fullscreen: false},
  borderRadius: 12,
  smoothing: 0,
  borderColor: [0.5, 0.5, 0.5, 0.0],
  enabled: true,
};

const DEFAULTS = {
  'settings-version': 1,
  blacklist: [],
  whitelist: false,
  'skip-libadwaita-app': false,
  'skip-libhandy-app': false,
  'border-width': 0,
  'global-rounded-corner-settings': GLOBAL,
  'custom-rounded-corner-settings': {},
  'focused-shadow': {
    horizontalOffset: 0,
    verticalOffset: 4,
    blurOffset: 28,
    spreadRadius: 4,
    opacity: 60,
  },
  'unfocused-shadow': {
    horizontalOffset: 0,
    verticalOffset: 2,
    blurOffset: 12,
    spreadRadius: -1,
    opacity: 65,
  },
  'keep-shadow-for-maximized-fullscreen': false,
  'debug-mode': false,
  'tweak-kitty-terminal': false,
};

export const Schema = {};

export const prefs = {
  connect() {
    return 0;
  },
  disconnect() {},
};

export function initPrefs() {}

export function uninitPrefs() {}

export function getPref(key) {
  return DEFAULTS[key];
}

export function setPref() {}

export function bindPref() {}
