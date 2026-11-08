#!/usr/bin/env python3
"""Build the two offline, source-included editions without reading user state."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
UUID = 'linux-beautify@local'


def copy_tree(source, destination):
    shutil.copytree(source, destination, symlinks=True, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', 'gschemas.compiled'))


def build_bundle(edition, destination):
    profile = json.loads((ROOT/'profiles'/f'{edition}.json').read_text())
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=False)
    (destination/'profile.json').write_text(json.dumps(profile, ensure_ascii=False, indent=2)+'\n')
    for filename in ['LICENSE', 'THIRD_PARTY_NOTICES.md']:
        shutil.copy2(ROOT/filename, destination/filename)
    copy_tree(ROOT/'licenses', destination/'licenses')
    shutil.copy2(ROOT/'docs'/f'README.{edition}.md', destination/'README.md')
    (destination/'docs').mkdir()
    for filename in ['ARCHITECTURE.md', 'AUDIT.md', 'VALIDATION.md']:
        shutil.copy2(ROOT/'docs'/filename, destination/'docs'/filename)
    (destination/'scripts').mkdir()
    shutil.copy2(ROOT/'scripts/beautify.py', destination/'scripts/beautify.py')
    shutil.copy2(ROOT/'scripts/activate_on_login.py', destination/'scripts/activate_on_login.py')
    (destination/'install.sh').write_text('#!/usr/bin/env bash\nset -euo pipefail\nroot="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"\nexec python3 "$root/scripts/beautify.py" install "$@"\n')
    (destination/'uninstall.sh').write_text('#!/usr/bin/env bash\nset -euo pipefail\nroot="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"\nexec python3 "$root/scripts/beautify.py" uninstall "$@"\n')
    for name in ['install.sh', 'uninstall.sh']:
        (destination/name).chmod(0o755)
    extension = destination/'payload'/UUID
    copy_tree(ROOT/'src', extension)
    # Source-only Dock files stay in the repository; runtime has one entry point.
    shutil.rmtree(extension/'dock/schemas')
    shutil.rmtree(extension/'dock/po')
    for filename in ['screenshot.jpg', 'logo.svg']:
        (extension/'dock/media'/filename).unlink(missing_ok=True)
    if not profile['with_input_method']:
        shutil.rmtree(extension/'input')
    edition_code = ("import {IntegratedInput} from './input/engine.js';\nexport const createInput = context => new IntegratedInput(context);\n"
                    if profile['with_input_method'] else "export const createInput = () => null;\n")
    (extension/'edition.js').write_text(edition_code)
    copy_tree(ROOT/'themes', extension/'themes')
    copy_tree(ROOT/'licenses', extension/'licenses')
    shutil.copy2(ROOT/'LICENSE', extension/'LICENSE')
    shutil.copy2(ROOT/'THIRD_PARTY_NOTICES.md', extension/'THIRD_PARTY_NOTICES.md')
    css = subprocess.run(['sassc', str(ROOT/'src/dock/_stylesheet.scss')], check=True, capture_output=True, text=True).stdout
    css = css.replace('./media/', './dock/media/')
    css += "\n.linux-beautify-input { background-color: #f5f5f5; color: #202020; border: 1px solid #999; border-radius: 12px; padding: 8px; spacing: 4px; }\n.linux-beautify-candidate { padding: 6px 10px; border-radius: 7px; }\n.linux-beautify-candidate.selected, .linux-beautify-candidate:hover { background-color: #3584e4; color: white; }\n"
    (extension/'stylesheet.css').write_text(css)
    for po in (ROOT/'src/dock/po').glob('*.po'):
        target = extension/'locale'/po.stem/'LC_MESSAGES/dashtodock.mo'
        target.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['msgfmt', '-o', str(target), str(po)], check=True, capture_output=True)
        shutil.copy2(po, target.with_suffix('.po'))
    metadata = {
        'uuid': UUID, 'name': profile['name'], 'description': profile['description'],
        'version': sum(int(part)*scale for part,scale in zip(profile['version'].split('.'),[10000,100,1])),
        'version-name': profile['version'], 'shell-version': ['50'],
        'settings-schema': 'org.gnome.shell.extensions.linux-beautify', 'gettext-domain': 'dashtodock',
        'session-modes': ['user'], 'beautify-edition': edition, 'default-language': profile['language'],
    }
    (extension/'metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n')
    subprocess.run(['glib-compile-schemas', '--strict', str(extension/'schemas')], check=True)
    if profile['with_input_method']:
        copy_tree(ROOT/'vendor/rime-ice', extension/'resources/rime')
        copy_tree(ROOT/'input-method', extension/'resources/input-method')
        copy_tree(ROOT/'vendor/input-runtime/sysroot', extension/'resources/runtime')
        copy_tree(ROOT/'vendor/input-runtime/sources', extension/'resources/runtime/sources')
        shutil.copy2(ROOT/'vendor/input-runtime/SOURCE.json', extension/'resources/runtime/SOURCE.json')
    return destination


def build_releases(output, editions):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    artifacts = []
    for edition in editions:
        profile = json.loads((ROOT/'profiles'/f'{edition}.json').read_text())
        name = f'linux-beautify-{edition}-{profile["version"]}'
        directory = output/name
        if directory.exists():
            shutil.rmtree(directory)
        build_bundle(edition, directory)
        archive = output/f'{name}.tar.gz'
        with tarfile.open(archive, 'w:gz') as target:
            target.add(directory, arcname=name)
        extension = directory/'payload'/UUID
        shell_zip = output/f'{name}.shell-extension.zip'
        with zipfile.ZipFile(shell_zip, 'w', zipfile.ZIP_DEFLATED) as target:
            for path in sorted(extension.rglob('*')):
                if path.is_file():
                    target.write(path, path.relative_to(extension))
        artifacts += [archive, shell_zip]
        print(directory)
        print(archive)
        print(shell_zip)
    with (output/'SHA256SUMS').open('w') as sums:
        for artifact in artifacts:
            with artifact.open('rb') as source:
                sums.write(hashlib.file_digest(source, 'sha256').hexdigest()+'  '+artifact.name+'\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', default=str(ROOT/'dist'))
    parser.add_argument('--edition', choices=['zh', 'en', 'both'], default='both')
    args = parser.parse_args()
    build_releases(args.output_dir, ['zh', 'en'] if args.edition == 'both' else [args.edition])
