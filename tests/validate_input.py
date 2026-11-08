#!/usr/bin/env python3
"""Compile only distributed Rime sources in an isolated, disposable user tree."""
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='beautify-rime-validation-') as temporary:
    home=Path(temporary)
    shutil.copytree(ROOT/'vendor/rime-ice',home/'user')
    for source in (ROOT/'input-method/rime').glob('*.yaml'):
        shutil.copy2(source,home/'user'/source.name)
    (home/'build').mkdir()
    with (home/'deploy.log').open('w') as output:
        subprocess.run(['rime_deployer','--build',str(home/'user'),'/usr/share/rime-data',str(home/'build')],
            stdout=output,stderr=output,check=True)
    expected=['rime_ice.schema.yaml','rime_ice.prism.bin','rime_ice.table.bin',
              'melt_eng.table.bin','radical_pinyin.table.bin','double_pinyin.prism.bin','double_pinyin_flypy.prism.bin']
    missing=[name for name in expected if not (home/'build'/name).is_file()]
    if missing:
        raise RuntimeError('Missing compiled input sources: '+', '.join(missing))
    print('Rime Ice, English/radical dictionaries and both double-pinyin presets compiled successfully.')
