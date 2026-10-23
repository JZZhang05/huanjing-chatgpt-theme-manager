"""Convert a local Steam wallpaper; capture only its dedicated window."""
import argparse
from collections import deque
import colorsys
import ctypes
import json
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time

import cv2
import numpy as np

CREATE_NO_WINDOW=0x08000000
cancelled=threading.Event()
def interrupted(*_):cancelled.set()
signal.signal(signal.SIGTERM,interrupted)
signal.signal(signal.SIGINT,interrupted)
def listen_cancel():
    for line in sys.stdin:
        if line.strip()=='cancel':cancelled.set();break
threading.Thread(target=listen_cancel,daemon=True).start()

def emit(**value):print(json.dumps(value,ensure_ascii=True),flush=True)
def drain_errors(process):
    # Some codecs log more than a Windows pipe buffer; continuously drain it.
    errors=deque(maxlen=8)
    def read():
        try:
            while data:=process.stderr.read(4096):errors.append(data)
        except (ValueError,OSError):pass
    threading.Thread(target=read,daemon=True).start()
    return errors
def check_cancel():
    if cancelled.is_set():raise RuntimeError('已取消导入')
def contained(folder,name):
    if not isinstance(name,str) or not name or '\x00' in name:raise ValueError('壁纸文件名无效')
    result=(folder/name).resolve()
    if not result.is_relative_to(folder.resolve()):raise ValueError('壁纸文件超出作品目录')
    return result
def read_image(file):
    # OpenCV's Windows image-file API does not accept every Unicode path.
    return cv2.imdecode(np.frombuffer(Path(file).read_bytes(),dtype=np.uint8),cv2.IMREAD_COLOR)

def write_image(file,frame):
    ok,data=cv2.imencode(Path(file).suffix,frame)
    if ok:Path(file).write_bytes(data.tobytes())
    return ok

def read_project(folder):
    file=folder/'project.json'
    if file.stat().st_size>2*1024*1024:raise ValueError('壁纸描述文件过大')
    return json.loads(file.read_text(encoding='utf-8-sig'))

def recommend(frame):
    # Prefer the background behind the chat area over a single bright highlight.
    small=cv2.resize(frame[:,:,:3],(128,72))
    left=small[:,:83]
    rgb=cv2.cvtColor(left,cv2.COLOR_BGR2RGB).reshape(-1,3).astype(np.float32)/255
    hsv=cv2.cvtColor((rgb.reshape(72,83,3)*255).astype(np.uint8),cv2.COLOR_RGB2HSV).reshape(-1,3)
    good=(hsv[:,1]>28)&(hsv[:,2]>45)&(hsv[:,2]<248)
    if good.sum()>50:
        hues=hsv[good,0]/180
        weights=(hsv[good,1]/255)**.7
        histogram,_=np.histogram(hues,bins=24,range=(0,1),weights=weights)
        best=int(histogram.argmax());chosen=good&((hsv[:,0]/180*24).astype(int)==best)
        color=np.median(rgb[chosen],axis=0)
    else:color=np.median(rgb,axis=0)
    hue,_,sat=colorsys.rgb_to_hls(*color)
    mean=np.median(rgb,axis=0)
    bg_hue,_,bg_sat=colorsys.rgb_to_hls(*mean)
    if bg_sat<.08:bg_hue=hue
    # Soft, low saturation surfaces match the reference selected by the user.
    base=np.array(colorsys.hls_to_rgb(bg_hue,.875,min(.23,max(.12,bg_sat*.35))))
    base=base*.85+np.array([.914,.875,.843])*.15
    accent=colorsys.hls_to_rgb(hue,.435,min(.36,max(.23,sat*.52)))
    tohex=lambda a:'#'+''.join(f'{int(round(float(v)*255)):02x}' for v in a)
    names=['玫瑰','暖杏','麦色','橄榄','鼠尾草','青绿','青灰','蓝灰','蓝紫','灰紫','烟粉','藕粉']
    label=names[int((hue+1/24)%1*12)]
    return dict(name='壁纸取色 · '+label,value=dict(base=tohex(base),accent=tohex(accent),text='#293644',panelTransparency=33,maskStrength=39,blur=8))

def encoder_args(ffmpeg,output,inputs,software=False):
    codec=['-c:v','libx264','-preset','veryfast','-crf','19'] if software else ['-c:v','h264_nvenc','-preset','p6','-rc','vbr','-cq','19','-b:v','0']
    return [ffmpeg,'-hide_banner','-nostdin','-loglevel','error','-y',*inputs,'-an',*codec,'-pix_fmt','yuv420p','-movflags','+faststart',str(output)]

def video(ffmpeg,source,output):
    cap=cv2.VideoCapture(str(source));duration=cap.get(cv2.CAP_PROP_FRAME_COUNT)/max(1,cap.get(cv2.CAP_PROP_FPS));cap.release()
    if duration<=0:raise RuntimeError('无法读取该视频，请先确认它能在 Wallpaper Engine 播放')
    seconds=min(120,duration)
    inputs=['-i',str(source),'-t',str(seconds),'-vf',"scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30"]
    emit(phase='converting',message='正在转换高清静音视频…',percent=10)
    for software in (False,True):
        check_cancel()
        args=encoder_args(ffmpeg,output,inputs,software)
        args[1:1]=['-progress','pipe:1','-nostats']
        process=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=CREATE_NO_WINDOW)
        errors=drain_errors(process)
        def progress():
            try:
                for line in process.stdout:
                    if line.startswith(b'out_time_us='):
                        try:
                            fraction=int(line.split(b'=',1)[1])/1000000/max(1,seconds)
                            emit(phase='converting',message='正在转换高清静音视频…',percent=10+min(75,int(fraction*75)))
                        except ValueError:pass
            except (ValueError,OSError):pass
        threading.Thread(target=progress,daemon=True).start()
        started=time.monotonic()
        try:
            while process.poll() is None:
                check_cancel()
                if time.monotonic()-started>240:raise RuntimeError('视频转换超时，请尝试较短的视频壁纸')
                time.sleep(.2)
            if process.returncode==0:break
            if software:raise RuntimeError('视频转换失败，可能是源文件未下载完整或格式不受支持')
        finally:
            if process.poll() is None:process.kill();process.wait()
            process.stderr.close()
    return seconds

def capture(settings,folder,output,poster,item):
    sys.path.insert(0,settings['capturePython'])
    from windows_capture import WindowsCapture,Frame,InternalCaptureControl
    engine=settings['engine'];ffmpeg=settings['ffmpeg'];title='Emilia Import '+item
    u=ctypes.windll.user32
    u.SetProcessDPIAware()
    u.FindWindowW.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p];u.FindWindowW.restype=ctypes.c_void_p
    u.ShowWindow.argtypes=[ctypes.c_void_p,ctypes.c_int]
    u.SetWindowPos.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_uint]
    def command(args):subprocess.run([engine,*args],check=True,creationflags=CREATE_NO_WINDOW,timeout=15,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    control=None;encoder=None
    try:
        emit(phase='rendering',message='正在打开独立壁纸窗口，仅处理壁纸画面…',percent=10)
        command(['-control','openWallpaper','-file',str(folder/'project.json'),'-playInWindow',title,'-width','1920','-height','1080','-borderless','true','-activate','false'])
        handle=None
        for _ in range(100):
            check_cancel();handle=u.FindWindowW(None,title)
            if handle:break
            time.sleep(.15)
        if not handle:raise RuntimeError('无法打开壁纸窗口，请确认 Wallpaper Engine 已启动且能播放该壁纸')
        u.ShowWindow(handle,4);u.SetWindowPos(handle,ctypes.c_void_p(1),0,0,1920,1080,0x50)
        command(['-control','applyProperties','-location',title,'-properties','RAW~({"volume":0})~END'])
        time.sleep(2)
        ready=threading.Event();closed=threading.Event();lock=threading.Lock();state={}
        window_capture=WindowsCapture(cursor_capture=False,draw_border=False,secondary_window=False,minimum_update_interval=16,window_hwnd=handle)
        @window_capture.event
        def on_frame_arrived(frame:Frame,_control:InternalCaptureControl):
            with lock:state['data']=frame.frame_buffer.tobytes();state['size']=(frame.width,frame.height)
            ready.set()
        @window_capture.event
        def on_closed():closed.set()
        control=window_capture.start_free_threaded()
        if not ready.wait(12):raise RuntimeError('未收到壁纸画面；请保持 Wallpaper Engine 正常运行后重试')
        width,height=state['size']
        if not 320<=width<=4096 or not 240<=height<=2160:raise RuntimeError('壁纸窗口尺寸异常')
        inputs=['-f','rawvideo','-pixel_format','bgra','-video_size',f'{width}x{height}','-framerate','30','-i','pipe:0']
        # Try the GPU once; use the CPU encoder if this machine cannot start it.
        for software in (False,True):
            encoder=subprocess.Popen(encoder_args(ffmpeg,output,inputs,software),stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,creationflags=CREATE_NO_WINDOW)
            errors=drain_errors(encoder)
            started=time.perf_counter();saved=False
            try:
                for k in range(600):
                    check_cancel()
                    if closed.is_set():raise RuntimeError('壁纸窗口被关闭，请重试')
                    delay=started+k/30-time.perf_counter()
                    if delay>0:time.sleep(delay)
                    with lock:data=state['data'];size=state['size']
                    if size!=(width,height):raise RuntimeError('壁纸窗口尺寸已改变，请重试')
                    encoder.stdin.write(data)
                    if k==150:
                        frame=np.frombuffer(data,dtype=np.uint8).reshape(height,width,4)
                        if not write_image(poster,frame[:,:,:3]):raise RuntimeError('无法保存壁纸预览')
                        saved=True
                    if k%30==0:emit(phase='recording',message=f'正在生成壁纸循环：{k//30}/20 秒',percent=15+int(k/600*70))
                encoder.stdin.close()
                if encoder.wait(timeout=30):raise BrokenPipeError()
                if not saved:raise RuntimeError('无法读取壁纸画面')
                break
            except BrokenPipeError:
                if software:raise RuntimeError('无法编码壁纸循环，请确认显卡驱动正常')
            finally:
                if encoder.poll() is None:encoder.kill();encoder.wait()
                encoder.stderr.close()
        return 20
    finally:
        if control:control.stop()
        try:command(['-control','closeWallpaper','-location',title])
        except Exception:pass

def main():
    p=argparse.ArgumentParser();p.add_argument('--settings',required=True);p.add_argument('--folder',required=True);p.add_argument('--output',required=True);p.add_argument('--id',required=True);args=p.parse_args()
    if not args.id.isascii() or not args.id.isdigit():raise ValueError('无效壁纸编号')
    settings=json.loads(Path(args.settings).read_text(encoding='utf-8-sig'))
    folder=Path(args.folder).resolve()
    allowed=[Path(r).resolve() for r in settings['workshopRoots']]
    if not any(folder.is_relative_to(r) and folder.name==args.id for r in allowed):raise ValueError('壁纸目录不在 Steam 创意工坊中')
    output=Path(args.output).resolve()
    if not output.is_relative_to(Path(settings['themeRoot']).resolve()/'media') or not output.is_dir():raise ValueError('输出目录无效')
    project=read_project(folder);kind=str(project.get('type','')).lower()
    if kind not in ('video','scene','web'):raise ValueError('暂支持视频、场景和网页壁纸；程序型壁纸不能导入')
    movie=output/'wallpaper.mp4';poster=output/'poster.jpg'
    if kind=='video':
        source=contained(folder,project.get('file'))
        if not source.is_file():raise ValueError('壁纸视频尚未下载完整')
        seconds=video(settings['ffmpeg'],source,movie)
        cap=cv2.VideoCapture(str(movie));cap.set(cv2.CAP_PROP_POS_MSEC,min(5000,seconds*250));ok,frame=cap.read();cap.release()
        if not ok:raise RuntimeError('无法生成壁纸预览')
        if not write_image(poster,frame):raise RuntimeError('无法保存壁纸预览')
    else:seconds=capture(settings,folder,movie,poster,args.id)
    frame=read_image(poster)
    if frame is None:raise RuntimeError('无法读取壁纸取色画面')
    cap=cv2.VideoCapture(str(movie));ok,first=cap.read();width=int(cap.get(3));height=int(cap.get(4));cap.release()
    if not ok or movie.stat().st_size<1024:raise RuntimeError('生成的壁纸视频不可用')
    if frame.std()<1:raise RuntimeError('壁纸画面为空，请确认它能在 Wallpaper Engine 正常播放')
    result=dict(title=str(project.get('title') or 'Steam 壁纸 '+args.id)[:100],type='video',file='wallpaper.mp4',poster='poster.jpg',preset=recommend(frame),seconds=seconds,width=width,height=height,windowOnly=kind!='video',sourceType=kind)
    (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    emit(phase='ready',message='壁纸与推荐配色已准备好',percent=95,result=True)

if __name__=='__main__':
    try:main()
    except Exception as error:
        emit(error=str(error));sys.exit(1)
