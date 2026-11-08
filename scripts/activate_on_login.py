#!/usr/bin/env python3
"""One-shot activation with diagnostics and transactional restoration on failure."""
import ast
import fcntl
import json
from pathlib import Path
import subprocess
import sys
import time

from beautify import Installer, EXTENSION, LEGACY, command, shell_session


class LoginActivation:
    def __init__(self, root):
        self.root = Path(root)
        self.installer = Installer(self.root, json.loads((self.root/'profile.json').read_text()))
        self.identifier = self.root.name
        self.autostart = self.installer.config/'autostart'/f'linux-beautify-activate-{self.identifier}.desktop'
        self.log = self.root/'activation.log'

    def record(self, message):
        with self.log.open('a') as output:
            output.write(time.strftime('%F %T ')+message+'\n')

    def notify(self, message):
        try:
            subprocess.run(['notify-send', 'Linux Beautify', message], timeout=5, check=False)
        except (OSError, subprocess.SubprocessError):
            pass

    def current_matches(self):
        path = self.installer.state/'current.json'
        return path.is_file() and json.loads(path.read_text())['installation'] == self.identifier

    def legacy_ready(self):
        enabled = command(['gnome-extensions', 'list', '--enabled'], check=False)
        if enabled.returncode:
            return False
        for name in set(enabled.stdout.splitlines()) & set(LEGACY):
            info = command(['gnome-extensions', 'info', name], check=False)
            if 'State: ACTIVE' in info.stdout or 'State: OUT OF DATE' in info.stdout:
                continue
            if 'State: ERROR' in info.stdout and self.installer.activation_errors([name]):
                continue
            return False
        return True

    def health(self, manifest):
        info = command(['gnome-extensions', 'info', EXTENSION])
        if 'State: ACTIVE' not in info.stdout:
            raise RuntimeError(info.stdout + self.installer.activation_errors([EXTENSION]))
        enabled = command(['gnome-extensions', 'list', '--enabled']).stdout.splitlines()
        overlaps = set(LEGACY) & set(enabled)
        if manifest['edition'] == 'en':
            overlaps.discard('kimpanel@kde.org')
        if overlaps:
            raise RuntimeError('Overlapping extensions still enabled: '+', '.join(sorted(overlaps)))
        result = command(['gdbus', 'call', '--session', '--dest', 'org.gnome.Shell',
            '--object-path', '/local/LinuxBeautify', '--method', 'local.LinuxBeautify.Diagnostics.GetSnapshot'])
        snapshot = json.loads(ast.literal_eval(result.stdout)[0])
        if snapshot['dockInstances'] != 1 or not snapshot['magnifierAttached'] or snapshot['edition'] != manifest['edition']:
            raise RuntimeError('Unhealthy runtime: '+json.dumps(snapshot))
        if (snapshot['input'] is not None) != (manifest['edition'] == 'zh'):
            raise RuntimeError('Input edition mismatch: '+json.dumps(snapshot))
        self.record('Health: '+json.dumps(snapshot, ensure_ascii=False))

    def rollback(self, manifest, directory, error):
        self.record('Activation failed: '+repr(error))
        self.record(self.installer.activation_errors([EXTENSION]))
        # Preserve exact module error stacks before the extension files go away.
        try:
            journal = subprocess.run(['journalctl', '--user', '-b', '_COMM=gnome-shell',
                '--since=-3min', '--no-pager', '-o', 'short-iso'], capture_output=True, text=True, timeout=10)
            (self.root/'gnome-shell.log').write_text(journal.stdout)
        except (OSError, subprocess.SubprocessError) as capture_error:
            self.record('Journal capture: '+repr(capture_error))
        try:
            self.installer.restore(manifest, directory)
            self.record('Rollback completed.')
            self.notify('一体化插件启用失败，已恢复旧插件。日志：'+str(self.log))
        except Exception as restore_error:
            self.record('Rollback incomplete: '+repr(restore_error))
            self.notify('自动恢复未完成，请查看：'+str(self.log))
        return 1

    def run(self):
        if not self.current_matches():
            self.record('Installation changed or uninstalled; activation cancelled.')
            self.autostart.unlink(missing_ok=True)
            return 0
        manifest, directory = self.installer.current()
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            session = shell_session()
            if session:
                if session == manifest.get('reload_session'):
                    self.record('Waiting for a fresh Shell session; no extension state changed.')
                    return 75  # Keep the autostart pending; never retry cached code.
                info = command(['gnome-extensions', 'info', EXTENSION], check=False)
                if info.returncode == 0 and self.legacy_ready():
                    break
            time.sleep(2)
        else:
            return self.rollback(manifest, directory, RuntimeError('Shell discovery timed out'))
        try:
            if not self.current_matches():
                return 0
            self.installer.activate(manifest, directory)
            if manifest.get('activation_pending'):
                raise RuntimeError('Activation still pending after a fresh login')
            self.health(manifest)
            time.sleep(3)
            self.health(manifest)
            self.record('ACTIVE and runtime health verified; replacement complete.')
            version = self.installer.profile['version']
            self.notify(f'中文版一体化插件 {version} 已启用，可以开始测试。' if manifest['edition'] == 'zh'
                        else f'Linux Beautify {version} is active and ready for testing.')
            return 0
        except Exception as error:
            return self.rollback(manifest, directory, error)
        finally:
            self.autostart.unlink(missing_ok=True)


def main():
    root = Path(__file__).resolve().parent.parent
    # Autostart and a manual invocation must not activate/restore concurrently.
    with (root/'activation.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0
        return LoginActivation(root).run()


if __name__ == '__main__':
    sys.exit(main())
