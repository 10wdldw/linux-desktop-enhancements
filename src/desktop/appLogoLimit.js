import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// WhiteSur application icons, measured with the same GdkPixbuf loader the
// shell and the desktop use, keep their opaque artwork in about 88.3% of the
// canvas. The corner radius is about 23.2% of that box. Icons that run past
// the rest of the set are scaled until their edge meets this box, then clipped
// to the same rounded rectangle. File, folder and thumbnail artwork is not
// passed in.
export const APP_LOGO_EXTENT = 0.883;
export const APP_LOGO_RADIUS_RATIO = 0.232;
export const APP_LOGO_TRIGGER = 0.96;
const APP_LOGO_ALPHA = 32;
const PROBE_SIZE = 64;
const OUTPUT_SIZE = 384;

const DING_DESKTOP_ICON_ITEM =
  '/usr/share/gnome-shell/extensions/ding@rastersoft.com/app/desktopIconItem.js';
const DING_BACKUP_NAME = 'ding-desktopIconItem.js.orig';
const LIMIT_MARKER = 'linux-beautify-app-logo-limit';

const fittedGicons = new Map();

export function appLogoRadius(slot) {
  return Math.max(1, Math.round(slot * APP_LOGO_EXTENT * APP_LOGO_RADIUS_RATIO));
}

function giconKey(gicon) {
  if (!gicon || gicon instanceof Gio.BytesIcon)
    return '';
  try {
    if (gicon instanceof Gio.FileIcon) {
      const file = gicon.get_file?.();
      const id = file?.get_path?.() || file?.get_uri?.();
      return id ? `f:${id}` : '';
    }
    if (gicon instanceof Gio.EmblemedIcon)
      return giconKey(gicon.get_icon());
    const names = gicon.get_names?.();
    if (names?.length)
      return `t:${names.join('|')}`;
  } catch (e) {
    return '';
  }
  return '';
}

function loadPixbuf(gicon, theme, size) {
  if (!gicon)
    return null;
  if (gicon instanceof Gio.EmblemedIcon)
    return loadPixbuf(gicon.get_icon(), theme, size);
  if (gicon instanceof Gio.FileIcon) {
    const path = gicon.get_file()?.get_path?.();
    if (!path)
      return null;
    return GdkPixbuf.Pixbuf.new_from_file_at_size(path, size, size);
  }
  const names = gicon.get_names?.() ?? [];
  if (names.length && theme?.choose_icon) {
    const info = theme.choose_icon(names, size, 0);
    const loaded = info?.load_icon?.();
    if (loaded)
      return loaded;
  }
  if (typeof gicon.load !== 'function')
    return null;
  const [stream] = gicon.load(size, null);
  if (!stream)
    return null;
  try {
    return GdkPixbuf.Pixbuf.new_from_stream_at_scale(stream, size, size, true, null);
  } finally {
    try { stream.close(null); } catch (e) {}
  }
}

function withAlpha(pixbuf) {
  if (!pixbuf || pixbuf.get_has_alpha())
    return pixbuf;
  return pixbuf.add_alpha(false, 0, 0, 0);
}

function logoExtent(pixbuf) {
  const image = withAlpha(pixbuf);
  if (!image)
    return 0;
  const width = image.get_width();
  const height = image.get_height();
  const canvas = Math.max(width, height);
  if (canvas < 2)
    return 0;
  const stride = image.get_rowstride();
  const channels = image.get_n_channels();
  const data = image.get_pixels();
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      if (channels >= 4 && data[row + x * channels + 3] <= APP_LOGO_ALPHA)
        continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0)
    return 0;
  const opaque = Math.max(maxX - minX + 1, maxY - minY + 1);
  return {image, extent: opaque / canvas, minX, minY, maxX, maxY, canvas};
}

export function limitAppLogoPixbuf(pixbuf) {
  const measured = logoExtent(pixbuf);
  if (!measured || measured.extent <= APP_LOGO_TRIGGER)
    return null;
  const {image, minX, minY, maxX, maxY, canvas} = measured;
  const opaque = Math.max(maxX - minX + 1, maxY - minY + 1);
  const target = Math.max(1, Math.round(canvas * APP_LOGO_EXTENT));
  const scale = target / opaque;
  const offsetX = canvas / 2 - ((minX + maxX + 1) / 2) * scale;
  const offsetY = canvas / 2 - ((minY + maxY + 1) / 2) * scale;
  const dest = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, canvas, canvas);
  dest.fill(0);
  image.composite(dest, 0, 0, canvas, canvas, offsetX, offsetY, scale, scale,
    GdkPixbuf.InterpType.BILINEAR, 255);

  const width = dest.get_width();
  const height = dest.get_height();
  const stride = dest.get_rowstride();
  const channels = dest.get_n_channels();
  const src = dest.get_pixels();
  const out = new Uint8Array(width * height * 4);
  const radius = target * APP_LOGO_RADIUS_RATIO;
  const half = target / 2;
  const inner = half - radius;
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const dy = Math.abs(y + 0.5 - cy);
    for (let x = 0; x < width; x++) {
      const dx = Math.abs(x + 0.5 - cx);
      let cover = 0;
      if (dx < half && dy < half) {
        if (dx <= inner || dy <= inner) {
          cover = 1;
        } else {
          cover = radius + 0.5 - Math.hypot(dx - inner, dy - inner);
          if (cover > 1)
            cover = 1;
          else if (cover < 0)
            cover = 0;
        }
      }
      if (cover <= 0)
        continue;
      const i = row + x * channels;
      const o = (y * width + x) * 4;
      out[o] = src[i];
      out[o + 1] = src[i + 1];
      out[o + 2] = src[i + 2];
      out[o + 3] = Math.round((channels >= 4 ? src[i + 3] : 255) * cover);
    }
  }
  const bytes = GLib.Bytes.new(out);
  return GdkPixbuf.Pixbuf.new_from_bytes(
    bytes, GdkPixbuf.Colorspace.RGB, true, 8, width, height, width * 4);
}

function giconFromPixbuf(pixbuf) {
  const stream = Gio.MemoryOutputStream.new_resizable();
  pixbuf.save_to_streamv(stream, 'png', [], [], null);
  stream.close(null);
  return Gio.BytesIcon.new(stream.steal_as_bytes());
}

function fitGicon(gicon, theme) {
  const probe = loadPixbuf(gicon, theme, PROBE_SIZE);
  if (!probe || !(logoExtent(probe)?.extent > APP_LOGO_TRIGGER))
    return null;
  const full = loadPixbuf(gicon, theme, OUTPUT_SIZE) || probe;
  const fitted = limitAppLogoPixbuf(full);
  return fitted ? giconFromPixbuf(fitted) : null;
}

export function applyAppLogoLimit(icon, theme) {
  if (!icon)
    return;
  let gicon = null;
  try {
    gicon = icon.gicon ?? null;
  } catch (e) {
    return;
  }
  const key = giconKey(gicon);
  if (!key || icon._macLogoLimitKey === key)
    return;
  icon._macLogoLimitKey = key;
  let fitted = null;
  if (fittedGicons.has(key)) {
    fitted = fittedGicons.get(key);
  } else {
    try {
      fitted = fitGicon(gicon, theme);
    } catch (e) {
      fitted = null;
    }
    fittedGicons.set(key, fitted);
  }
  if (!fitted)
    return;
  try {
    icon.gicon = fitted;
  } catch (e) {}
}

function dingBackupFile() {
  const dir = GLib.build_filenamev([
    GLib.get_user_state_dir(), 'linux-desktop-enhancements']);
  GLib.mkdir_with_parents(dir, 0o755);
  return Gio.File.new_for_path(GLib.build_filenamev([dir, DING_BACKUP_NAME]));
}

function dingLimiterSource() {
  return `
/* ${LIMIT_MARKER}: scale oversized application logos to the common edge. */
function _linuxBeautifyLimitPixbuf(pixbuf) {
    const EXTENT = ${APP_LOGO_EXTENT};
    const RADIUS = ${APP_LOGO_RADIUS_RATIO};
    const TRIGGER = ${APP_LOGO_TRIGGER};
    const ALPHA = ${APP_LOGO_ALPHA};
    if (!pixbuf)
        return null;
    if (!pixbuf.get_has_alpha())
        pixbuf = pixbuf.add_alpha(false, 0, 0, 0);
    const width = pixbuf.get_width();
    const height = pixbuf.get_height();
    const canvas = Math.max(width, height);
    if (canvas < 2)
        return null;
    const stride = pixbuf.get_rowstride();
    const channels = pixbuf.get_n_channels();
    const data = pixbuf.get_pixels();
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
        const row = y * stride;
        for (let x = 0; x < width; x++) {
            if (channels >= 4 && data[row + x * channels + 3] <= ALPHA)
                continue;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < 0)
        return null;
    const opaque = Math.max(maxX - minX + 1, maxY - minY + 1);
    if (opaque / canvas <= TRIGGER)
        return null;
    const target = Math.max(1, Math.round(canvas * EXTENT));
    const scale = target / opaque;
    const offsetX = canvas / 2 - ((minX + maxX + 1) / 2) * scale;
    const offsetY = canvas / 2 - ((minY + maxY + 1) / 2) * scale;
    const dest = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, canvas, canvas);
    dest.fill(0);
    pixbuf.composite(dest, 0, 0, canvas, canvas, offsetX, offsetY, scale, scale,
        GdkPixbuf.InterpType.BILINEAR, 255);
    const dw = dest.get_width();
    const dh = dest.get_height();
    const ds = dest.get_rowstride();
    const dc = dest.get_n_channels();
    const src = dest.get_pixels();
    const out = new Uint8Array(dw * dh * 4);
    const radius = target * RADIUS;
    const half = target / 2;
    const inner = half - radius;
    for (let y = 0; y < dh; y++) {
        const row = y * ds;
        const dy = Math.abs(y + 0.5 - dh / 2);
        for (let x = 0; x < dw; x++) {
            const dx = Math.abs(x + 0.5 - dw / 2);
            let cover = 0;
            if (dx < half && dy < half) {
                if (dx <= inner || dy <= inner)
                    cover = 1;
                else {
                    cover = radius + 0.5 - Math.hypot(dx - inner, dy - inner);
                    if (cover > 1) cover = 1;
                    else if (cover < 0) cover = 0;
                }
            }
            if (cover <= 0)
                continue;
            const i = row + x * dc;
            const o = (y * dw + x) * 4;
            out[o] = src[i];
            out[o + 1] = src[i + 1];
            out[o + 2] = src[i + 2];
            out[o + 3] = Math.round((dc >= 4 ? src[i + 3] : 255) * cover);
        }
    }
    return GdkPixbuf.Pixbuf.new_from_bytes(
        GLib.Bytes.new(out), GdkPixbuf.Colorspace.RGB, true, 8, dw, dh, dw * 4);
}
`;
}

export function renderDingDesktopIconItem(source) {
  if (!source || source.includes(LIMIT_MARKER))
    return source;
  const iconAnchor = `            } else {
                pixbuf = this._createEmblemedIcon(this._getDefaultIcon(), null);
            }
            const scale = this._icon.get_scale_factor();
            let surface = Gdk.cairo_surface_create_from_pixbuf(pixbuf, scale, null);
            this._icon.set_from_surface(surface);
        }
    }`;
  const iconReplacement = `            } else {
                pixbuf = this._createEmblemedIcon(this._getDefaultIcon(), null);
            }
            if (this._isApplicationLogo())
                pixbuf = this._limitAppLogoPixbuf(pixbuf);
            const scale = this._icon.get_scale_factor();
            let surface = Gdk.cairo_surface_create_from_pixbuf(pixbuf, scale, null);
            this._icon.set_from_surface(surface);
        }
    }`;
  const thumbAnchor = `                        pixbuf = this._addEmblemsToPixbufIfNeeded(pixbuf);
                        let surface = Gdk.cairo_surface_create_from_pixbuf(pixbuf, scale, null);`;
  const thumbReplacement = `                        pixbuf = this._addEmblemsToPixbufIfNeeded(pixbuf);
                        if (this._isApplicationLogo())
                            pixbuf = this._limitAppLogoPixbuf(pixbuf);
                        let surface = Gdk.cairo_surface_create_from_pixbuf(pixbuf, scale, null);`;
  const classEnd = '\n};\nSignals.addSignalMethods(desktopIconItem.prototype);';
  const methods = `
    _isApplicationLogo() {
        try {
            return this._isDesktopFile && this._isValidDesktopFile &&
                this._desktopFile.get_string('Type') === 'Application';
        } catch (e) {
            return false;
        }
    }

    _limitAppLogoPixbuf(pixbuf) {
        try {
            return _linuxBeautifyLimitPixbuf(pixbuf) || pixbuf;
        } catch (e) {
            return pixbuf;
        }
    }
`;
  if (!source.includes(iconAnchor) || !source.includes(thumbAnchor) || !source.includes(classEnd))
    return null;
  if (source.split(iconAnchor).length !== 2 || source.split(thumbAnchor).length !== 2)
    return null;
  return source
    .replace(iconAnchor, iconReplacement)
    .replace(thumbAnchor, thumbReplacement)
    .replace(classEnd, `\n${methods}};${dingLimiterSource()}\nSignals.addSignalMethods(desktopIconItem.prototype);`);
}

function readText(file) {
  const [, contents] = file.load_contents(null);
  return new TextDecoder().decode(contents);
}

function sudoCopy(from, to) {
  const proc = Gio.Subprocess.new(
    ['sudo', '-n', 'cp', '--', from, to], Gio.SubprocessFlags.NONE);
  proc.wait(null);
  return proc.get_successful();
}

export function installDingLogoLimit() {
  try {
    const target = Gio.File.new_for_path(DING_DESKTOP_ICON_ITEM);
    if (!target.query_exists(null))
      return false;
    const text = readText(target);
    if (text.includes(LIMIT_MARKER))
      return true;
    const patched = renderDingDesktopIconItem(text);
    if (!patched)
      return false;
    const backup = dingBackupFile();
    if (!backup.query_exists(null) && !sudoCopy(target.get_path(), backup.get_path()))
      return false;
    const temp = Gio.File.new_for_path('/tmp/linux-beautify-desktopIconItem.js');
    GLib.file_set_contents(temp.get_path(), patched);
    return sudoCopy(temp.get_path(), target.get_path());
  } catch (e) {
    return false;
  }
}

export function removeDingLogoLimit() {
  try {
    const backup = dingBackupFile();
    const target = Gio.File.new_for_path(DING_DESKTOP_ICON_ITEM);
    if (!backup.query_exists(null) || !target.query_exists(null))
      return false;
    if (!readText(target).includes(LIMIT_MARKER))
      return true;
    return sudoCopy(backup.get_path(), target.get_path());
  } catch (e) {
    return false;
  }
}
