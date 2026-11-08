#!/usr/bin/env python3
"""Fetch official Ubuntu 26.04 amd64 IME packages and their matching sources.

No installation, sudo, or reads of installed binary payloads. APT's signed local
index supplies versions and SHA-256; every downloaded file is checked against it.
"""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
PACKAGES = '''fcitx5 fcitx5-data fcitx5-modules libfcitx5core7 libfcitx5config6 libfcitx5utils2
fcitx5-rime librime1t64 librime-bin librime-plugin-lua librime-plugin-charcode
libgoogle-glog0v6t64 libgflags2.2 libleveldb1d libmarisa1 libopencc1.1 libyaml-cpp0.8 liblua5.4-0
libxcb-imdkit1 libxcb-ewmh2 libxcb-icccm4 libxcb-keysyms1 libxcb-util1 libxcb-xinerama0 libxkbcommon-x11-0
rime-prelude fcitx5-frontend-gtk3 fcitx5-frontend-gtk4 libfcitx5gclient2
fcitx5-frontend-qt5 fcitx5-frontend-qt6 libfcitx5-qt1 libfcitx5-qt6-1 libfcitx5-qt-data'''.split()
BASE = 'https://archive.ubuntu.com/ubuntu/'


def records(text):
    result = []
    for block in text.strip().split('\n\n'):
        data = {}; key = None
        for line in block.splitlines():
            if line.startswith((' ', '\t')) and key:
                data[key] += '\n' + line
            elif ': ' in line:
                key, value = line.split(': ', 1); data[key] = value
            elif line.endswith(':'):
                key = line[:-1]; data[key] = ''
        if data: result.append(data)
    return result


def apt(*args):
    return subprocess.check_output(['apt-cache', *args], text=True)


def fetch(job):
    path, relative, expected = job
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        subprocess.run(['curl', '-fLsS', '--retry', '2', '--max-time', '180', '-o', str(path), BASE+relative], check=True)
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected: raise RuntimeError(f'Checksum mismatch: {path.name}')


def main():
    destination = ROOT/'vendor/input-runtime'
    source_dir = destination/'sources'; source_dir.mkdir(parents=True, exist_ok=True)
    provenance = {'target':'Ubuntu 26.04 amd64', 'archive':BASE, 'binary_packages':[], 'source_packages':[]}
    jobs = []; sources = {}
    with tempfile.TemporaryDirectory(prefix='beautify-official-ime-') as temporary:
        temp = Path(temporary)
        for name in PACKAGES:
            info = records(apt('show', name))[0]
            source = info.get('Source', name)
            match = re.fullmatch(r'(\S+)(?: \(([^)]+)\))?', source)
            source_name, source_version = match.groups()
            sources[source_name] = source_version or info['Version']
            path = temp/Path(info['Filename']).name
            jobs.append((path, info['Filename'], info['SHA256']))
            provenance['binary_packages'].append({key:info[key] for key in ['Package','Version','Architecture','Filename','SHA256']})
        for name, version in sources.items():
            candidates = records(apt('showsrc', name))
            info = next(item for item in candidates if item['Version'] == version)
            files = []
            for line in info['Checksums-Sha256'].splitlines():
                if not line.strip(): continue
                sha256, size, filename = line.split()
                relative = info['Directory']+'/'+filename
                jobs.append((source_dir/filename, relative, sha256))
                files.append({'file':filename,'sha256':sha256,'url':BASE+relative})
            provenance['source_packages'].append({'name':name,'version':version,'files':files})
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            list(pool.map(fetch, jobs))
        sysroot = destination/'sysroot'
        if sysroot.exists():
            import shutil
            shutil.rmtree(sysroot)
        sysroot.mkdir()
        for path in temp.glob('*.deb'):
            subprocess.run(['dpkg-deb', '-x', str(path), str(sysroot)], check=True)
        # Optional spelling/lua/emoji add-ons are not part of the integrated IME.
        # Keep the engine, Rime and all display/protocol frontends.
        for name in ['spell','emoji','luaaddonloader','testfrontend','testim','testui']:
            (sysroot/'usr/lib/x86_64-linux-gnu/fcitx5'/f'lib{name}.so').unlink(missing_ok=True)
            (sysroot/'usr/share/fcitx5/addon'/f'{name}.conf').unlink(missing_ok=True)
        # Relocate toolkit modules without changing application-wide loader paths.
        provenance['relocated_modules'] = []
        lib = sysroot/'usr/lib/x86_64-linux-gnu'
        modules = list(lib.glob('gtk-*/[34].0.0/immodules/*.so')) + list(lib.glob('qt*/plugins/platforminputcontexts/*.so'))
        for module in modules:
            subprocess.run(['patchelf','--set-rpath','$ORIGIN/../../..',str(module)],check=True)
            provenance['relocated_modules'].append({'file':str(module.relative_to(sysroot)),
                'runpath':'$ORIGIN/../../..','sha256':hashlib.sha256(module.read_bytes()).hexdigest()})
        for path in (sysroot/'usr/share/doc').rglob('*'):
            if path.is_symlink() and not path.exists(): path.unlink()
        import shutil
        for name in ['GPL-2','GPL-3','LGPL-2','LGPL-2.1','LGPL-3','Apache-2.0','BSD','MPL-2.0']:
            source = Path('/usr/share/common-licenses')/name
            if source.exists():
                target = sysroot/'usr/share/common-licenses'/name
                target.parent.mkdir(exist_ok=True); shutil.copy2(source,target)
        (destination/'SOURCE.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
        print(f'Verified {len(PACKAGES)} binary packages and {len(sources)} matching source packages.')


if __name__ == '__main__': main()
