#!/usr/bin/env python3
"""User-scoped Linux Beautify installer with recoverable transactions."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parent.parent
EXTENSION = 'linux-beautify@local'
LEGACY = ['ubuntu-dock@ubuntu.com', 'dash-to-dock@micxgx.gmail.com',
    'user-theme@gnome-shell-extensions.gcampax.github.com', 'macstyle-session@local',
    'kimpanel@kde.org', 'quick-power-countdown@local', 'hdr-scanout@local']


def exists(path):
    return os.path.lexists(path)


def fingerprint(path):
    if not exists(path):
        return None
    digest = hashlib.sha256()
    paths = sorted(path.rglob('*')) if path.is_dir() and not path.is_symlink() else [path]
    for item in paths:
        digest.update((str(item.relative_to(path)) if item != path else '.').encode()+b'\0')
        if item.is_symlink():
            digest.update(b'link\0'+os.readlink(item).encode())
        elif item.is_file():
            with item.open('rb') as stream:
                digest.update(hashlib.file_digest(stream, 'sha256').digest())
    return digest.hexdigest()


def remove(path):
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink(missing_ok=True)


def command(argv, check=True):
    env = {**os.environ, 'LC_ALL': 'C.UTF-8'} if argv[0] == 'gnome-extensions' else None
    result = subprocess.run(argv, capture_output=True, text=True, env=env)
    if check and result.returncode:
        raise RuntimeError(f'{argv[0]}: {result.stderr.strip() or result.stdout.strip()}')
    return result


def shell_session():
    """Identify the Shell process, including across logins on the same user bus."""
    result = command(['gdbus', 'call', '--session', '--dest', 'org.freedesktop.DBus',
        '--object-path', '/org/freedesktop/DBus', '--method',
        'org.freedesktop.DBus.GetConnectionUnixProcessID', 'org.gnome.Shell'], check=False)
    match = re.fullmatch(r'\(uint32 (\d+),\)\s*', result.stdout)
    if result.returncode or not match:
        return None
    try:
        pid = match[1]
        start = (Path('/proc')/pid/'stat').read_text().rsplit(')', 1)[1].split()[19]
        boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        return f'{boot}:{pid}:{start}'
    except OSError:
        return None


class Installer:
    def __init__(self, package, profile):
        self.package, self.profile = Path(package), profile
        self.home = Path.home()
        self.data = Path(os.environ.get('XDG_DATA_HOME', self.home/'.local/share'))
        self.config = Path(os.environ.get('XDG_CONFIG_HOME', self.home/'.config'))
        self.state = Path(os.environ.get('XDG_STATE_HOME', self.home/'.local/state'))/'linux-desktop-enhancements'
        self.schemas = self.package/'payload'/EXTENSION/'schemas'
        if not self.schemas.is_dir():
            self.schemas = self.data/'gnome-shell/extensions'/EXTENSION/'schemas'
        self.zh = profile['language'].startswith('zh')
        for path in [self.data, self.config, self.state]:
            if not path.is_absolute() or str(path) in ['/etc', '/usr', '/var', '/']:
                raise RuntimeError('XDG directories must be absolute user locations.')

    def say(self, en, zh):
        print(zh if self.zh else en)

    def shell_version(self):
        if not shutil.which('gnome-shell'):
            raise RuntimeError('GNOME Shell 50 is required.')
        version = command(['gnome-shell', '--version']).stdout.strip()
        match = re.search(r'\b(\d+)\.', version)
        if not match or match.group(1) != '50':
            raise RuntimeError(f'Unsupported GNOME Shell: {version}; expected GNOME 50.')
        return version

    def doctor(self, require_ime=False):
        self.say('Target: Ubuntu / GNOME Shell 50', '目标环境：Ubuntu / GNOME Shell 50')
        print(self.shell_version())
        missing = []
        print('OK  integrated Dock / theme modules (no separate Shell extensions required)')
        if self.profile['with_input_method']:
            runtime = self.package/'payload'/EXTENSION/'resources/runtime'
            if not runtime.is_dir():
                runtime = self.data/'gnome-shell/extensions'/EXTENSION/'resources/runtime'
            for relative in ['usr/bin/fcitx5', 'usr/bin/rime_deployer', 'usr/lib/x86_64-linux-gnu/fcitx5/librime.so']:
                found = (runtime/relative).is_file()
                print(('OK  ' if found else 'MISSING  ')+relative)
                if not found and require_ime:
                    missing.append(relative)
            import platform
            if platform.machine() != 'x86_64':
                missing.append('Ubuntu 26.04 amd64 runtime required')
        if missing:
            self.say('Install system dependencies separately; this installer never runs sudo.',
                     '请先单独安装系统依赖；本安装器不会运行 sudo。')
            raise RuntimeError(', '.join(missing))

    def targets(self, apply=False, preserve_input=False):
        extension = self.package/'payload'/EXTENSION
        targets = [(extension, self.data/'gnome-shell/extensions'/EXTENSION)]
        targets += [(extension/'themes'/name, self.data/'themes'/name) for name in ['MacStyle-Light', 'MacStyle-Dark']]
        if not self.profile['with_input_method']:
            # Replacing a managed Chinese edition must also withdraw its input
            # integration. Back up current targets in this new layer and copy
            # their pre-Chinese originals, so reversing this layer still works.
            if (self.state/'current.json').is_file():
                previous, _ = self.current()
                if previous['edition'] == 'zh':
                    common = {str(target) for _, target in targets}
                    for item in previous['files']:
                        if item['target'] not in common:
                            source = Path(item['backup']) if item['backup'] and exists(Path(item['backup'])) else None
                            targets.append((source, Path(item['target'])))
            return targets
        targets.append((extension/'input/engine.py', self.home/'.local/bin/linux-beautify-ime'))
        for name in ['MacStyle-IME-Light', 'MacStyle-IME-Dark']:
            target = self.data/'fcitx5/themes'/name
            if not (preserve_input and exists(target)):
                targets.append((extension/'resources/input-method/themes'/name, target))
        # Preserve learned dictionaries and sync data by installing individual
        # distributed source files instead of replacing the user's Rime directory.
        for path in sorted((extension/'resources/rime').rglob('*')):
            if path.is_file():
                target = self.data/'fcitx5/rime'/path.relative_to(extension/'resources/rime')
                if preserve_input and exists(self.data/'fcitx5/rime'):
                    continue
                if path.name == 'custom_phrase.txt' and exists(target):
                    continue
                targets.append((path, target))
        for path in sorted((extension/'resources/input-method/rime').glob('*.yaml')):
            if not (preserve_input and exists(self.data/'fcitx5/rime')):
                targets.append((path, self.data/'fcitx5/rime'/path.name))
        if apply:
            for path in sorted((extension/'resources/input-method/config').rglob('*')):
                if path.is_file():
                    relative = path.relative_to(extension/'resources/input-method/config')
                    if preserve_input and (relative.parts[0] in ['autostart', 'environment.d'] or
                            (relative.parts[0] == 'fcitx5' and exists(self.config/'fcitx5'))):
                        continue
                    if str(relative) == 'autostart/linux-beautify-fcitx5.desktop':
                        relative = Path('autostart/fcitx5.desktop')
                    targets.append((path, self.config/relative))
            if not (preserve_input and exists(self.home/'.xinputrc')):
                targets.append((extension/'resources/input-method/xinputrc', self.home/'.xinputrc'))
        return targets

    def settings_command(self, argv):
        original = os.environ.get('GSETTINGS_SCHEMA_DIR')
        os.environ['GSETTINGS_SCHEMA_DIR'] = str(self.schemas)
        try:
            return command(argv)
        finally:
            if original is None:
                os.environ.pop('GSETTINGS_SCHEMA_DIR', None)
            else:
                os.environ['GSETTINGS_SCHEMA_DIR'] = original

    def resource_link(self, source):
        extension = self.package/'payload'/EXTENSION
        if not source.is_relative_to(extension):
            return None
        relative = source.relative_to(extension)
        if not relative.parts:
            return None
        immutable = str(relative) == 'input/engine.py' or relative.parts[0] == 'themes' or str(relative).startswith('resources/input-method/themes/') or (
            str(relative).startswith('resources/rime/') and source.name != 'custom_phrase.txt')
        return self.data/'gnome-shell/extensions'/EXTENSION/relative if immutable else None

    def setting_plan(self, theme):
        dark = theme == 'dark' or (theme == 'system' and 'prefer-dark' in self.settings_command(
            ['gsettings', 'get', 'org.gnome.desktop.interface', 'color-scheme']).stdout)
        settings = [('org.gnome.desktop.interface', 'gtk-theme', f"'MacStyle-{'Dark' if dark else 'Light'}'")]
        if theme != 'system':
            settings.append(('org.gnome.desktop.interface', 'color-scheme', "'prefer-dark'" if dark else "'default'"))
        for key, value in [('dock-position', "'BOTTOM'"), ('extend-height', 'false'),
                           ('dash-max-icon-size', '52'), ('icon-size-fixed', 'true'),
                           ('height-fraction', '0.88'), ('dock-fixed', 'false'), ('autohide', 'true')]:
            settings.append(('org.gnome.shell.extensions.linux-beautify.dock', key, value))
        if self.profile['with_input_method']:
            settings.append(('org.gnome.desktop.interface', 'gtk-im-module', "'fcitx'"))
        elif (self.state/'current.json').is_file():
            previous, _ = self.current()
            if previous['edition'] == 'zh':
                for item in previous['settings']:
                    if item['schema'] == 'org.gnome.desktop.interface' and item['key'] == 'gtk-im-module':
                        settings.append((item['schema'],item['key'],item['old']))
        return settings

    def stop_owned_engine(self):
        runtime = os.environ.get('XDG_RUNTIME_DIR')
        if not runtime:
            return
        record_file = Path(runtime)/'linux-beautify/ime.json'
        try:
            record = json.loads(record_file.read_text())
            expected = self.data/'gnome-shell/extensions'/EXTENSION
            if record.get('engine') != str(expected/'resources/runtime/usr/bin/fcitx5'):
                return
            launcher_pid = int(record['launcher_pid'])
            commandline = (Path('/proc')/str(launcher_pid)/'cmdline').read_bytes().split(b'\0')
            if str(expected/'input/engine.py').encode() not in commandline or b'run' not in commandline:
                return
            if (Path('/proc')/str(launcher_pid)).stat().st_uid != os.getuid():
                return
            os.kill(launcher_pid, signal.SIGTERM)
        except (FileNotFoundError, ProcessLookupError, KeyError, ValueError):
            return
        for _ in range(120):
            if not record_file.exists():
                return
            time.sleep(0.1)
        raise RuntimeError('The owned input engine is still stopping; retry after it exits.')

    def account_language(self):
        result = command(['busctl', '--system', 'get-property', 'org.freedesktop.Accounts',
            f'/org/freedesktop/Accounts/User{os.getuid()}', 'org.freedesktop.Accounts.User', 'Language'])
        values = shlex.split(result.stdout)
        if len(values) != 2 or values[0] != 's':
            raise RuntimeError('Could not read the AccountsService language.')
        return values[1]

    def set_account_language(self, value):
        command(['gdbus', 'call', '--system', '--dest', 'org.freedesktop.Accounts', '--object-path',
            f'/org/freedesktop/Accounts/User{os.getuid()}', '--method',
            'org.freedesktop.Accounts.User.SetLanguage', value])

    def save(self, directory, manifest):
        temporary = directory/'manifest.json.tmp'
        temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
        temporary.replace(directory/'manifest.json')

    def schedule_activation(self, manifest):
        """Keep the recovery code on the user's system disk, independent of the package."""
        root = self.state/'first-login'/manifest['id']
        (root/'scripts').mkdir(parents=True, exist_ok=True)
        for name in ['beautify.py', 'activate_on_login.py']:
            shutil.copy2(self.package/'scripts'/name, root/'scripts'/name)
        (root/'profile.json').write_text(json.dumps(self.profile, ensure_ascii=False)+'\n')
        autostart = self.config/'autostart'/f'linux-beautify-activate-{manifest["id"]}.desktop'
        autostart.parent.mkdir(parents=True, exist_ok=True)
        def quote(value):
            return '"'+str(value).replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('%', '%%')+'"'
        autostart.write_text('[Desktop Entry]\nType=Application\nName=Linux Beautify activation\n'
            +f'Exec={quote(sys.executable)} -B {quote(root/"scripts/activate_on_login.py")}\n'
            +'X-GNOME-Autostart-enabled=true\nNoDisplay=true\n')
        self.say('Automatic activation is prepared for the next login.', '已安排在下次登录后自动切换；失败时恢复旧插件。')

    def install(self, args):
        self.shell_version()
        targets = self.targets(args.apply, args.preserve_input)
        if args.defer_activation and not args.apply:
            raise RuntimeError('--defer-activation requires --apply.')
        for source, target in targets:
            if source is not None and not exists(source):
                raise RuntimeError(f'Missing package payload: {source}')
        conflicts = [str(target) for _, target in targets if exists(target)]
        if conflicts and not args.backup_existing:
            raise RuntimeError('Existing targets; nothing changed. Review and use --backup-existing:\n'+'\n'.join(conflicts))
        if args.set_session_language and not args.apply:
            raise RuntimeError('--set-session-language requires --apply.')
        change_language = args.set_session_language or (args.apply and self.profile.get('apply_session_language', False))
        old_language = None
        if change_language and not args.dry_run:
            installed = command(['locale', '-a']).stdout.lower().replace('-', '')
            if self.profile['session_locale'].lower().replace('-', '') not in installed:
                raise RuntimeError('Generate the selected UTF-8 locale before applying it.')
            old_language = self.account_language()
        settings = []
        plan = self.setting_plan(args.theme) if args.apply else []
        if args.apply and not args.dry_run:
            self.doctor(require_ime=self.profile['with_input_method'])
            for schema, key, value in plan:
                old = self.settings_command(['gsettings', 'get', schema, key]).stdout.strip()
                if self.settings_command(['gsettings', 'writable', schema, key]).stdout.strip() != 'true':
                    raise RuntimeError(f'Locked desktop setting: {schema} {key}')
                settings.append({'schema': schema, 'key': key, 'old': old, 'new': value})
        if args.dry_run:
            self.say('Dry run; installation files and desktop settings will not be changed.', '仅预览；不改动安装文件或桌面设置。')
            print(self.profile['name'])
            for source, target in targets:
                action = 'WITHDRAW ' if source is None else ('INSTALL ' if source.is_relative_to(self.package) else 'RESTORE PRE-CHINESE ' )
                print(('BACKUP + ' if exists(target) else '')+action+str(target))
            for schema, key, value in plan:
                print(f'APPLY {schema} {key} {value}')
            if change_language:
                print('SESSION LANGUAGE '+self.profile['session_locale'])
            if args.defer_activation:
                print('ACTIVATE AFTER NEXT LOGIN (existing extensions stay enabled)')
            return
        previous_extensions = command(['gnome-extensions', 'list', '--enabled'], check=False)
        main_was_enabled = previous_extensions.returncode == 0 and EXTENSION in previous_extensions.stdout.splitlines()
        # An ERROR or disabled instance may still hold cached ES modules/GTypes.
        info = command(['gnome-extensions', 'info', EXTENSION], check=False)
        cached_code = any(f'State: {state}' in info.stdout for state in ['ACTIVE', 'INACTIVE', 'ERROR', 'OUT OF DATE'])
        reload_session = shell_session() if cached_code or args.defer_activation else None
        if (cached_code or args.defer_activation) and not reload_session:
            raise RuntimeError('Cannot identify the GNOME Shell session; no files changed.')
        os.umask(0o077)
        identifier = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
        directory = self.state/'installations'/identifier
        directory.mkdir(parents=True)
        previous = json.loads((self.state/'current.json').read_text())['installation'] if (self.state/'current.json').exists() else None
        manifest = {'id': identifier, 'edition': self.profile['edition'], 'status': 'installing',
            'files': [], 'settings': [], 'extensions_disabled': [], 'enabled_by_installer': [],
            'old_session_language': old_language, 'language_changed': False, 'previous_installation': previous,
            'new_session_language': self.profile['session_locale'] if change_language else None,
            'main_was_enabled': main_was_enabled, 'preserve_input': args.preserve_input,
            'reload_session': reload_session}
        shutil.copytree(self.schemas, directory/'schemas')
        self.save(directory, manifest)
        try:
            if main_was_enabled:
                command(['gnome-extensions', 'disable', EXTENSION])
            self.stop_owned_engine()
            for number, (source, target) in enumerate(targets):
                operation = {'target': str(target), 'backup': None, 'installed_hash': None}
                if exists(target):
                    backup = directory/'originals'/str(number)
                    backup.parent.mkdir(exist_ok=True)
                    shutil.move(str(target), str(backup))
                    operation['backup'] = str(backup)
                manifest['files'].append(operation)
                self.save(directory, manifest)
                target.parent.mkdir(parents=True, exist_ok=True)
                link = self.resource_link(source) if source is not None else None
                if source is None:
                    pass
                elif link is not None:
                    target.symlink_to(link, target_is_directory=source.is_dir())
                elif source.is_symlink():
                    target.symlink_to(os.readlink(source), target_is_directory=source.is_dir())
                elif source.is_dir():
                    shutil.copytree(source, target, symlinks=True)
                else:
                    shutil.copy2(source, target)
                    if source.suffix in ['.desktop', '.conf', '.immodules'] and source.is_relative_to(self.package/'payload'/EXTENSION/'resources/input-method/config'):
                        content = target.read_text().replace('@@IME_LAUNCHER@@', str(self.home/'.local/bin/linux-beautify-ime')).replace('@@IME_LIB@@', str(self.data/'gnome-shell/extensions'/EXTENSION/'resources/runtime/usr/lib/x86_64-linux-gnu'))
                        target.write_text(content)
                operation['installed_hash'] = fingerprint(target)
                operation['ready'] = True
                self.save(directory, manifest)
            for change in settings:
                manifest['settings'].append(change)
                self.save(directory, manifest)
                self.settings_command(['gsettings', 'set', change['schema'], change['key'], change['new']])
            if old_language is not None:
                manifest['language_changed'] = True
                self.save(directory, manifest)
                self.set_account_language(self.profile['session_locale'])
                self.say('GNOME session language set to '+self.profile['session_locale']+'. Log out and back in for it to take effect.',
                    'GNOME 会话语言已设为 '+self.profile['session_locale']+'，注销重登后生效。')
            manifest['status'] = 'installed'
            self.save(directory, manifest)
            (self.state/'current.json').write_text(json.dumps({'installation': identifier})+'\n')
            if args.apply:
                if main_was_enabled or reload_session:
                    manifest['activation_pending'] = True
                    self.save(directory, manifest)
                    self.say('The installed code requires a fresh GNOME login before activation.',
                        '已安装新版代码，需要新的 GNOME 登录会话才能加载。')
                else:
                    self.activate(manifest, directory)
                if manifest.get('activation_pending'):
                    self.schedule_activation(manifest)
            self.say('Installation complete. Backup and uninstall manifest:', '安装完成，备份与卸载记录：')
            print(directory)
            if not args.apply:
                self.say('Enable linux-beautify@local after logging out and back in. --apply opts in to GTK/Dock/Chinese input defaults.',
                    '注销重登后可启用 linux-beautify@local；使用 --apply 可明确应用 GTK、Dock 和中文版输入法预设。')
        except BaseException:
            self.restore(manifest, directory, force=True, rollback=True)
            raise

    def activate(self, manifest, directory):
        if manifest.get('reload_session'):
            session = shell_session()
            if not session or session == manifest['reload_session']:
                manifest['activation_pending'] = True
                self.save(directory, manifest)
                self.say('A fresh GNOME login is required to load the installed code.',
                    '当前 GNOME 仍缓存旧代码，请注销重登后加载修复版。')
                return
        known = command(['gnome-extensions', 'list']).stdout.splitlines()
        required = [EXTENSION]
        if any(name not in known for name in required):
            manifest['activation_pending'] = True
            self.save(directory, manifest)
            self.say('Files and presets installed. Log out and back in, then run: python3 scripts/beautify.py activate',
                '文件与预设已安装。请注销重登，再执行：python3 scripts/beautify.py activate')
            return
        enabled = command(['gnome-extensions', 'list', '--enabled']).stdout.splitlines()
        for name in LEGACY:
            if name == 'kimpanel@kde.org' and not self.profile['with_input_method']:
                continue
            if name in enabled:
                if name not in manifest['extensions_disabled']:
                    manifest['extensions_disabled'].append(name)
                    self.save(directory, manifest)
                command(['gnome-extensions', 'disable', name])
        if EXTENSION not in enabled:
            manifest['enabled_by_installer'].append(EXTENSION)
            self.save(directory, manifest)
            command(['gnome-extensions', 'enable', EXTENSION])
        self.wait_active(required)
        manifest['activation_pending'] = False
        self.save(directory, manifest)
        self.say('Unified plugin enabled. The three-second countdown is on; HDR stays off until enabled.', '统一插件已启用。三秒电源倒计时已开启，HDR 保持关闭。')

    def activation_errors(self, required):
        errors = []
        for name in required:
            result = command(['gdbus', 'call', '--session', '--dest', 'org.gnome.Shell.Extensions',
                '--object-path', '/org/gnome/Shell/Extensions', '--method',
                'org.gnome.Shell.Extensions.GetExtensionErrors', name], check=False)
            details = (result.stdout or result.stderr).strip()
            if details not in ['', '(@as [],)', '([], )', '([],)']:
                errors.append(name + ': ' + details)
        return '\n'.join(errors)

    def wait_active(self, required):
        for _ in range(24):
            info = [command(['gnome-extensions', 'info', name], check=False) for name in required]
            if all('State: ACTIVE' in item.stdout for item in info):
                break
            if any('State: ERROR' in item.stdout for item in info):
                details = self.activation_errors(required)
                # During asynchronous imports Shell briefly exposes ERROR with
                # an empty errors array. Only a recorded error is terminal.
                if details:
                    raise RuntimeError('Plugin activation failed:\n'+'\n'.join(item.stdout for item in info)
                        + '\n' + details)
            time.sleep(0.25)
        else:
            raise RuntimeError('Plugin activation failed; did not become ACTIVE:\n'
                +'\n'.join(item.stdout+item.stderr for item in info)+'\n'+self.activation_errors(required))

    def current(self):
        current = self.state/'current.json'
        if not current.is_file():
            raise RuntimeError('No installation managed by Linux Beautify was found.')
        identifier = json.loads(current.read_text())['installation']
        if not re.fullmatch(r'[A-Za-z0-9-]+', identifier):
            raise RuntimeError('Invalid installation identifier.')
        directory = self.state/'installations'/identifier
        return json.loads((directory/'manifest.json').read_text()), directory

    def restore(self, manifest, directory, force=False, rollback=False):
        if (directory/'schemas').is_dir():
            self.schemas = directory/'schemas'
        conflicts = [item['target'] for item in manifest['files']
            if not item.get('restored') and (item.get('ready') or item['installed_hash']) and fingerprint(Path(item['target'])) not in [None, item['installed_hash']]]
        if not force and conflicts:
            raise RuntimeError('Installed files changed; nothing removed. Use --force to preserve edits and restore originals:\n'+'\n'.join(conflicts))
        (self.config/'autostart'/f'linux-beautify-activate-{manifest["id"]}.desktop').unlink(missing_ok=True)
        for extension in dict.fromkeys([EXTENSION]+list(reversed(manifest['enabled_by_installer']))):
            command(['gnome-extensions', 'disable', extension], check=False)
        self.stop_owned_engine()
        errors = []
        for item in reversed(manifest['settings']):
            if item.get('restored'):
                continue
            try:
                self.settings_command(['gsettings', 'set', item['schema'], item['key'], item['old']])
                item['restored'] = True
                self.save(directory, manifest)
            except (RuntimeError, OSError) as error:
                errors.append(str(error))
        if manifest.get('language_changed'):
            try:
                self.set_account_language(manifest['old_session_language'])
                manifest['language_changed'] = False
                self.save(directory, manifest)
            except (RuntimeError, OSError) as error:
                errors.append(str(error))
        for number, item in reversed(list(enumerate(manifest['files']))):
            if item.get('restored'):
                continue
            target = Path(item['target'])
            if exists(target):
                if item['target'] in conflicts or rollback:
                    saved = directory/'removed-content'/str(number)
                    saved.parent.mkdir(exist_ok=True)
                    shutil.move(str(target), str(saved))
                else:
                    remove(target)
            if item['backup'] and exists(Path(item['backup'])):
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(item['backup'], str(target))
            item['restored'] = True
            self.save(directory, manifest)
        for extension in manifest['extensions_disabled']:
            try:
                command(['gnome-extensions', 'enable', extension])
            except (RuntimeError, OSError) as error:
                errors.append(str(error))
        if manifest.get('main_was_enabled'):
            try:
                command(['gnome-extensions', 'enable', EXTENSION])
            except (RuntimeError, OSError) as error:
                errors.append(str(error))
        manifest['status'] = 'restoration-incomplete' if errors else ('rolled-back' if rollback else 'uninstalled')
        self.save(directory, manifest)
        current = self.state/'current.json'
        if not errors and current.is_file() and json.loads(current.read_text()).get('installation') == manifest['id']:
            if manifest.get('previous_installation'):
                current.write_text(json.dumps({'installation': manifest['previous_installation']})+'\n')
            else:
                current.unlink()
        if errors:
            raise RuntimeError(f'Files restored; some session settings could not be restored. Recovery manifest: {directory}\n'+'\n'.join(errors))
        self.say('Original files and managed settings restored. Recovery records:', '原文件及本次管理的设置已恢复。恢复记录：')
        print(directory)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['install', 'uninstall', 'doctor', 'activate'])
    parser.add_argument('--edition', choices=['zh', 'en'])
    parser.add_argument('--backup-existing', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--apply', action='store_true', help='Apply desktop presets; English edition also sets the user GNOME session to English, Chinese edition configures the IME')
    parser.add_argument('--preserve-input', action='store_true', help='Keep existing Fcitx/Rime configuration and input startup/environment integration')
    parser.add_argument('--defer-activation', action='store_true', help='Keep legacy extensions active until a fresh GNOME login')
    parser.add_argument('--theme', choices=['dark', 'light', 'system'], default='dark')
    parser.add_argument('--set-session-language', action='store_true', help='Also set the current user GNOME session language through AccountsService')
    parser.add_argument('--force', action='store_true', help='Preserve edited installed files while uninstalling')
    args = parser.parse_args()
    packaged = (ROOT/'profile.json').is_file()
    profile = json.loads((ROOT/'profile.json' if packaged else ROOT/'profiles'/f'{args.edition or "zh"}.json').read_text())
    if packaged and args.edition and args.edition != profile['edition']:
        raise RuntimeError('This archive contains a different edition; use the matching archive.')
    installer = Installer(ROOT, profile)
    if args.command == 'install' and not packaged:
        from build import build_bundle
        with tempfile.TemporaryDirectory(prefix='linux-beautify-build-') as temporary:
            package = build_bundle(profile['edition'], Path(temporary)/'package')
            Installer(package, profile).install(args)
    elif args.command == 'install':
        installer.install(args)
    elif args.command == 'doctor':
        installer.doctor(require_ime=profile['with_input_method'])
    else:
        manifest, directory = installer.current()
        installer.zh = manifest['edition'] == 'zh'
        if args.command == 'uninstall':
            if args.dry_run:
                for item in reversed(manifest['files']):
                    print('RESTORE '+item['target'])
            else:
                installer.restore(manifest, directory, args.force)
        elif args.dry_run:
            print('ENABLE '+EXTENSION)
        else:
            installer.profile['with_input_method'] = manifest['edition'] == 'zh'
            installer.activate(manifest, directory)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
