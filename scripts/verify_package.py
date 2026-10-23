"""Verify a fresh installation and a preservation upgrade without registering or launching apps."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import shutil

ROOT=Path(__file__).resolve().parents[1]
def run(args):
    result=subprocess.run([str(a) for a in args],capture_output=True,encoding='utf8',errors='replace',
        env={**os.environ,'PYTHONIOENCODING':'utf-8','PYTHONDONTWRITEBYTECODE':'1'},timeout=180)
    if result.returncode: raise RuntimeError(result.stdout+'\n'+result.stderr)
    return result.stdout.strip()
def digest(file): return hashlib.sha256(file.read_bytes()).hexdigest()
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--ffmpeg',type=Path)
    args=parser.parse_args()
    version=json.loads((ROOT/'config.json').read_text(encoding='utf8'))['version']
    installer=ROOT/'dist'/('Huanjing-Setup-'+version+'.exe')
    target=ROOT/'build'/'verify 中文 path'/'Huanjing'
    if target.exists():
        assert target.resolve().is_relative_to((ROOT/'build').resolve())
        shutil.rmtree(target)
    result=json.loads(run([installer,'--extract-only',target]))
    assert result['pass']
    manifest=json.loads((target/'package-manifest.json').read_text(encoding='utf8'))
    for item in manifest['files']: assert digest(target/item['path'])==item['sha256'],item['path']
    assert manifest['version']==version and manifest['edition']=='public'
    assert (target/'media').is_dir(),'Fresh installs need an import destination'
    assert not list(target.rglob('*.mp4'))
    assert not (target/'tools/ffmpeg.exe').exists()
    node=target/'runtime/node.exe'
    for selection in ['original','system']:
        assert json.loads(run([node,target/'runtime.mjs','payload-check',selection]))['pass']
    # Public builds offer only media that exists; legacy upgrades offer their retained videos.
    script=target/'check-public.mjs'
    script.write_text("import{makePayload}from'./runtime.mjs';"
        "const p=await makePayload('original');"
        "console.log(JSON.stringify({legacy:p.includes('动态蕾姆')||p.includes('动态爱蜜莉雅'),"
        "cleanup:p.includes('URL.revokeObjectURL')}));",encoding='utf8')
    check=json.loads(run([node,script]))
    assert not check['legacy'] and check['cleanup']
    script.unlink()
    python=target/'tools/python/python.exe'
    smoke="from pathlib import Path;import runpy,sys,json,windows_capture;"+ \
        "w=runpy.run_path(str(Path(sys.argv[1])/'wallpaper-worker.py'));"+ \
        "im=w['read_image'](Path(sys.argv[1])/'background.png');"+ \
        "p=w['recommend'](im);assert im.shape[0]>500 and p['value']['text']=='#293644';"+ \
        "print(json.dumps({'image':True,'recommendation':True,'captureModule':True}))"
    assert json.loads(run([python,'-B','-c',smoke,target]))['image']
    settings=json.loads((target/'import-settings.json').read_text(encoding='utf8'))
    for field in ['python','capturePython','ffmpeg']:
        assert Path(settings[field]).is_relative_to(target)
    conversion=False
    if args.ffmpeg:
        folder=ROOT/'build'/'video fixture'/'1234567890'
        folder.mkdir(parents=True,exist_ok=True)
        run([args.ffmpeg,'-hide_banner','-loglevel','error','-y','-f','lavfi',
             '-i','color=c=0x9588ac:s=640x360:d=1:r=30','-an','-c:v','libx264',folder/'source.mp4'])
        (folder/'project.json').write_text(json.dumps({'type':'video','title':'Conversion test','file':'source.mp4'}),encoding='utf8')
        output=target/'media'/'.verification-job'
        output.mkdir(exist_ok=True)
        testsettings=ROOT/'build'/'conversion-settings.json'
        testsettings.write_text(json.dumps({'themeRoot':str(target),'workshopRoots':[str(folder.parent)],
            'ffmpeg':str(args.ffmpeg.resolve())}),encoding='utf8')
        run([python,'-B',target/'wallpaper-worker.py','--settings',testsettings,'--folder',folder,
             '--output',output,'--id','1234567890'])
        converted=json.loads((output/'result.json').read_text(encoding='utf8'))
        assert converted['width']==640 and (output/'wallpaper.mp4').is_file()
        assert output.resolve().is_relative_to((target/'media').resolve())
        shutil.rmtree(output)
        conversion=True
    # Simulate an older installation's own media and custom settings.
    retained=target/'media'/'user-owned.mp4'
    retained.write_bytes(b'user owned media preservation fixture')
    (target/'customization.json').write_text('{"version":1,"themes":{}}',encoding='utf8')
    names=['background.png','background.json','customization.json','media/user-owned.mp4']
    before={name:digest(target/name) for name in names}
    assert json.loads(run([installer,'--extract-only',target]))['pass']
    assert all(digest(target/name)==value for name,value in before.items())
    retained.unlink()
    report={'pass':True,'version':version,'fileHashes':len(manifest['files']),
            'publicMediaOnly':True,'payloadSyntax':True,'chineseSpaceRelocation':True,
            'independentPython':True,'preservesUserMediaAndSettings':True,
            'realVideoConversion':conversion,'installerSha256':digest(installer)}
    (ROOT/'build/verification.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report))

if __name__=='__main__': main()
