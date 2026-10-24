// 关机/重启/注销确认框的倒计时由 gnome-session 通过 D-Bus 的
// org.gnome.SessionManager.EndSessionDialog.Open() 传入，固定为 60 秒，
// 没有对应的 gsettings 可调。这里把秒数改成 3，并把默认按钮从「取消」
// 改成对应的「关机 / 重启 / 注销」，回车即执行该操作。
//
// 例外：有程序在阻止这次操作时（gnome-session 传入的 inhibitor 列表非空，
// 比如有未保存内容的应用），倒计时归零 GNOME 也会照做不误，所以此时保留原来的
// 60 秒并且不设默认按钮，让你有时间看清对话框里列出的应用。
import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {EndSessionDialog} from 'resource:///org/gnome/shell/ui/endSessionDialog.js';

const COUNTDOWN_SECONDS = 3;

export default class QuickPowerCountdown extends Extension {
    enable() {
        this._injectionManager = new InjectionManager();
        const proto = EndSessionDialog.prototype;

        this._injectionManager.overrideMethod(proto, 'OpenAsync', original => {
            return function (parameters, ...rest) {
                const params = Array.from(parameters);
                // params: [type, timestamp, totalSeconds, inhibitorObjectPaths]
                const blocked = (params[3]?.length ?? 0) > 0;
                if (!blocked && params[2] > COUNTDOWN_SECONDS)
                    params[2] = COUNTDOWN_SECONDS;
                return original.call(this, params, ...rest);
            };
        });

        this._injectionManager.overrideMethod(proto, '_updateButtons', original => {
            return function () {
                const origAdd = this.addButton;
                let markedDefault = false;
                // 被阻止时不设默认按钮（_applications 在 OpenAsync 里先于本方法填好）。
                const blocked = (this._applications?.length ?? 0) > 0;
                this.addButton = info => {
                    // 「取消」绑定了 Escape；其后第一个按钮才是注销/重启/关机。
                    if (!info.key && !markedDefault && !blocked) {
                        info.default = true;
                        markedDefault = true;
                    }
                    return origAdd.call(this, info);
                };
                try {
                    return original.call(this);
                } finally {
                    delete this.addButton;
                }
            };
        });
    }

    disable() {
        this._injectionManager?.clear();
        this._injectionManager = null;
    }
}
