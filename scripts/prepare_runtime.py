"""Download only pinned upstream archives, verify SHA-256, and prepare a portable runtime."""
from pathlib import Path
import hashlib
import json
import shutil
import urllib.request
import zipfile

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.cache'
LOCK=ROOT/'scripts/dependencies.lock.json'

def digest(file):
    value=hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''): value.update(block)
    return value.hexdigest()

def download(item, offline=False):
    CACHE.mkdir(exist_ok=True)
    file=CACHE/item['filename']
    if file.is_file() and digest(file)==item['sha256']: return file
    if offline: raise RuntimeError('Missing verified cached dependency: '+item['filename'])
    if not item['url'].startswith('https://'): raise RuntimeError('HTTPS required')
    temporary=file.with_suffix(file.suffix+'.part')
    try:
        with urllib.request.urlopen(item['url'],timeout=120) as response, temporary.open('wb') as output:
            shutil.copyfileobj(response,output)
        if digest(temporary)!=item['sha256']: raise RuntimeError('Dependency checksum mismatch: '+item['filename'])
        temporary.replace(file)
    finally:
        if temporary.exists(): temporary.unlink()
    return file

def extract(archive, target):
    with zipfile.ZipFile(archive) as source:
        for entry in source.infolist():
            destination=(target/entry.filename).resolve()
            if not destination.is_relative_to(target.resolve()): raise RuntimeError('Unsafe archive path')
        source.extractall(target)

def prepare(payload, offline=False):
    node=payload/'runtime'
    python=payload/'tools/python'
    packages=python/'Lib/site-packages'
    licenses=payload/'licenses'
    for folder in [node,python,packages,licenses]: folder.mkdir(parents=True,exist_ok=True)
    for item in json.loads(LOCK.read_text(encoding='utf8')):
        file=download(item,offline)
        print('Verified '+item['filename'],flush=True)
        if item['kind']=='node':
            with zipfile.ZipFile(file) as source:
                prefix='node-v24.21.0-win-x64/'
                for name in ['node.exe','LICENSE']:
                    (node/('LICENSE.txt' if name=='LICENSE' else name)).write_bytes(source.read(prefix+name))
            shutil.copy2(node/'LICENSE.txt',licenses/'Node-LICENSE.txt')
        elif item['kind']=='python':
            extract(file,python)
            shutil.copy2(python/'LICENSE.txt',licenses/'Python-LICENSE.txt')
        else:
            extract(file,packages)
    (python/'python313._pth').write_text('python313.zip\n.\nLib\\site-packages\nimport site\n',encoding='ascii')
