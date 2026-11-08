#!/usr/bin/env python3
"""Run the built extensions in a headless GNOME session with a temporary home."""
import ast
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT/'scripts'))
from build import build_bundle, UUID


def inside(home, edition):
    home = Path(home)
    # English must not reject a configured external input panel: it owns none.
    legacy_file = home/'legacy.json'
    legacy = json.loads(legacy_file.read_text()) if legacy_file.exists() else []
    login_retry = (home/'login-retry').exists()
    enabled = legacy or ([UUID] + (['kimpanel@kde.org'] if edition == 'en' else []))
    subprocess.run(['gsettings', 'set', 'org.gnome.shell', 'enabled-extensions', repr(enabled)], check=True)
    log = home/'gnome-shell.log'
    result = {}
    test_window = None
    with log.open('w') as output:
        shell = subprocess.Popen(['gnome-shell', '--headless', '--wayland', '--no-x11',
            '--virtual-monitor=1280x800', '--wayland-display=linux-beautify-validation', '--mode=user'],
            stdout=output, stderr=subprocess.STDOUT)
        try:
            if legacy:
                for _ in range(80):
                    infos = [subprocess.run(['gnome-extensions', 'info', name], capture_output=True, text=True).stdout for name in legacy]
                    if all('State: ACTIVE' in info for info in infos):
                        break
                    if shell.poll() is not None:
                        errors = [subprocess.run(['gdbus','call','--session','--dest','org.gnome.Shell.Extensions',
                            '--object-path','/org/gnome/Shell/Extensions','--method',
                            'org.gnome.Shell.Extensions.GetExtensionErrors',name],capture_output=True,text=True).stdout for name in legacy]
                        raise RuntimeError('Legacy startup failed: ' + '\n'.join(infos + errors))
                    time.sleep(0.5)
                else:
                    raise RuntimeError('Legacy startup timed out: ' + '\n'.join(infos))
                # Real installed legacy modules register GTypes before the new
                # extension imports. Use the real installer for the transition.
                install_args = [sys.executable, str(home/'package/scripts/beautify.py'), 'install',
                    '--backup-existing', '--apply', '--theme', 'system', '--preserve-input']
                if login_retry:
                    install_args.append('--defer-activation')
                subprocess.run(install_args, check=True)
                result['migration'] = {'legacy_active_first': legacy, 'same_shell_transition': not login_retry}
                if login_retry:
                    current = json.loads((home/'state/linux-desktop-enhancements/current.json').read_text())['installation']
                    first_login = home/'state/linux-desktop-enhancements/first-login'/current
                    activation = [sys.executable, '-B', str(first_login/'scripts/activate_on_login.py')]
                    premature = subprocess.run(activation)
                    assert premature.returncode == 75, premature.returncode
                    for name in legacy:
                        assert 'State: ACTIVE' in subprocess.run(['gnome-extensions', 'info', name],capture_output=True,text=True).stdout
                    shell.terminate(); shell.wait(timeout=10)
                    shell = subprocess.Popen(['gnome-shell', '--headless', '--wayland', '--no-x11',
                        '--virtual-monitor=1280x800', '--wayland-display=linux-beautify-validation', '--mode=user'],
                        stdout=output, stderr=subprocess.STDOUT)
                    # Invoke immediately, as desktop autostart does. The helper
                    # must wait for Shell and the legacy modules to finish loading.
                    subprocess.run(activation, check=True)
                    assert 'replacement complete' in (first_login/'activation.log').read_text()
                    assert not list((home/'config/autostart').glob('linux-beautify-activate-*.desktop'))
                    result['migration']['fresh_login_activation'] = 'passed with two runtime health checks'
            for _ in range(80):
                if shell.poll() is not None:
                    raise RuntimeError(f'Headless Shell exited: {shell.returncode}')
                info = subprocess.run(['gnome-extensions', 'info', UUID], capture_output=True, text=True)
                if 'State: ACTIVE' in info.stdout:
                    result['main'] = info.stdout
                    break
                if 'State: ERROR' in info.stdout:
                    error_info = subprocess.run(['gdbus','call','--session','--dest','org.gnome.Shell.Extensions','--object-path','/org/gnome/Shell/Extensions','--method','org.gnome.Shell.Extensions.GetExtensionErrors',UUID],capture_output=True,text=True)
                    raise RuntimeError(info.stdout+error_info.stdout+error_info.stderr)
                time.sleep(0.5)
            else:
                raise RuntimeError('Timed out waiting for ACTIVE: '+info.stdout+info.stderr)
            def dbus(path, method, *args):
                completed = subprocess.run(['gdbus', 'call', '--session', '--dest', 'org.gnome.Shell',
                    '--object-path', path, '--method', method, *args], capture_output=True, text=True, check=True)
                return ast.literal_eval(completed.stdout)[0] if completed.stdout.strip() != '()' else None
            def snapshot():
                return json.loads(dbus('/local/LinuxBeautify', 'local.LinuxBeautify.Diagnostics.GetSnapshot'))
            time.sleep(1)
            first = snapshot()
            assert first['dockInstances'] == 1, first
            assert first['magnifierAttached'], first
            assert first['interfaceSettingsObjects'] == 1, first
            assert first['dockDiscoveryPolls'] == 0 and first['fullInterfaceScans'] == 0, first
            assert first['externalExtensionControllers'] == 0 and first['newNetworkClients'] == 0, first
            enabled_info = subprocess.run(['gnome-extensions', 'list', '--enabled'],capture_output=True,text=True,check=True).stdout.splitlines()
            expected = [UUID] + (['kimpanel@kde.org'] if edition == 'en' and 'kimpanel@kde.org' in legacy else [])
            assert set(enabled_info) == set(expected), enabled_info
            dock = json.loads(dbus('/local/LinuxBeautify', 'local.LinuxBeautify.Diagnostics.TestDock'))
            assert dock['items'] > 0 and dock['enlarged'] and dock['cacheRetained'] == 0, dock
            assert dock['scans'] == 1 and dock['requests'] == 20, dock
            result['dock_workload'] = dock
            # A real GTK window exercises the shader and window lifecycle.
            program = "import gi;gi.require_version('Gtk','3.0');from gi.repository import Gtk;w=Gtk.Window(title='Beautify functional validation');w.set_default_size(420,260);w.add(Gtk.Entry());w.show_all();Gtk.main()"
            test_window = subprocess.Popen([sys.executable, '-c', program], stdout=output, stderr=output)
            for _ in range(40):
                windows = json.loads(dbus('/local/LinuxBeautify', 'local.LinuxBeautify.Diagnostics.TestWindow', 'inspect'))
                if windows.get('rounded'): break
                time.sleep(0.1)
            assert windows.get('rounded') and snapshot()['shadowActors'] == 0, windows
            for action, key, expected in [('maximize','maximized',True), ('unmaximize','maximized',False),
                    ('minimize','minimized',True), ('unminimize','minimized',False)]:
                dbus('/local/LinuxBeautify', 'local.LinuxBeautify.Diagnostics.TestWindow', action)
                time.sleep(0.3)
                current = json.loads(dbus('/local/LinuxBeautify', 'local.LinuxBeautify.Diagnostics.TestWindow', 'inspect'))
                assert current[key] == expected, (action, current)
            result['window_lifecycle'] = 'rounded GTK window, maximize/restore and minimize/restore passed'
            for scheme, theme in [('prefer-dark','dark'), ('default','light')]:
                subprocess.run(['gsettings','set','org.gnome.desktop.interface','color-scheme',scheme],check=True)
                time.sleep(0.2)
                assert snapshot()['theme'] == theme, snapshot()
            assert snapshot()['appearanceSignalConnections'] == 1, snapshot()
            result['themes'] = 'light/dark passed; one shared appearance connection'
            test_window.terminate(); test_window.wait(timeout=5); test_window = None
            if edition == 'zh':
                dbus('/local/LinuxBeautify', 'local.LinuxBeautify.Diagnostics.TestFocus')
                time.sleep(0.5)
                focused = snapshot()
                assert focused['input']['ownsPanelName'], focused
                assert focused['focusSignalConnections'] == 1, focused
                before = dbus('/local/LinuxBeautify', 'local.LinuxBeautify.Diagnostics.TestFocusBurst')
                time.sleep(0.1)
                assert snapshot()['focusSnapshots'] == before + 1, (before, snapshot())
                dbus('/org/kde/impanel', 'org.kde.impanel2.SetLookupTable', "['1', '2']", "['你好', '世界']", "['', '']", 'false', 'true', '0', '1')
                subprocess.run(['gdbus', 'emit', '--session', '--object-path', '/kimpanel',
                    '--signal', 'org.kde.kimpanel.inputmethod.ShowLookupTable', 'true'], check=True)
                time.sleep(0.2)
                candidates = snapshot()
                assert candidates['input']['candidates'] == 2, candidates
                for _ in range(20):
                    dbus('/org/kde/impanel', 'org.kde.impanel2.SetLookupTable', "['1', '2']", "['你好', '世界']", "['', '']", 'false', 'true', '0', '1')
                time.sleep(0.1)
                unchanged = snapshot()
                assert unchanged['input']['redraws'] == candidates['input']['redraws'], (candidates, unchanged)
                assert unchanged['input']['ignoredUpdates'] >= candidates['input']['ignoredUpdates'] + 20, unchanged
                dbus('/org/kde/impanel', 'org.kde.impanel2.SetSpotRect', '120', '180', '20', '25')
                time.sleep(0.1)
                moved = snapshot()
                assert moved['input']['redraws'] == unchanged['input']['redraws'], moved
                subprocess.run(['gdbus', 'emit', '--session', '--object-path', '/kimpanel',
                    '--signal', 'org.kde.kimpanel.inputmethod.UpdateLookupTableCursor', '1'], check=True)
                time.sleep(0.1)
                selected = snapshot()
                assert selected['input']['cursor'] == 1 and selected['input']['visible'], selected
                assert selected['input']['redraws'] == moved['input']['redraws'] + 1, (moved, selected)
                result['coalescing'] = {'focus_burst_events': 40, 'focus_snapshots': 1,
                    'duplicate_candidate_updates': 20, 'duplicate_candidate_rebuilds': 0, 'cursor_change': 'passed', 'position_only_rebuilds': 0}
                dbus('/local/LinuxBeautify', 'local.LinuxBeautify.Diagnostics.TestBlur')
                time.sleep(0.2)
                blurred = snapshot()
                assert not blurred['input']['ownsPanelName'] and blurred['input']['inputMethodSignalSubscriptions'] == 0, blurred
                library = home/'data/gnome-shell/extensions'/UUID/'resources/runtime/usr/lib/x86_64-linux-gnu'
                for version in ['3.0','4.0']:
                    program = "import gi,os;from pathlib import Path;gi.require_version('Gtk',os.environ['GTK_TEST_VERSION']);from gi.repository import Gtk;Gtk.init();context=Gtk.IMMulticontext.new();context.get_preedit_string();assert context.get_context_id()=='fcitx';maps=Path('/proc/self/maps').read_text();assert any(os.environ['IME_TEST_LIB'] in line and 'libFcitx5GClient.so' in line for line in maps.splitlines()),[line for line in maps.splitlines() if 'Fcitx' in line or 'im-fcitx' in line];print('GTK '+os.environ['GTK_TEST_VERSION']+' bundled input module loaded')"
                    env = {**os.environ,'GTK_TEST_VERSION':version,'GTK_IM_MODULE':'fcitx','IME_TEST_LIB':str(library),
                        'GTK_IM_MODULE_FILE':str(home/'config/fcitx5/linux-beautify-gtk3.immodules'),'GTK_PATH':str(library/'gtk-3.0')+':'+str(library/'gtk-4.0')}
                    probe = subprocess.run([sys.executable,'-c',program],env=env,capture_output=True,text=True)
                    assert probe.returncode == 0, probe.stdout+probe.stderr
                result['toolkit_frontends'] = 'GTK3 / GTK4 bundled modules and GClient loaded'
                result['input_panel'] = 'native focus / protocol / release passed'
            else:
                assert first['input'] is None, first
            result['resources'] = first
            engine_record = home/'runtime/linux-beautify/ime.json'
            for cycle in range(3):
                engine_pid = json.loads(engine_record.read_text())['pid'] if edition == 'zh' and engine_record.exists() else None
                # Exercise cleanup and re-enable, not a real logout or power action.
                subprocess.run(['gnome-extensions', 'disable', UUID], check=True)
                time.sleep(1)
                if engine_pid:
                    for _ in range(120):
                        if not Path(f'/proc/{engine_pid}').exists(): break
                        time.sleep(0.1)
                    assert not Path(f'/proc/{engine_pid}').exists(), 'Native child survived disable'
                subprocess.run(['gnome-extensions', 'enable', UUID], check=True)
                time.sleep(2)
                if edition == 'zh':
                    for _ in range(120):
                        if engine_record.exists(): break
                        time.sleep(0.1)
                    assert engine_record.exists(), 'Embedded IME was not restarted'
                info = subprocess.run(['gnome-extensions','info',UUID],capture_output=True,text=True,check=True)
                if 'State: ACTIVE' not in info.stdout:
                    raise RuntimeError('Re-enable failed: '+info.stdout)
                result['reenable'] = 'ACTIVE, three cycles'
                second = snapshot()
                for key in ['managedSignalConnections', 'managedSources', 'dockInstances']:
                    assert first[key] == second[key], (key, first, second)
            cleanups = [json.loads(line.split('LinuxBeautify cleanup ',1)[1]) for line in log.read_text().splitlines() if 'LinuxBeautify cleanup ' in line]
            assert cleanups and all(item['managedSignalConnections'] == 0 and item['managedSources'] == 0 and item['pendingClients'] == 0 and item['dockManagerReleased'] for item in cleanups), cleanups
            result['cleanup'] = cleanups[-1]
            subprocess.run(['gnome-extensions', 'prefs', UUID], check=True)
            time.sleep(2)
            result['preferences'] = 'opened in the isolated Wayland session'
            text = log.read_text(errors='replace')
            markers = ['JS ERROR: dock magnifier', 'JS ERROR: quick settings',
                       'JS ERROR: rounded corners', 'Extension linux-beautify@local:', 'dock attachment:', 'LinuxBeautify cleanup:', 'IME entry setup:']
            found = [marker for marker in markers if marker in text]
            found += [line for line in text.splitlines() if '@file://' in line and '/linux-beautify@local/' in line]
            if found:
                raise RuntimeError('Plugin component errors: '+', '.join(found))
            result['component_errors'] = []
        except BaseException:
            print(log.read_text(errors='replace')[-18000:], file=sys.stderr)
            raise
        finally:
            if test_window is not None:
                test_window.terminate(); test_window.wait(timeout=5)
            if shell.poll() is None:
                subprocess.run(['gnome-extensions','disable',UUID],capture_output=True)
                engine_record = home/'runtime/linux-beautify/ime.json'
                for _ in range(120):
                    if not engine_record.exists(): break
                    time.sleep(0.1)
            shell.terminate()
            try:
                shell.wait(timeout=10)
            except subprocess.TimeoutExpired:
                shell.kill(); shell.wait()
    (home/'result.json').write_text(json.dumps(result,indent=2)+'\n')


def run(edition, legacy_dirs=(), login_retry=False):
    with tempfile.TemporaryDirectory(prefix=f'beautify-gnome-{edition}-') as temporary:
        home=Path(temporary)
        package=build_bundle(edition,home/'package')
        # AccountsService is on the host system bus. Migration tests exercise
        # Shell hooks only; language changes are covered by isolated unit tests.
        profile_file = package/'profile.json'
        profile = json.loads(profile_file.read_text())
        profile['apply_session_language'] = False
        profile_file.write_text(json.dumps(profile))
        extensions=home/'data/gnome-shell/extensions'
        extensions.mkdir(parents=True)
        shutil.copytree(package/'payload'/UUID,extensions/UUID)
        legacy = []
        for source in legacy_dirs:
            source = Path(source)
            metadata = json.loads((source/'metadata.json').read_text())
            legacy.append(metadata['uuid'])
            shutil.copytree(source, extensions/metadata['uuid'])
        if legacy:
            (home/'legacy.json').write_text(json.dumps(legacy))
            # Legacy theme lookup expects the conventional location.
            shutil.copytree(package/'payload'/UUID/'themes', home/'data/themes')
        if login_retry:
            if not legacy:
                raise RuntimeError('--login-retry requires at least one --legacy-dir')
            (home/'login-retry').touch()
        for name in ['runtime','config','cache','state']:
            (home/name).mkdir(mode=0o700)
        env=os.environ.copy()
        for name in ['DISPLAY','WAYLAND_DISPLAY','DBUS_SESSION_BUS_ADDRESS','SESSION_MANAGER','GDK_BACKEND']:
            env.pop(name,None)
        env.update(HOME=str(home),XDG_DATA_HOME=str(home/'data'),XDG_CONFIG_HOME=str(home/'config'),
            XDG_CACHE_HOME=str(home/'cache'),XDG_STATE_HOME=str(home/'state'),XDG_RUNTIME_DIR=str(home/'runtime'),
            LINUX_BEAUTIFY_TEST_MODE='1',GSETTINGS_BACKEND='keyfile',LANG='C.UTF-8',LC_ALL='C.UTF-8',LIBGL_ALWAYS_SOFTWARE='1',
            WAYLAND_DISPLAY='linux-beautify-validation',XDG_SESSION_TYPE='wayland')
        completed=subprocess.run(['dbus-run-session','--',sys.executable,__file__,'--inside',str(home),edition],env=env,capture_output=True,text=True)
        if completed.returncode:
            print(completed.stdout, file=sys.stderr)
            print(completed.stderr[-20000:], file=sys.stderr)
            raise RuntimeError(f'{edition} runtime validation failed')
        if any('linux-beautify@local/prefs.js:' in line for line in completed.stderr.splitlines()):
            raise RuntimeError('Preferences stack trace: '+completed.stderr[-12000:])
        result=json.loads((home/'result.json').read_text())
        print(json.dumps({'edition':edition,'main':'ACTIVE','migration':result.get('migration'),'re_enable':result['reenable'],
            'dock_workload':result['dock_workload'], 'coalescing':result.get('coalescing'),
            'window_lifecycle':result['window_lifecycle'], 'themes':result['themes'],
            'input_panel':result.get('input_panel', 'not bundled'), 'toolkit_frontends':result.get('toolkit_frontends'), 'resources':result['resources'], 'cleanup':result['cleanup'],
            'preferences':result['preferences']},ensure_ascii=False))


if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='--inside':
        inside(sys.argv[2],sys.argv[3])
    else:
        import argparse
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument('editions', nargs='*', choices=['en','zh'])
        parser.add_argument('--legacy-dir', action='append', default=[], help='Copy an existing legacy extension into the isolated session')
        parser.add_argument('--login-retry', action='store_true', help='Exercise deferred activation across two isolated Shell processes')
        args = parser.parse_args()
        for edition in (args.editions or ['en','zh']):
            run(edition, args.legacy_dir, args.login_retry)
