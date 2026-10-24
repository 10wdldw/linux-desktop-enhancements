/*
 * HDR Scanout Helper
 *
 * mutter 50 在给 PQ 建色彩状态时，最大亮度被算成 min + 10000（10000.004883），
 * 而客户端不显式声明亮度时用的默认值是 10000.0。两者判等时差 0.99，远超容差 0.1，
 * 于是每个 HDR 客户端都被判为“需要亮度映射”，direct scanout 永远不发生，
 * HDR 画面只能走 mutter 在 N 卡上的 8 位合成缓冲。
 *
 * mutter 自带一个调试开关可以跳过这项检查。本扩展把它做成 D-Bus 开关：
 *
 *   开: gdbus call --session --dest org.gnome.Shell --object-path /local/HdrScanout \
 *          --method local.HdrScanout.SetIgnoreColorState true
 *   关: 同上，false
 *   查: gdbus call ... --method local.HdrScanout.GetIgnoreColorState
 *
 * 只在玩 HDR 全屏游戏时打开。开着的时候，SDR 全屏程序也可能被直通，颜色会不对。
 * 扩展被禁用时会自动关掉。
 */
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const IFACE = `
<node>
  <interface name="local.HdrScanout">
    <method name="SetIgnoreColorState">
      <arg type="b" name="enable" direction="in"/>
    </method>
    <method name="GetIgnoreColorState">
      <arg type="b" name="enabled" direction="out"/>
    </method>
  </interface>
</node>`;

const FLAG = Meta.DebugPaintFlag.IGNORE_COLOR_STATE_FOR_DIRECT_SCANOUT;

export default class HdrScanoutExtension extends Extension {
    enable() {
        this._enabled = false;
        this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._dbus.export(Gio.DBus.session, '/local/HdrScanout');
    }

    disable() {
        this.SetIgnoreColorState(false);
        this._dbus?.unexport();
        this._dbus = null;
    }

    SetIgnoreColorState(enable) {
        if (enable === this._enabled)
            return;
        if (enable)
            Meta.add_debug_paint_flag(FLAG);
        else
            Meta.remove_debug_paint_flag(FLAG);
        this._enabled = enable;
        console.log(`HDR Scanout Helper: ignore-color-state = ${enable}`);
    }

    GetIgnoreColorState() {
        return this._enabled;
    }
}
