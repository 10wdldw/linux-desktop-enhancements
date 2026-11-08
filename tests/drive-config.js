import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {loadDriveSpecs} from '../src/desktop/driveStabilizer.js';

const temporary = GLib.dir_make_tmp('beautify-drive-config-XXXXXX');
const config = `${temporary}/drive-icons.json`;
const asset = `${temporary}/drive-test.svg`;
const assert = (value, message) => { if (!value) throw new Error(message); };
try {
  assert(loadDriveSpecs(temporary, config).size === 0, 'absent config must preserve native icons');
  GLib.file_set_contents(asset, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  GLib.file_set_contents(config, JSON.stringify({
    'example-volume': {name: 'Data', file: 'drive-test.svg', order: 2},
    'missing-asset': {name: 'Missing', file: 'missing.svg'},
    'path-escape': {name: 'Outside', file: '../drive-test.svg'},
    'invalid-name': {file: 'drive-test.svg'},
  }));
  const specs = loadDriveSpecs(temporary, config);
  assert(specs.size === 1 && specs.get('example-volume').order === 2, 'only valid local mappings load');
  GLib.file_set_contents(config, 'not-json');
  assert(loadDriveSpecs(temporary, config).size === 0, 'invalid JSON must not stop the Dock');
  GLib.file_set_contents(config, '[]');
  assert(loadDriveSpecs(temporary, config).size === 0, 'array is not a mapping');
  print('Drive configuration: absent, valid, invalid, missing asset and path traversal checks passed.');
} finally {
  for (const path of [config, asset, temporary]) {
    const file = Gio.File.new_for_path(path);
    if (file.query_exists(null)) file.delete(null);
  }
}
