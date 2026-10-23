"""Use the installed Steam client and the user's Wallpaper Engine license."""
import argparse
import ctypes as c
import json
import os
from pathlib import Path
import sys
import time

def emit(**value):
    print(json.dumps(value, ensure_ascii=True), flush=True)

def run():
    p=argparse.ArgumentParser()
    p.add_argument('--settings', required=True)
    p.add_argument('--id', required=True)
    p.add_argument('--probe', action='store_true')
    args=p.parse_args()
    if not args.id.isascii() or not args.id.isdigit() or not 5<=len(args.id)<=20:
        raise ValueError('Invalid workshop ID')
    settings=json.loads(Path(args.settings).read_text(encoding='utf-8-sig'))
    engine=Path(settings['engine']).resolve()
    dll=engine.parent/'bin'/'steam_api64.dll'
    os.environ['SteamAppId']='431960'
    os.environ['SteamGameId']='431960'
    os.add_dll_directory(str(dll.parent))
    api=c.CDLL(str(dll))
    def fn(name, result, *params):
        f=getattr(api,name);f.restype=result;f.argtypes=list(params);return f
    def init():
        if hasattr(api,'SteamAPI_InitFlat'):
            error=c.create_string_buffer(1024)
            return fn('SteamAPI_InitFlat',c.c_int,c.c_void_p)(error)==0
        return fn('SteamAPI_Init',c.c_bool)()
    shutdown=fn('SteamAPI_Shutdown',None)
    callbacks=fn('SteamAPI_RunCallbacks',None)
    if not init():
        emit(fallback=True,message='Steam 未登录或下载接口暂不可用，请在 Steam 中订阅下载。')
        return
    try:
        interface=None
        for v in range(30,0,-1):
            try:
                interface=fn('SteamAPI_SteamUGC_v%03d'%v,c.c_void_p)()
                if interface:break
            except AttributeError:pass
        if not interface:
            emit(fallback=True,message='当前 Steam 接口不支持自动下载，请在 Steam 中订阅。');return
        state=fn('SteamAPI_ISteamUGC_GetItemState',c.c_uint32,c.c_void_p,c.c_uint64)
        install=fn('SteamAPI_ISteamUGC_GetItemInstallInfo',c.c_bool,c.c_void_p,c.c_uint64,c.POINTER(c.c_uint64),c.c_void_p,c.c_uint32,c.POINTER(c.c_uint32))
        progress=fn('SteamAPI_ISteamUGC_GetItemDownloadInfo',c.c_bool,c.c_void_p,c.c_uint64,c.POINTER(c.c_uint64),c.POINTER(c.c_uint64))
        download=fn('SteamAPI_ISteamUGC_DownloadItem',c.c_bool,c.c_void_p,c.c_uint64,c.c_bool)
        item=int(args.id)
        def installed():
            flags=state(interface,item)
            if flags&4 and not flags&(8|16|32):
                size=c.c_uint64();stamp=c.c_uint32();folder=c.create_string_buffer(32768)
                if install(interface,item,c.byref(size),folder,len(folder),c.byref(stamp)):
                    return folder.value.decode('utf8')
        folder=installed()
        if args.probe:
            emit(probe=True,available=True,state=state(interface,item),folder=folder);return
        if folder:
            emit(folder=folder,percent=100);return
        # Do not pause other Steam downloads or alter the user's subscriptions.
        if not download(interface,item,False):
            emit(fallback=True,message='Steam 未能开始下载，请在 Steam 页面订阅该壁纸。');return
        emit(message='Steam 正在下载壁纸…',percent=0)
        last=-1
        end=time.monotonic()+300
        while time.monotonic()<end:
            callbacks()
            folder=installed()
            if folder:
                emit(folder=folder,percent=100);return
            done=c.c_uint64();total=c.c_uint64()
            if progress(interface,item,c.byref(done),c.byref(total)) and total.value:
                percent=min(99,int(done.value*100/total.value))
                if percent!=last:
                    emit(message='Steam 正在下载壁纸…',percent=percent);last=percent
            time.sleep(.08)
        emit(fallback=True,message='下载尚未完成，可在 Steam 中查看进度；下载完成后会自动继续。')
    finally:shutdown()

if __name__=='__main__':
    try:run()
    except Exception as error:
        if '--probe' in sys.argv:print(type(error).__name__+': '+str(error),file=sys.stderr)
        emit(fallback=True,message='自动下载暂不可用，请在 Steam 页面订阅下载。')
