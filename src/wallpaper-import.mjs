import fs from 'node:fs/promises';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);
const numeric=id=>typeof id==='string'&&/^[1-9]\d{4,19}$/.test(id);
const aborted=signal=>{if(signal?.aborted)throw new Error('已取消导入');};
const exists=file=>fs.access(file).then(()=>true,()=>false);
export function parseSteamLinks(raw){
 if(typeof raw!=='string'||!raw.trim()||raw.length>12000)throw Error('请粘贴 Steam 创意工坊壁纸链接');
 const input=raw.trim().replace(/\\:/g,':').replace(/\\\//g,'/');
 if(numeric(input))return [input];
 const tokens=input.replace(/(?=https?:\/\/|steam:\/\/)/gi,'\n').split(/[\s,，;；<>]+/).filter(Boolean);
 const ids=[];
 for(let token of tokens){
  token=token.replace(/^[([]+/,'').replace(/[)\].。]+$/,'');
  let url;try{url=new URL(token);}catch{throw Error('链接格式不正确，请粘贴完整的 Steam 创意工坊链接');}
  if(url.username||url.password||url.port)throw Error('请使用 steamcommunity.com 的原始壁纸链接');
  let id;
  if(['https:','http:'].includes(url.protocol)&&url.hostname.toLowerCase()==='steamcommunity.com'&&/^\/(sharedfiles|workshop)\/filedetails\/?$/.test(url.pathname)){
   if(url.searchParams.getAll('id').length!==1)throw Error('每个链接需要一个有效的壁纸编号');
   id=url.searchParams.get('id');
  }else if(url.protocol==='steam:'&&url.hostname==='url'&&/^\/CommunityFilePage\/\d+\/?$/i.test(url.pathname))id=url.pathname.split('/')[2];
  if(!numeric(id))throw Error('仅支持 Steam 创意工坊壁纸链接，例如 steamcommunity.com/sharedfiles/filedetails/?id=1234567890');
  if(!ids.includes(id))ids.push(id);
 }
 if(!ids.length||ids.length>10)throw Error('一次可导入 1～10 个壁纸链接');
 return ids;
}
function child(exe,args,{signal,onData,cwd,timeout=330000}={}){
 return new Promise((resolve,reject)=>{
  aborted(signal);
  const p=spawn(exe,args,{cwd,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  let pending='',last={},error='',settled=false,killTimer;
  const timer=setTimeout(()=>{p.kill();finish(Error('壁纸处理超时，请重试或选择较小的壁纸'));},timeout);
  function finish(failure){
   if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',cancel);
   failure?reject(failure):resolve(last);
  }
  function cancel(){
   p.stdin.write('cancel\n',()=>{});
   killTimer=setTimeout(()=>p.kill(),4000);
  }
  signal?.addEventListener('abort',cancel,{once:true});
  p.stdin.on('error',()=>{});
  p.stdout.on('data',chunk=>{
   pending+=chunk.toString('utf8');
   if(pending.length>65536)pending=pending.slice(-8192);
   let end;while((end=pending.indexOf('\n'))>=0){
    const line=pending.slice(0,end).trim();pending=pending.slice(end+1);
    try{const value=JSON.parse(line);last={...last,...value};onData?.(value);}catch{}
   }
  });
  p.stderr.on('data',chunk=>{error=(error+chunk.toString('utf8')).slice(-4000);});
  p.on('error',()=>finish(Error('无法启动壁纸处理工具，请检查本机安装')));
  p.on('close',code=>finish(signal?.aborted?Error('已取消导入'):code?Error(last.error||'壁纸处理失败，请确认源文件已完整下载'):null));
 });
}
async function metadata(id,signal){
 const body=new URLSearchParams({itemcount:'1','publishedfileids[0]':id});
 let response;
 try{
  response=await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',{method:'POST',body,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
 }catch{aborted(signal);throw Error('暂时无法连接 Steam；已下载的壁纸仍可导入，新壁纸请稍后重试');}
 if(!response.ok)throw Error('Steam 服务暂时不可用，请稍后重试');
 const data=(await response.json()).response?.publishedfiledetails?.[0];
 if(!data||data.result!==1)throw Error('无法访问该作品，它可能已删除、设为私密或需要登录订阅');
 if(Number(data.consumer_app_id)!==431960)throw Error('这个链接不是 Wallpaper Engine 壁纸');
 return {title:String(data.title??'Steam 壁纸 '+id).slice(0,100)};
}
async function sourceFolder(settings,id){
 for(const root of settings.workshopRoots){
  const folder=path.resolve(root,id);
  if(await exists(path.join(folder,'project.json'))){
   const real=await fs.realpath(folder),allowed=await fs.realpath(root);
   if(path.dirname(real).toLowerCase()===allowed.toLowerCase())return real;
  }
 }
 return null;
}
function safeResult(result){
 if(!result||result.type!=='video'||result.file!=='wallpaper.mp4'||result.poster!=='poster.jpg'||typeof result.title!=='string')throw Error('壁纸处理结果无效');
 const p=result.preset,v=p?.value;
 if(typeof p?.name!=='string'||p.name.length>40||!v||!/^#[0-9a-f]{6}$/.test(v.base)||!/^#[0-9a-f]{6}$/.test(v.accent)||!/^#[0-9a-f]{6}$/.test(v.text))throw Error('推荐配色生成失败');
 for(const [key,max] of Object.entries({panelTransparency:100,maskStrength:100,blur:24}))if(!Number.isInteger(v[key])||v[key]<0||v[key]>max)throw Error('推荐配色数值无效');
 return result;
}
export function createImporter({root,getVariants,getRecommended,commit,fetchMetadata=metadata}){
 let controller=null,job=null;
 let status={state:'idle',message:'粘贴 Steam 壁纸链接，即可加入主题库',results:[],errors:[]};
 const statusFile=path.join(root,'import-status.json');
 let statusWrites=Promise.resolve();
 function update(patch){
  status={...status,...patch,updatedAt:new Date().toISOString()};
  const snapshot=JSON.stringify(status,null,2);
  statusWrites=statusWrites.catch(()=>{}).then(()=>fs.writeFile(statusFile+'.tmp',snapshot,'utf8')).then(()=>fs.rename(statusFile+'.tmp',statusFile)).catch(()=>{});
 }
 async function importOne(id,options,settings,signal){
  aborted(signal);
  const existing=Object.entries(getVariants()).find(([_,v])=>v.workshopId===id);
  if(existing&&await exists(path.join(root,existing[1].file))){
   const preset=(await getRecommended())[existing[0]];
   await commit({id:existing[0],item:existing[1],preset,...options,existing:true});
   return {id:existing[0],workshopId:id,title:existing[1].name,existing:true};
  }
  update({phase:'checking',message:'正在查找已下载的壁纸…',percent:2,workshopId:id,steamLink:null});
  if(!settings.engine||!await exists(settings.engine))throw Error('导入新的 Steam 壁纸需要本机安装 Wallpaper Engine；内置壁纸可直接使用。');
  let folder=await sourceFolder(settings,id);
  if(!folder){
   const detail=await fetchMetadata(id,signal);update({title:detail.title,phase:'downloading',message:'正在交给 Steam 下载…',percent:0});
   const downloaded=await child(settings.python,['-B',path.join(root,'steam-download.py'),'--settings',path.join(root,'import-settings.json'),'--id',id],{
    signal,cwd:root,onData:data=>{if(data.message)update({message:data.message,percent:data.percent??null});}
   });
   aborted(signal);folder=await sourceFolder(settings,id);
   if(!folder){
    update({phase:'waiting-steam',percent:null,message:'请点击“在 Steam 中打开”，订阅并下载该壁纸；下载完成后会自动继续。',steamLink:'steam://url/CommunityFilePage/'+id});
    const end=Date.now()+10*60*1000;
    while(!folder&&Date.now()<end){aborted(signal);await new Promise(resolve=>setTimeout(resolve,800));folder=await sourceFolder(settings,id);}
    if(!folder)throw Error('等待下载超时；在 Steam 下载完成后重新导入即可');
   }
  }
  const stat=await fs.stat(path.join(folder,'project.json'));
  if(stat.size>2*1024*1024)throw Error('壁纸描述文件过大');
  const project=JSON.parse((await fs.readFile(path.join(folder,'project.json'),'utf8')).replace(/^\uFEFF/,''));
  if(project.workshopid&&String(project.workshopid)!==id)throw Error('壁纸编号与本地文件不一致');
  const kind=String(project.type??'').toLowerCase();
  if(!['scene','video','web'].includes(kind))throw Error('暂支持视频、场景和网页壁纸；程序型壁纸不能导入');
  update({title:String(project.title??'Steam 壁纸 '+id).slice(0,100),steamLink:null});
  if(!await exists(settings.ffmpeg)){
   update({phase:'tools',message:'正在准备首次导入工具（仅首次需要联网）…',percent:null});
   try{await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'Ensure-ImportTools.ps1')],{windowsHide:true,timeout:210000,signal});}
   catch{aborted(signal);throw Error('首次导入工具尚未下载完成，请联网后重试；已装入的壁纸不受影响。');}
   aborted(signal);
  }
  const stage=await fs.mkdtemp(path.join(root,'media','.import-'+id+'-'));
  try{
   await child(settings.python,['-B',path.join(root,'wallpaper-worker.py'),'--settings',path.join(root,'import-settings.json'),'--folder',folder,'--output',stage,'--id',id],{
    signal,cwd:root,onData:data=>{if(data.message)update({phase:data.phase,message:data.message,percent:data.percent??null});}
   });
   aborted(signal);
   const result=safeResult(JSON.parse(await fs.readFile(path.join(stage,'result.json'),'utf8')));
   const stamp=Date.now().toString(36),name=`w${id}-${stamp}`;
   const movie=path.join('media',name+'.mp4'),poster=path.join('media',name+'.jpg');
   const item={name:result.title,type:'video',file:movie.replaceAll('\\','/'),poster:poster.replaceAll('\\','/'),workshopId:id,sourceType:kind,importedAt:new Date().toISOString()};
   await fs.rename(path.join(stage,'wallpaper.mp4'),path.join(root,movie));
   await fs.rename(path.join(stage,'poster.jpg'),path.join(root,poster));
   try{aborted(signal);await commit({id:'w'+id,item,preset:result.preset,...options,existing:false});}
   catch(error){await fs.rm(path.join(root,movie),{force:true});await fs.rm(path.join(root,poster),{force:true});throw error;}
   return {id:'w'+id,workshopId:id,title:result.title,existing:false,sourceType:kind};
  }finally{
   // Close only this job's named wallpaper window, including after hard cancellation.
   if(kind!=='video')await execFileAsync(settings.engine,['-control','closeWallpaper','-location','Emilia Import '+id],{windowsHide:true,timeout:15000}).catch(()=>{});
   const absolute=path.resolve(stage),media=path.resolve(root,'media');
   if(path.dirname(absolute)===media&&path.basename(absolute).startsWith('.import-'+id+'-'))await fs.rm(absolute,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{});
  }
 }
 async function run(ids,options,signal){
  try{
   if(existsSync(path.join(root,'Configure-Environment.ps1')))await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'Configure-Environment.ps1')],{windowsHide:true,timeout:20000,signal});
   const settings=JSON.parse((await fs.readFile(path.join(root,'import-settings.json'),'utf8')).replace(/^\uFEFF/,''));
   if(path.resolve(settings.themeRoot).toLowerCase()!==path.resolve(root).toLowerCase())throw Error('壁纸导入配置目录无效');
   for(let i=0;i<ids.length;i++){
    aborted(signal);update({index:i+1,total:ids.length,workshopId:ids[i],title:'',percent:0,steamLink:null});
    try{const result=await importOne(ids[i],options,settings,signal);update({results:[...status.results,result]});}
    catch(error){aborted(signal);update({errors:[...status.errors,{workshopId:ids[i],message:error.message}]});}
   }
   const count=status.results.length,failed=status.errors.length;
   update({state:count?(failed?'partial':'done'):'error',phase:'finished',percent:100,steamLink:null,message:count?`已导入 ${count} 张壁纸${options.activate?'，已切换到最后一张':''}${options.applyRecommended?'并应用推荐配色':''}${failed?`；${failed} 张未成功，见下方原因`:''}`:(status.errors[0]?.message??'导入失败，请重试')});
  }catch(error){update({state:signal.aborted?'cancelled':'error',phase:'finished',steamLink:null,percent:null,message:error.message});}
  finally{controller=null;}
 }
 return {
  getStatus:()=>({...status}),
  start(request){
   if(controller)throw Error('已有导入正在进行，请等待完成或先取消');
   if(!request||typeof request!=='object'||typeof request.requestId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(request.requestId))throw Error('导入请求无效');
   const ids=parseSteamLinks(request.links);
   controller=new AbortController();
   update({state:'running',phase:'checking',requestId:request.requestId,results:[],errors:[],index:0,total:ids.length,percent:0,message:'正在准备导入…',steamLink:null});
   job=run(ids,{applyRecommended:request.applyRecommended!==false,activate:request.activate!==false},controller.signal);
   return status;
  },
  cancel(){controller?.abort();},
  reportError(message,requestId){if(!controller)update({state:'error',phase:'finished',requestId,percent:null,message,errors:[],results:[],steamLink:null});},
  async wait(){await job;await statusWrites;return status;},
  async openSteam(){
   if(status.state!=='running'||!numeric(status.workshopId))return;
   const uri='steam://url/CommunityFilePage/'+status.workshopId;
   // A reconstructed numeric Steam URI, never a command supplied by the page.
   await execFileAsync('explorer.exe',[uri],{windowsHide:true,timeout:15000}).catch(()=>{});
  }
 };
}
