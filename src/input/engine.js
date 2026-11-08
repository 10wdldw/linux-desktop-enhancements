// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import {NativeInputPanel} from './panel.js';

// A previous enable may still be shutting down a Rime compilation worker.
// Chain the next launch after it, without blocking the Shell UI thread.
let previousShutdown = Promise.resolve();

export class IntegratedInput {
  constructor(context) { this.context = context; this.panel = new NativeInputPanel(context); }
  enable() {
    this.alive = true; this.panel.enable();
    previousShutdown.then(() => {
      if (!this.alive) return;
      const script = `${this.context.extension.path}/input/engine.py`;
      this.process = Gio.Subprocess.new(['python3', script, 'run'], Gio.SubprocessFlags.NONE);
      this.finished = new Promise(resolve => {
        this.process.wait_async(null, (process, result) => {
          try { process.wait_finish(result); } catch (error) { logError(error, 'embedded IME'); }
          if (this.process === process) this.process = null;
          resolve();
        });
      });
    }).catch(error => logError(error, 'embedded IME startup'));
  }
  snapshot() { return {...this.panel.snapshot(), managedEngineLauncher: !!this.process, embeddedEngine: true}; }
  disable() {
    this.alive = false; this.panel.disable();
    // Only our wrapper gets SIGTERM. It forwards it only to its own child;
    // a pre-existing system/user Fcitx5 is never signalled.
    if (this.process) {
      previousShutdown = this.finished;
      this.process.send_signal(15); this.process = null;
    }
  }
}
