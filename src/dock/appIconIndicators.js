import {
    Clutter,
    GdkPixbuf,
    Gio,
    St,
} from './dependencies/gi.js';

import {
    Main,
} from './dependencies/shell/ui.js';

import {
    Docking,
    Utils,
} from './imports.js';

const {cairo: Cairo} = imports;

const MAX_WINDOWS_CLASSES = 4;
const _interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});

// Same colors as the theme's .app-grid-running-dot rules. Light dock is
// black, dark dock is white, and the overview is white on both.
function _plainDotColor() {
    if (Main.overview.visible)
        return 'rgba(255,255,255,0.85)';
    const dark = _interfaceSettings.get_string('color-scheme') === 'prefer-dark';
    return dark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.75)';
}


/*
 * This is the main indicator class to be used. The desired behavior is
 * obtained by composing the desired classes below based on the settings.
 *
 */
export class AppIconIndicator {
    constructor(source) {
        this._indicators = [];

        const {settings} = Docking.DockManager;
        if (settings.showIconsEmblems &&
            !Docking.DockManager.getDefault().notificationsMonitor.dndMode) {
            const unityIndicator = new UnityIndicator(source);
            this._indicators.push(unityIndicator);
        }

        // The previous selector left the stock single dot in place whenever
        // running-indicator-style was DEFAULT, so the window count never showed.
        // That path is gone: every running app draws one dot per open window.
        this._indicators.push(new RunningIndicatorDots(source));
    }

    update() {
        for (let i = 0; i < this._indicators.length; i++) {
            const indicator = this._indicators[i];
            indicator.update();
        }
    }

    destroy() {
        for (let i = 0; i < this._indicators.length; i++) {
            const indicator = this._indicators[i];
            indicator.destroy();
        }
    }
}

/*
 * Base class to be inherited by all indicators of any kind
*/
class IndicatorBase {
    constructor(source) {
        this._source = source;
        this._signalsHandler = new Utils.GlobalSignalsHandler(this._source);
    }

    update() {
    }

    destroy() {
        this._source = null;
        this._signalsHandler.destroy();
        this._signalsHandler = null;
    }
}

/*
 * A base indicator class for running style, from which all other RunningIndicators should derive,
 * providing some basic methods, variables definitions and their update,  css style classes handling.
 *
 */
class RunningIndicatorBase extends IndicatorBase {
    constructor(source) {
        super(source);

        this._side = Utils.getPosition();
        this._dominantColorExtractor = new DominantColorExtractor(this._source.app);
        this._signalsHandler.add(this._source, 'notify::running', () => this.update());
        this._signalsHandler.add(this._source, 'notify::focused', () => this.update());
        this._signalsHandler.add(this._source, 'notify::windows-count', () => this.update());
        this.update();
    }

    get _number() {
        return Math.min(this._source.windowsCount, MAX_WINDOWS_CLASSES);
    }

    update() {
        this._updateCounterClass();
        this._updateDefaultDot();
    }

    _updateCounterClass() {
        for (let i = 1; i <= MAX_WINDOWS_CLASSES; i++) {
            const className = `running${i}`;
            if (i !== this._number)
                this._source.remove_style_class_name(className);
            else
                this._source.add_style_class_name(className);
        }
    }

    _updateDefaultDot() {
        this._source._dot.hide();
        this._source._dot.opacity = 0;
    }

    _hideDefaultDot() {
        this._source._dot.hide();
        this._source._dot.opacity = 0;
    }

    _restoreDefaultDot() {
        this._hideDefaultDot();
    }

    _enableBacklight() {
        const colorPalette = this._dominantColorExtractor._getColorPalette();

        // Fallback
        if (!colorPalette) {
            this._source._iconContainer.set_style(
                'border-radius: 5px;' +
                'background-gradient-direction: vertical;' +
                'background-gradient-start: #e0e0e0;' +
                'background-gradient-end: darkgray;'
            );

            return;
        }

        this._source._iconContainer.set_style(
            `${'border-radius: 5px;' +
            'background-gradient-direction: vertical;' +
            'background-gradient-start: '}${colorPalette.original};` +
            `background-gradient-end: ${colorPalette.darker};`
        );
    }

    _disableBacklight() {
        this._source._iconContainer.set_style(null);
    }

    destroy() {
        this._disableBacklight();
        // Remove glossy background if the children still exists
        if (this._source._iconContainer.get_children().length > 1)
            this._source._iconContainer.get_children()[1].set_style(null);
        this._restoreDefaultDot();

        super.destroy();
    }
}

class RunningIndicatorDots extends RunningIndicatorBase {
    constructor(source) {
        super(source);
        this._hideDefaultDot();
        this._dots = [];
        this._signalsHandler.add([
            Docking.DockManager.settings,
            'changed::custom-theme-running-dots-color',
            () => this.update(),
        ], [
            global.display,
            'notify::focus-window',
            () => this.update(),
        ], [
            Main.overview,
            'showing',
            () => this.update(),
        ], [
            Main.overview,
            'hidden',
            () => this.update(),
        ], [
            _interfaceSettings,
            'changed::color-scheme',
            () => this.update(),
        ]);
        this.update();
    }

    update() {
        if (!this._dots)
            return;

        super.update();
        this._clearDots();
        const windows = this._source.getInterestingWindows?.() ?? [];
        const iconSize = this._source.icon?.iconSize || 52;
        const size = Math.max(4, Math.round(iconSize / 11));
        const gap = Math.max(2, Math.round(size / 2));
        const step = size + gap;
        const maxFit = Math.max(1, Math.floor((iconSize + gap) / step));
        const count = Math.min(windows.length, maxFit);
        if (count < 1)
            return;

        const focus = global.display.focus_window;
        const accent = Docking.DockManager.settings.customThemeRunningDotsColor || '#FF4500';
        const plain = _plainDotColor();
        const radius = Math.ceil(size / 2);
        for (let i = 0; i < count; i++) {
            const dot = new St.Widget({
                style_class: 'mac-window-dots',
                width: size,
                height: size,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.END,
                reactive: false,
                style: `background-color: ${windows[i] === focus ? accent : plain}; border-radius: ${radius}px;`,
            });
            dot.translation_x = (i - (count - 1) / 2) * step;
            this._source._iconContainer.add_child(dot);
            this._dots.push(dot);
        }
    }

    _clearDots() {
        for (const dot of this._dots)
            dot.destroy();
        this._dots.length = 0;
    }

    destroy() {
        this._clearDots();
        super.destroy();
    }
}

/*
 * Unity like progress indicators
 */
export class UnityIndicator extends IndicatorBase {
    static defaultProgressBar = {
        // default values for the progress bar itself
        background: {
            colorStart: {red: 204, green: 204, blue: 204, alpha: 255},
            colorEnd: null,
        },
        border: {
            colorStart: {red: 230, green: 230, blue: 230, alpha: 255},
            colorEnd: null,
        },
    };

    static defaultProgressBarTrack = {
        // default values for the progress bar track
        background: {
            colorStart: {red: 64, green: 64, blue: 64, alpha: 255},
            colorEnd: {red: 89, green: 89, blue: 89, alpha: 255},
            offsetStart: 0.4,
            offsetEnd: 0.9,
        },
        border: {
            colorStart: {red: 128, green: 128, blue: 128, alpha: 26},
            colorEnd: {red: 204, green: 204, blue: 204, alpha: 102},
            offsetStart: 0.5,
            offsetEnd: 0.9,
        },
    };

    constructor(source) {
        super(source);

        const {remoteModel} = Docking.DockManager.getDefault();
        const remoteEntry = remoteModel.lookupById(this._source.app.id);
        this._remoteEntry = remoteEntry;

        this._signalsHandler.add([
            remoteEntry,
            ['progress-changed', 'progress-visible-changed'],
            (sender, {progress, progress_visible: progressVisible}) =>
                this.setProgress(progressVisible ? progress : -1),
        ], [
            remoteEntry,
            'urgent-changed',
            (sender, {urgent}) => this.setUrgent(urgent),
        ], [
            remoteEntry,
            'updating-changed',
            (sender, {updating}) => this.setUpdating(updating),
        ], [
            this._source,
            'style-changed',
            () => this._updateIconStyle(),
        ]);

        this.setProgress(this._remoteEntry.progress_visible
            ? this._remoteEntry.progress : -1);
        this.setUrgent(this._remoteEntry.urgent);
        this.setUpdating(this._remoteEntry.updating);
    }

    destroy() {
        this._hideProgressOverlay();
        this.setUrgent(false);
        this.setUpdating(false);
        this._remoteEntry = null;

        super.destroy();
    }

    _showProgressOverlay() {
        if (this._progressOverlayArea) {
            this._updateProgressOverlay();
            return;
        }

        this._progressOverlayArea = new St.DrawingArea({x_expand: true, y_expand: true});
        this._progressOverlayArea.add_style_class_name('progress-bar');
        this._progressOverlayArea.connect('repaint', () => {
            this._drawProgressOverlay(this._progressOverlayArea);
        });

        this._source._iconContainer.add_child(this._progressOverlayArea);
        this._updateProgressOverlay();
    }

    _hideProgressOverlay() {
        this._progressOverlayArea?.destroy();
        this._progressOverlayArea = null;
    }

    _updateProgressOverlay() {
        this._progressOverlayArea?.queue_repaint();
    }

    _readGradientData(node, elementName, defaultValues) {
        const output = {
            colorStart: defaultValues.colorStart,
            colorEnd: defaultValues.colorEnd,
            offsetStart: defaultValues.offsetStart ?? 0.0,
            offsetEnd: defaultValues.offsetEnd ?? 1.0,
        };

        const [hasElementName, elementNameValue] = node.lookup_color(elementName, false);
        if (hasElementName) {
            output.colorStart = elementNameValue;
            output.colorEnd = null;
        } else {
            const [hasColorStart, colorStartValue] = node.lookup_color(`${elementName}-color-start`, false);
            const [hasColorEnd, colorEndValue] = node.lookup_color(`${elementName}-color-end`, false);
            if (hasColorStart && hasColorEnd) {
                output.colorStart = colorStartValue;
                output.colorEnd = colorEndValue;
            }
        }

        const [hasOffsetStart, offsetStartValue] = node.lookup_color(`${elementName}-offset-start`, false);
        if (hasOffsetStart)
            output.offsetStart = offsetStartValue;

        const [hasOffsetEnd, offsetEndValue] = node.lookup_color(`${elementName}-offset-end`, false);
        if (hasOffsetEnd)
            output.offsetEnd = offsetEndValue;

        return output;
    }

    _readThemeDoubleValue(node, elementName, defaultValue) {
        const [hasValue, value] = node.lookup_double(elementName, false);
        return hasValue ? value : defaultValue;
    }

    _readElementData(node, elementName, defaultValues) {
        return {
            background: this._readGradientData(node, `${elementName}-background`, defaultValues.background),
            border: this._readGradientData(node, `${elementName}-border`, defaultValues.border),
            lineWidth: this._readThemeDoubleValue(node, `${elementName}-line-width`,
                defaultValues.lineWidth ?? 1.0),
        };
    }

    _createGradient(values, x0, y0, x1, y1) {
        if (values.colorEnd) {
            const gradient = new Cairo.LinearGradient(x0, y0, x1, y1);
            gradient.addColorStopRGBA(values.offsetStart,
                values.colorStart.red / 255,
                values.colorStart.green / 255,
                values.colorStart.blue / 255,
                values.colorStart.alpha / 255);
            gradient.addColorStopRGBA(values.offsetEnd,
                values.colorEnd.red / 255,
                values.colorEnd.green / 255,
                values.colorEnd.blue / 255,
                values.colorEnd.alpha / 255);
            return gradient;
        } else {
            const gradient = Cairo.SolidPattern.createRGBA(values.colorStart.red / 255,
                values.colorStart.green / 255,
                values.colorStart.blue / 255,
                values.colorStart.alpha / 255);
            return gradient;
        }
    }

    _drawProgressOverlay(area) {
        const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);
        const [surfaceWidth, surfaceHeight] = area.get_surface_size();
        const cr = area.get_context();
        const node = this._progressOverlayArea.get_theme_node();
        const iconSize = this._source.icon.iconSize * scaleFactor;

        let x = Math.floor((surfaceWidth - iconSize) / 2);
        let y = Math.floor((surfaceHeight - iconSize) / 2);

        const readThemeValue = element =>
            this._readThemeDoubleValue(node, `-progress-bar-${element}`);

        y = readThemeValue('top-offset') ?? y;

        const baseLineWidth = Math.floor(Number(scaleFactor));
        const horizontalPadding = iconSize *
            Utils.clampDouble(readThemeValue('horizontal-padding') ?? 0.05);
        const verticalPadding = iconSize *
            Utils.clampDouble(readThemeValue('vertical-padding') ?? 0.05);
        const heightFactor =
            Utils.clampDouble(readThemeValue('height-factor') ?? 0.20);

        let width = iconSize - 2.0 * horizontalPadding;
        let height = Math.floor(Math.min(18.0 * scaleFactor, heightFactor * iconSize));
        x += horizontalPadding;

        const valign = Utils.clampDouble(readThemeValue('valign') ?? 1);
        y += (iconSize - height - verticalPadding) * valign;

        const progressBarTrack = this._readElementData(node,
            '-progress-bar-track',
            UnityIndicator.defaultProgressBarTrack);

        const progressBar = this._readElementData(node,
            '-progress-bar',
            UnityIndicator.defaultProgressBar);

        // Draw the track
        let lineWidth = baseLineWidth * progressBarTrack.lineWidth;
        cr.setLineWidth(lineWidth);

        x += lineWidth;
        y += lineWidth;
        width -= 2.0 * lineWidth;
        height -= 2.0 * lineWidth;

        let fill = this._createGradient(progressBarTrack.background, 0, y, 0, y + height);
        let stroke = this._createGradient(progressBarTrack.border, 0, y, 0, y + height);
        Utils.drawRoundedLine(cr, x + lineWidth / 2.0,
            y + lineWidth / 2.0, width, height, true, true, stroke, fill);

        // Draw the finished bar
        lineWidth = baseLineWidth * progressBar.lineWidth;
        cr.setLineWidth(lineWidth);

        x += lineWidth;
        y += lineWidth;
        width -= 2.0 * lineWidth;
        height -= 2.0 * lineWidth;

        const finishedWidth = Math.ceil(this._progress * width);
        fill = this._createGradient(progressBar.background, 0, y, 0, y + height);
        stroke = this._createGradient(progressBar.border, 0, y, 0, y + height);

        if (Clutter.get_default_text_direction() === Clutter.TextDirection.RTL) {
            Utils.drawRoundedLine(cr,
                x + lineWidth / 2.0 + width - finishedWidth, y + lineWidth / 2.0,
                finishedWidth, height, true, true, stroke, fill);
        } else {
            Utils.drawRoundedLine(cr, x + lineWidth / 2.0, y + lineWidth / 2.0,
                finishedWidth, height, true, true, stroke, fill);
        }

        cr.$dispose();
    }

    setProgress(progress) {
        if (progress < 0) {
            this._hideProgressOverlay();
        } else {
            this._progress = Math.min(progress, 1.0);
            this._showProgressOverlay();
        }
    }

    setUrgent(urgent) {
        if (urgent || this._isUrgent !== undefined)
            this._source.urgent = urgent;

        if (urgent)
            this._isUrgent = urgent;
        else
            delete this._isUrgent;
    }

    setUpdating(updating) {
        this._source.updating = updating;
    }

    _updateIconStyle() {
        const opacity = this._readThemeDoubleValue(this._source.get_theme_node(),
            'opacity') ?? (this._source.updating ? 0.5 : 1);
        this._source.icon.set_opacity(255 * opacity);
    }
}


// Global icon cache. Used for Unity7 styling.
const iconCacheMap = new Map();
// Max number of items to store
// We don't expect to ever reach this number, but let's put an hard limit to avoid
// even the remote possibility of the cached items to grow indefinitely.
const MAX_CACHED_ITEMS = 1000;
// When the size exceed it, the oldest 'n' ones are deleted
const  BATCH_SIZE_TO_DELETE = 50;
// The icon size used to extract the dominant color
const DOMINANT_COLOR_ICON_SIZE = 64;

// Compute dominant color from the app icon.
// The color is cached for efficiency.
class DominantColorExtractor {
    constructor(app) {
        this._app = app;
    }

    /**
     * Try to get the pixel buffer for the current icon, if not fail gracefully
     */
    _getIconPixBuf() {
        let iconTexture = this._app.create_icon_texture(16);
        const themeLoader = Docking.DockManager.iconTheme;

        // Unable to load the icon texture, use fallback
        if (iconTexture instanceof St.Icon === false)
            return null;


        iconTexture = iconTexture.get_gicon();

        // Unable to load the icon texture, use fallback
        if (!iconTexture)
            return null;

        if (iconTexture instanceof Gio.FileIcon) {
            // Use GdkPixBuf to load the pixel buffer from the provided file path
            return GdkPixbuf.Pixbuf.new_from_file(iconTexture.get_file().get_path());
        } else if (iconTexture instanceof Gio.ThemedIcon) {
            // Get the first pixel buffer available in the icon theme
            const iconNames = iconTexture.get_names();
            const iconInfo = themeLoader.choose_icon(iconNames, DOMINANT_COLOR_ICON_SIZE, 0);

            if (iconInfo)
                return iconInfo.load_icon();
            else
                return null;
        }

        // Use GdkPixBuf to load the pixel buffer from memory
        // iconTexture.load is available unless iconTexture is not an instance of Gio.LoadableIcon
        // this means that iconTexture is an instance of Gio.EmblemedIcon,
        // which may be converted to a normal icon via iconTexture.get_icon?
        const [iconBuffer] = iconTexture.load(DOMINANT_COLOR_ICON_SIZE, null);
        return GdkPixbuf.Pixbuf.new_from_stream(iconBuffer, null);
    }

    /**
     * The backlight color choosing algorithm was mostly ported to javascript from the
     * Unity7 C++ source of Canonicals:
     * https://bazaar.launchpad.net/~unity-team/unity/trunk/view/head:/launcher/LauncherIcon.cpp
     * so it more or less works the same way.
     */
    _getColorPalette() {
        if (iconCacheMap.get(this._app.get_id())) {
            // We already know the answer
            return iconCacheMap.get(this._app.get_id());
        }

        const pixBuf = this._getIconPixBuf();
        if (!pixBuf)
            return null;

        let pixels = pixBuf.get_pixels();

        let total  = 0,
            rTotal = 0,
            gTotal = 0,
            bTotal = 0;

        let resampleX = 1;
        let resampleY = 1;

        // Resampling of large icons
        // We resample icons larger than twice the desired size, as the resampling
        // to a size s
        // DOMINANT_COLOR_ICON_SIZE < s < 2*DOMINANT_COLOR_ICON_SIZE,
        // most of the case exactly DOMINANT_COLOR_ICON_SIZE as the icon size is
        // typically a multiple of it.
        const width = pixBuf.get_width();
        const height = pixBuf.get_height();

        // Resample
        if (height >= 2 * DOMINANT_COLOR_ICON_SIZE)
            resampleY = Math.floor(height / DOMINANT_COLOR_ICON_SIZE);

        if (width >= 2 * DOMINANT_COLOR_ICON_SIZE)
            resampleX = Math.floor(width / DOMINANT_COLOR_ICON_SIZE);

        if (resampleX !== 1 || resampleY !== 1)
            pixels = this._resamplePixels(pixels, resampleX, resampleY);

        // computing the limit outside the for (where it would be repeated at each iteration)
        // for performance reasons
        const limit = pixels.length;
        for (let offset = 0; offset < limit; offset += 4) {
            const r = pixels[offset],
                g = pixels[offset + 1],
                b = pixels[offset + 2],
                a = pixels[offset + 3];

            const saturation = Math.max(r, g, b) - Math.min(r, g, b);
            const relevance  = 0.1 * 255 * 255 + 0.9 * a * saturation;

            rTotal += r * relevance;
            gTotal += g * relevance;
            bTotal += b * relevance;

            total += relevance;
        }

        total *= 255;

        const r = rTotal / total,
            g = gTotal / total,
            b = bTotal / total;

        const hsv = Utils.ColorUtils.RGBtoHSV(r * 255, g * 255, b * 255);

        if (hsv.s > 0.15)
            hsv.s = 0.65;
        hsv.v = 0.90;

        const rgb = Utils.ColorUtils.HSVtoRGB(hsv.h, hsv.s, hsv.v);

        // Cache the result.
        const backgroundColor = {
            lighter:  Utils.ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, 0.2),
            original: Utils.ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, 0),
            darker:   Utils.ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, -0.5),
        };

        if (iconCacheMap.size >= MAX_CACHED_ITEMS) {
            // delete oldest cached values (which are in order of insertions)
            let ctr = 0;
            for (const key of iconCacheMap.keys()) {
                if (++ctr > BATCH_SIZE_TO_DELETE)
                    break;
                iconCacheMap.delete(key);
            }
        }

        iconCacheMap.set(this._app.get_id(), backgroundColor);

        return backgroundColor;
    }

    /**
     * Downscale large icons before scanning for the backlight color to
     * improve performance.
     *
     * @param pixBuf
     * @param pixels
     * @param resampleX
     * @param resampleY
     *
     * @returns [];
     */
    _resamplePixels(pixels, resampleX, resampleY) {
        const resampledPixels = [];
        // computing the limit outside the for (where it would be repeated at each iteration)
        // for performance reasons
        const limit = pixels.length / (resampleX * resampleY) / 4;
        for (let i = 0; i < limit; i++) {
            const pixel = i * resampleX * resampleY;

            resampledPixels.push(pixels[pixel * 4]);
            resampledPixels.push(pixels[pixel * 4 + 1]);
            resampledPixels.push(pixels[pixel * 4 + 2]);
            resampledPixels.push(pixels[pixel * 4 + 3]);
        }

        return resampledPixels;
    }
}
