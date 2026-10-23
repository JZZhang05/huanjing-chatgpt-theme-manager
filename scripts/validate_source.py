"""Offline checks, syntax parsing and a scan of publishable source files."""
from pathlib import Path
import ast
import json
import re
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
DIRECTORIES=['src','scripts','tests','defaults','assets','installer','docs','.github']
FORBIDDEN=[
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(rb'\bgh[pousr]_[A-Za-z0-9]{30,}\b'),
    re.compile(rb'\bgithub_pat_[A-Za-z0-9_]{30,}\b'),
    re.compile(rb'\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}\b'),
    re.compile(rb'(?i)[a-z]:[\\/]+users[\\/]+(?!public\b|default\b)[^\\/\s"<>]+')
]
def main():
    files=[p for directory in DIRECTORIES for p in (ROOT/directory).rglob('*') if p.is_file()
           and '__pycache__' not in p.parts and p.suffix!='.pyc']
    files += [p for p in ROOT.iterdir() if p.is_file()]
    for file in files:
        if file.suffix.lower() in {'.png','.ico'}: continue
        data=file.read_bytes()
        if any(pattern.search(data) for pattern in FORBIDDEN):
            raise RuntimeError('Potential private information in '+str(file.relative_to(ROOT)))
        if file.suffix in {'.mjs','.js'}: subprocess.run(['node','--check',str(file)],check=True)
        elif file.suffix=='.py': ast.parse(file.read_text(encoding='utf-8-sig'),filename=str(file))
        elif file.suffix=='.json': json.loads(data.decode('utf-8-sig'))
        elif file.suffix=='.ps1' and not data.startswith(b'\xef\xbb\xbf'):
            raise RuntimeError('PowerShell 5.1 scripts need UTF-8 BOM: '+str(file))
    config=json.loads((ROOT/'config.json').read_text(encoding='utf8'))
    package=json.loads((ROOT/'package.json').read_text(encoding='utf8'))
    assert package['version']==config['version']
    catalog=json.loads((ROOT/'defaults/catalog.json').read_text(encoding='utf8'))
    assert catalog=={},'Public release must not contain unlicensed Workshop media'
    assert json.loads((ROOT/'defaults/background.json').read_text())['variant']=='original'
    result=subprocess.run(['node','--test',*[str(p) for p in sorted((ROOT/'tests').glob('*.test.mjs'))]],check=True)
    subprocess.run([sys.executable,'-m','unittest','discover','-s',str(ROOT/'tests'),'-p','test_*.py'],check=True)
    print(json.dumps({'pass':True,'checkedFiles':len(files),'version':config['version']}))

if __name__=='__main__': main()
