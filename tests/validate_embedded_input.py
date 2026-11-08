#!/usr/bin/env python3
"""Prove the embedded engine loads its own libraries and commits Chinese text."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'scripts'))
from build import build_bundle, UUID
from beautify import Installer


def inside(extension):
    from gi.repository import Gio, GLib
    spec = importlib.util.spec_from_file_location('embedded_ime',extension/'input/engine.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    module.defaults()
    deployed = subprocess.run([sys.executable,str(extension/'input/engine.py'),'deploy'],capture_output=True,text=True)
    if deployed.returncode: raise RuntimeError(deployed.stderr[-5000:])
    data = Path(os.environ['XDG_DATA_HOME'])/'fcitx5/rime'
    for name in ['rime_ice.schema.yaml','rime_ice.table.bin','double_pinyin.prism.bin','double_pinyin_flypy.prism.bin']:
        assert (data/'build'/name).is_file(), name
    log = Path.home()/'engine.log'
    with log.open('w') as output:
        engine = subprocess.Popen([sys.executable,str(extension/'input/engine.py'),'run'],stdout=output,stderr=output)
        try:
            for _ in range(100):
                if engine.poll() is not None: raise RuntimeError(log.read_text()[-5000:])
                if module.bus_owned(): break
                time.sleep(0.1)
            else: raise RuntimeError('No Fcitx5 name: '+log.read_text()[-5000:])
            record = json.loads((Path(os.environ['XDG_RUNTIME_DIR'])/'linux-beautify/ime.json').read_text())
            pid = record['pid']
            reused = subprocess.run([sys.executable,str(extension/'input/engine.py'),'run'],capture_output=True,text=True,timeout=5)
            assert reused.returncode == 0 and 'reused' in reused.stdout, reused
            bus = Gio.bus_get_sync(Gio.BusType.SESSION,None)
            def call(path, interface, method, params=None):
                return bus.call_sync('org.fcitx.Fcitx5',path,interface,method,params,None,Gio.DBusCallFlags.NONE,10000,None)
            path = call('/org/freedesktop/portal/inputmethod','org.fcitx.Fcitx.InputMethod1','CreateInputContext',
                GLib.Variant('(a(ss))',[[('program','linux-beautify-validation')]])).unpack()[0]
            iface = 'org.fcitx.Fcitx.InputContext1'
            call(path,iface,'SetCapability',GLib.Variant('(t)',[1]))
            committed=[]
            subscription=bus.signal_subscribe(None,iface,'CommitString',path,None,Gio.DBusSignalFlags.NONE,
                lambda _bus,_sender,_path,_iface,_name,params: committed.append(params.unpack()[0]))
            call(path,iface,'FocusIn')
            subprocess.run([sys.executable,str(extension/'input/engine.py'),'remote','-s','rime'],check=True)
            subprocess.run([sys.executable,str(extension/'input/engine.py'),'remote','-o'],check=True)
            time.sleep(1)
            for char in 'nihao ':
                call(path,iface,'ProcessKeyEvent',GLib.Variant('(uuubu)',[ord(char),0,0,False,0]))
            for _ in range(40):
                while GLib.MainContext.default().pending(): GLib.MainContext.default().iteration(False)
                if committed: break
                time.sleep(0.05)
            assert ''.join(committed) == '你好', (committed,log.read_text()[-6000:])
            maps=Path(f'/proc/{pid}/maps').read_text()
            for library in ['libFcitx5Core.so','librime.so','librime-lua.so']:
                assert any(str(extension/'resources/runtime') in line and library in line for line in maps.splitlines()), library
            bus.signal_unsubscribe(subscription);call(path,iface,'DestroyIC')
            result={'engine':'Fcitx5 5.1.19 + Rime 1.16.1','committed':''.join(committed),
                'libraries':'bundled Fcitx5 / Rime / Lua confirmed through proc maps','duplicate_start':'reused',
                'schemas':'Rime Ice and two double-pinyin schemes compiled using bundled deployer'}
        finally:
            Installer(extension.parent, {'language':'zh_CN'}).stop_owned_engine()
            if engine.poll() is None: engine.terminate()
            try: engine.wait(timeout=10)
            except subprocess.TimeoutExpired: engine.kill();engine.wait()
    assert not module.bus_owned(), 'Owned engine did not stop'
    result['cleanup']='owned engine stopped';print(json.dumps(result,ensure_ascii=False))


def run():
    with tempfile.TemporaryDirectory(prefix='beautify-embedded-ime-') as temporary:
        home=Path(temporary);package=build_bundle('zh',home/'package')
        for name in ['data','config','cache','state','runtime']: (home/name).mkdir(mode=0o700)
        extension=home/'data/gnome-shell/extensions'/UUID
        extension.parent.mkdir(parents=True)
        shutil.copytree(package/'payload'/UUID,extension,symlinks=True)
        env=os.environ.copy()
        for name in ['DBUS_SESSION_BUS_ADDRESS','DISPLAY','WAYLAND_DISPLAY','SESSION_MANAGER','GDK_BACKEND']:
            env.pop(name,None)
        env.update(HOME=str(home),XDG_CONFIG_HOME=str(home/'config'),XDG_DATA_HOME=str(home/'data'),
            XDG_CACHE_HOME=str(home/'cache'),XDG_STATE_HOME=str(home/'state'),XDG_RUNTIME_DIR=str(home/'runtime'),LANG='C.UTF-8',LC_ALL='C.UTF-8')
        completed=subprocess.run(['dbus-run-session','--',sys.executable,__file__,'--inside',str(extension)],env=env,capture_output=True,text=True,timeout=180)
        if completed.returncode: raise RuntimeError(completed.stdout+completed.stderr[-12000:])
        print(completed.stdout.strip())


if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='--inside': inside(Path(sys.argv[2]))
    else: run()
