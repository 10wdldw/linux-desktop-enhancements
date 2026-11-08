#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Own at most one embedded Fcitx5 process; never replace a running user IME."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import sys
import time

EXTENSION = Path(__file__).resolve().parent.parent
RUNTIME = EXTENSION/'resources/runtime'
LIB = RUNTIME/'usr/lib/x86_64-linux-gnu'


def environment():
    env = os.environ.copy()
    env['LD_LIBRARY_PATH'] = str(LIB) + (':'+env['LD_LIBRARY_PATH'] if env.get('LD_LIBRARY_PATH') else '')
    env['FCITX_ADDON_DIRS'] = str(LIB/'fcitx5')
    env['FCITX_DATA_DIRS'] = str(RUNTIME/'usr/share/fcitx5')
    env['XDG_DATA_DIRS'] = str(RUNTIME/'usr/share')+':'+env.get('XDG_DATA_DIRS','/usr/local/share:/usr/share')
    return env


def bus_owned():
    result = subprocess.run(['gdbus','call','--session','--dest','org.freedesktop.DBus',
        '--object-path','/org/freedesktop/DBus','--method','org.freedesktop.DBus.NameHasOwner',
        'org.fcitx.Fcitx5'],capture_output=True,text=True,timeout=5)
    if result.returncode: raise RuntimeError('A working user session bus is required.')
    return 'true' in result.stdout


def defaults():
    config = Path(os.environ.get('XDG_CONFIG_HOME',Path.home()/'.config'))/'fcitx5'
    templates = EXTENSION/'resources/input-method/config/fcitx5'
    for source in templates.rglob('*'):
        if not source.is_file(): continue
        target = config/source.relative_to(templates)
        target.parent.mkdir(parents=True,exist_ok=True)
        try:
            with target.open('x') as out: out.write(source.read_text().replace('@@IME_LIB@@',str(LIB)))
        except FileExistsError: pass
    # ZIP installations also get source dictionaries without overwriting words
    # learned by the user. Mutable overrides and custom phrases remain files.
    data = Path(os.environ.get('XDG_DATA_HOME',Path.home()/'.local/share'))/'fcitx5/rime'
    for directory in [EXTENSION/'resources/rime', EXTENSION/'resources/input-method/rime']:
        for source in directory.rglob('*'):
            if not source.is_file(): continue
            target = data/source.relative_to(directory)
            target.parent.mkdir(parents=True,exist_ok=True)
            if os.path.lexists(target): continue
            try:
                if source.name.endswith('.custom.yaml') or source.name == 'custom_phrase.txt':
                    with target.open('x') as out: out.write(source.read_text())
                else: target.symlink_to(source)
            except FileExistsError: pass


def run():
    if platform.machine() not in ['x86_64','amd64']:
        raise RuntimeError('The embedded engine targets Ubuntu 26.04 amd64.')
    directory = Path(os.environ.get('XDG_RUNTIME_DIR',Path.home()/'.cache'))/'linux-beautify'
    directory.mkdir(mode=0o700,parents=True,exist_ok=True)
    with (directory/'ime.lock').open('a') as lock:
        for attempt in range(120):
            try:
                fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB); break
            except BlockingIOError:
                try: stopping = json.loads((directory/'ime.json').read_text()).get('stopping',False)
                except (OSError,ValueError): stopping = False
                if not stopping:
                    print('LinuxBeautify IME: existing managed instance reused.',flush=True); return 0
                time.sleep(0.1)
        else: raise RuntimeError('Previous IME did not finish stopping.')
        if bus_owned():
            print('LinuxBeautify IME: existing session Fcitx5 reused.',flush=True); return 0
        defaults()
        engine = subprocess.Popen([str(RUNTIME/'usr/bin/fcitx5'),'-D','-k'],env=environment())
        stopped = [None]
        state = directory/'ime.json'
        record = {'pid':engine.pid,'launcher_pid':os.getpid(),'engine':str(RUNTIME/'usr/bin/fcitx5')}
        def stop(_signal, _frame):
            if stopped[0] is None:
                stopped[0] = time.monotonic()
                record['stopping'] = True
                state.write_text(json.dumps(record)+'\n')
            if engine.poll() is None: engine.terminate()
        signal.signal(signal.SIGTERM,stop); signal.signal(signal.SIGINT,stop)
        state.write_text(json.dumps(record)+'\n')
        try:
            while engine.poll() is None:
                try: return engine.wait(timeout=0.25)
                except subprocess.TimeoutExpired:
                    if stopped[0] is not None and time.monotonic() - stopped[0] > 8:
                        engine.kill()
            return engine.returncode
        finally:
            if engine.poll() is None:
                engine.terminate()
                try: engine.wait(timeout=8)
                except subprocess.TimeoutExpired: engine.kill(); engine.wait()
            state.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['run','version','deploy','remote','status'])
    parser.add_argument('args',nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.command == 'run': return run()
    if args.command == 'status':
        print(json.dumps({'fcitx5_running':bus_owned(),'embedded_runtime':str(RUNTIME)})); return 0
    if args.command == 'version': argv = [str(RUNTIME/'usr/bin/fcitx5'),'--version']
    elif args.command == 'remote': argv = [str(RUNTIME/'usr/bin/fcitx5-remote'),*args.args]
    else:
        data = Path(os.environ.get('XDG_DATA_HOME',Path.home()/'.local/share'))/'fcitx5/rime'
        data.mkdir(parents=True,exist_ok=True)
        (data/'build').mkdir(exist_ok=True)
        argv = [str(RUNTIME/'usr/bin/rime_deployer'),'--build',str(data),str(RUNTIME/'usr/share/rime-data'),str(data/'build')]
    return subprocess.call(argv,env=environment())


if __name__ == '__main__':
    try: sys.exit(main())
    except (OSError,RuntimeError) as error:
        print(str(error),file=sys.stderr); sys.exit(1)
