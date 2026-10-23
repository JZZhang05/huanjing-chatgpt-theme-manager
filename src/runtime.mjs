import fs from 'node:fs/promises';
import {createImporter} from './wallpaper-import.mjs';
import {execFileSync} from 'node:child_process';
import {AssetCache} from './asset-cache.mjs';
import {themeSkipReason} from './theme-scope.mjs';
const assetCache=new AssetCache(64*1024*1024);
let selectionQueue=Promise.resolve();
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 9387, BASE = `http://127.0.0.1:${PORT}`;
const STATE = path.join(ROOT, 'state.json');
const STOP = path.join(ROOT, 'stop.flag');
const CONFIG = path.join(ROOT, 'background.json');
const APPEARANCE = path.join(ROOT, 'appearance.json');
const CUSTOM=path.join(ROOT,'customization.json');
const RECOMMENDED=path.join(ROOT,'recommended.json');
const LIBRARY=path.join(ROOT,'wallpaper-library.json');
let libraryStatus=null;
const builtins = {
  system:{name:'系统默认',type:'native'},
  original: {name: '月下爱蜜莉雅 · 静态插画', type: 'image', file: 'background.png'},
  emilia: {name: '动态爱蜜莉雅', type: 'video', file: 'media/emilia-loop.mp4', workshopId: '3748398863'},
  rem: {name: '动态蕾姆', type: 'video', file: 'media/rem-loop.mp4', workshopId: '3421437923'},
};
// Legacy installations keep their existing videos; public packages do not redistribute them.
for(const id of ['emilia','rem']){
 try{await fs.access(path.join(ROOT,builtins[id].file));}catch{delete builtins[id];}
}
const allVariants={...builtins},variants={...builtins},assets={};
let removedIds=new Set();
let catalogStamp;
async function refreshCatalog(){
 const stat=await fs.stat(path.join(ROOT,'catalog.json'));
 const libraryStat=await fs.stat(LIBRARY).catch(()=>({mtimeMs:0,size:0}));
 const stamp=`${stat.mtimeMs}:${stat.size}:${libraryStat.mtimeMs}:${libraryStat.size}`;
 if(stamp===catalogStamp)return;
 const catalog=JSON.parse(await fs.readFile(path.join(ROOT,'catalog.json'),'utf8'));
 const checked={};
 for(const [id,item] of Object.entries(catalog)){
  if(!/^w[1-9]\d{4,19}$/.test(id)||typeof item.name!=='string'||item.name.length>100||!['video','image'].includes(item.type))throw Error('壁纸目录格式无效');
  for(const field of ['file','poster'])if(item[field]!==undefined&&!/^media\/[a-zA-Z0-9_-]+\.(mp4|jpg|jpeg|png|webp)$/.test(item[field]))throw Error('壁纸文件路径无效');
  if(typeof item.file!=='string')throw Error('壁纸文件缺失');
  checked[id]=item;
 }
 const library=await readLibrary();removedIds=new Set(library.removed);
 for(const id of Object.keys(allVariants))delete allVariants[id];Object.assign(allVariants,builtins,checked);
 for(const id of Object.keys(variants))delete variants[id];
 for(const [id,item] of Object.entries(allVariants))if(id==='system'||!removedIds.has(id))variants[id]=item;
 for(const id of Object.keys(assets))delete assets[id];
 const mime=file=>file.endsWith('.mp4')?'video/mp4':file.endsWith('.png')?'image/png':file.endsWith('.webp')?'image/webp':'image/jpeg';
 for(const [id,item] of Object.entries(variants)){
  if(item.type==='native')continue;
  assets[id]={file:item.file,mime:mime(item.file)};
  if(item.poster)assets[id+'-poster']={file:item.poster,mime:mime(item.poster)};
 }
 catalogStamp=stamp;
}
async function readLibrary(){
 let text;try{text=await fs.readFile(LIBRARY,'utf8');}catch(error){if(error.code==='ENOENT')return {version:1,removed:[]};throw error;}
 const raw=JSON.parse(text);
 if(raw.version!==1||!Array.isArray(raw.removed))throw Error('壁纸列表记录无效');
 return {version:1,removed:[...new Set(raw.removed.filter(id=>typeof id==='string'&&/^(original|emilia|rem|w[1-9]\d{4,19})$/.test(id)))]};
}
async function writeLibrary(removed){
 await fs.writeFile(LIBRARY+'.tmp',JSON.stringify({version:1,removed:[...new Set(removed)]},null,2),'utf8');
 await fs.rename(LIBRARY+'.tmp',LIBRARY);
}
async function manageWallpaper(raw){
 if(typeof raw!=='string'||raw.length>1024)throw Error('壁纸操作无效');
 const request=JSON.parse(raw);
 if(request.action==='dismiss'){libraryStatus=null;return;}
 await refreshCatalog();
 const {id,action}=request;
 if(!Object.hasOwn(allVariants,id)||id==='system'||!['delete','restore'].includes(action))throw Error('请选择列表中的壁纸');
 const item=allVariants[id],library=await readLibrary();
 if(action==='delete'&&library.removed.includes(id))return;
 const current=JSON.parse(await fs.readFile(CONFIG,'utf8')).variant;
 if(action==='delete'){
  if(current===id)await selectVariant('system');
  await writeLibrary([...library.removed,id]);
  await refreshCatalog();
  libraryStatus={action:'deleted',id,name:item.name,wasCurrent:current===id,message:'已删除「'+item.name+'」',changedAt:Date.now()};
 }else{
  await writeLibrary(library.removed.filter(value=>value!==id));
  await refreshCatalog();
  if(request.activate===true)await selectVariant(id);
  libraryStatus={action:'restored',id,name:item.name,message:'已恢复「'+item.name+'」',changedAt:Date.now()};
 }
}
await refreshCatalog();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const exists = name => fs.access(name).then(() => true, () => false);
async function save(name, value) {
  await fs.writeFile(path.join(ROOT, name), JSON.stringify(value, null, 2), 'utf8');
}
async function json(route) {
  const response = await fetch(BASE + route, {signal: AbortSignal.timeout(2500)});
  if (!response.ok) throw Error(`本机连接 ${response.status}`);
  return response.json();
}
function urlFor(raw, type) {
  const url = new URL(raw);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || Number(url.port) !== PORT ||
      url.username || url.password || url.search || url.hash || !url.pathname.startsWith(`/devtools/${type}/`)) {
    throw Error('拒绝不符合本机连接要求的地址');
  }
  return url.href;
}
async function identity() {
  return urlFor((await json('/json/version')).webSocketDebuggerUrl, 'browser');
}
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if(message.method==='Runtime.bindingCalled'&&message.params?.name==='__emiliaLibrary')this.onLibrary?.(message.params.payload);
      if(message.method==='Runtime.bindingCalled'&&message.params?.name==='__emiliaImport')this.onImport?.(message.params.payload);
      if(message.method==='Runtime.bindingCalled'&&message.params?.name==='__emiliaChoose')this.onChoice?.(message.params.payload);
      if(message.method==='Runtime.bindingCalled'&&message.params?.name==='__emiliaRequestAsset')this.onAsset?.(message.params);
      if(message.method==='Runtime.bindingCalled'&&message.params?.name==='__emiliaCustomize')this.onCustomization?.(message.params.payload);
      if(message.method==='Runtime.bindingCalled'&&message.params?.name==='__emiliaAppearance')this.onAppearance?.(message.params.payload);
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        message.error ? pending.reject(Error(message.error.message)) : pending.resolve(message.result);
      }
    });
    ws.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(Error('连接关闭'));
      }
      this.pending.clear();
    });
  }
  static async connect(target) {
    const address = urlFor(target.webSocketDebuggerUrl, 'page');
    if (!new URL(address).pathname.endsWith('/' + target.id)) throw Error('页面身份不符');
    const ws = new WebSocket(address);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {ws.close(); reject(Error('连接超时'));}, 4000);
      ws.addEventListener('open', () => {clearTimeout(timer); resolve();}, {once: true});
      ws.addEventListener('error', () => {clearTimeout(timer); reject(Error('本机 WebSocket 无法连接'));}, {once: true});
    });
    const client = new CDP(ws);
    await client.send('Page.enable');
    return client;
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => {this.pending.delete(id); reject(Error(`操作超时：${method}`));}, 15000);
      this.pending.set(id, {resolve, reject, timer});
      this.ws.send(JSON.stringify({id, method, params}));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result?.value;
  }
  close() {this.ws.close();}
}
async function targets() {
  return (await json('/json/list')).filter(target => target.type === 'page' && /^app:\/\//.test(target.url) && typeof target.id === 'string');
}

async function selectedVariant(override) {
  await refreshCatalog();
  const id = override ?? JSON.parse(await fs.readFile(CONFIG, 'utf8').catch(() => '{"variant":"original"}')).variant;
  if (!Object.hasOwn(variants, id)) throw Error('未知背景选项，请从主题列表重新选择');
  if (variants[id].type!=='native'&&!await exists(path.join(ROOT, variants[id].file))) throw Error('所选背景文件不存在，原图片仍保留');
  return {id, ...variants[id]};
}
async function selectVariant(id) {
  await selectedVariant(id);
  const temporary = CONFIG + '.tmp';
  await fs.writeFile(temporary, JSON.stringify({variant: id}, null, 2), 'utf8');
  await fs.rename(temporary, CONFIG);
  console.log(`已选择：${variants[id].name}`);
}
async function selectedAppearance() {
  const config=JSON.parse(await fs.readFile(APPEARANCE,'utf8').catch(()=>'{"mode":"light"}'));
  if(config.mode!=='light'&&config.mode!=='dark')throw Error('未知配色模式');
  return config.mode;
}
async function selectAppearance(mode) {
  if(mode!=='light'&&mode!=='dark')throw Error('未知配色模式');
  await fs.writeFile(APPEARANCE+'.tmp',JSON.stringify({mode},null,2),'utf8');
  await fs.rename(APPEARANCE+'.tmp',APPEARANCE);
}
function validTuning(value){
 if(!value||typeof value!=='object')throw Error('配色参数无效');
 const hex=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
 if(!hex(value.base)||!hex(value.accent)||(value.text!=='auto'&&!hex(value.text)))throw Error('颜色格式无效');
 const number=(key,max)=>{const v=value[key];if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max)throw Error('调节数值无效');return Math.round(v);};
 return {base:value.base.toLowerCase(),accent:value.accent.toLowerCase(),text:value.text==='auto'?'auto':value.text.toLowerCase(),panelTransparency:number('panelTransparency',100),maskStrength:number('maskStrength',100),blur:number('blur',24)};
}
async function readRecommended(){
 const raw=JSON.parse(await fs.readFile(RECOMMENDED,'utf8'));
 const result={};
 for(const [id,item] of Object.entries(raw)){
  if(!Object.hasOwn(allVariants,id)||allVariants[id].type==='native')continue;
  if(typeof item.name!=='string'||item.name.length>40)throw Error('推荐配色名称无效');
  result[id]={name:item.name,value:validTuning(item.value)};
 }
 return result;
}
async function readTuning(){
 const raw=JSON.parse(await fs.readFile(CUSTOM,'utf8').catch(()=>'{"version":1,"themes":{}}'));
 const result={version:1,themes:{}};
 for(const [id,value] of Object.entries(raw.themes??{}))if(Object.hasOwn(allVariants,id)&&allVariants[id].type!=='native'){try{result.themes[id]=validTuning(value);}catch{}}
 return result;
}
async function customize(raw){
 if(typeof raw!=='string'||raw.length>4096)throw Error('配色参数无效');
 const request=JSON.parse(raw),id=request.id;
 if(!Object.hasOwn(variants,id)||variants[id].type==='native')throw Error('未知壁纸');
 const all=await readTuning();
 if(request.value===null)delete all.themes[id];else all.themes[id]=validTuning(request.value);
 await fs.writeFile(CUSTOM+'.tmp',JSON.stringify(all,null,2),'utf8');await fs.rename(CUSTOM+'.tmp',CUSTOM);
}
const removeSource = `(() => {
  const root=document.documentElement;
  root?.removeAttribute('data-emilia-theme');
  root?.removeAttribute('data-emilia-background');
  root?.removeAttribute('data-emilia-mode');root?.removeAttribute('data-emilia-custom');
  const video=document.querySelector('#emilia-wallpaper video');
  if(video){video.pause();video.removeAttribute('src');video.load();}
  if(window.__emiliaVisibilityHandler){document.removeEventListener('visibilitychange',window.__emiliaVisibilityHandler);delete window.__emiliaVisibilityHandler;}
  document.getElementById('emilia-theme-controls')?.remove();
  document.getElementById('emilia-wallpaper')?.remove();
  document.getElementById('emilia-style')?.remove();
  document.getElementById('emilia-controls-style')?.remove();document.getElementById('emilia-custom-style')?.remove();
  for(const url of Object.values(window.__emiliaAssets??{}))URL.revokeObjectURL(url);delete window.__emiliaAssets;
  window.__emiliaImageReady=false;
  return {removed:!document.getElementById('emilia-style')&&!document.getElementById('emilia-wallpaper')};
})()`;
const probeSource = `(() => {
  const wall=document.getElementById('emilia-wallpaper'),video=wall?.querySelector('video'),image=wall?.querySelector('img');
  const main=document.querySelector('main'),body=document.body;
  return {
    nativeDefault:document.documentElement.dataset.emiliaBackground==='system'&&!wall&&!document.getElementById('emilia-style')&&!document.documentElement.hasAttribute('data-emilia-theme'),
    applied:document.documentElement.dataset.emiliaTheme==='on'&&!!wall&&!!document.getElementById('emilia-style'),
    mode:document.documentElement.dataset.emiliaMode,variant:wall?.dataset.variant,mediaType:video?'video':'image',
    backgroundLoaded:video?video.readyState>=2&&video.videoWidth>0:!!image&&image.complete&&image.naturalWidth>0,
    mediaPlaying:video?!video.paused&&!video.ended:null,mediaTime:video?.currentTime??null,
    mediaWidth:video?.videoWidth??image?.naturalWidth,mediaHeight:video?.videoHeight??image?.naturalHeight,
    mediaError:video?.error?.code??null,pointerSafe:!!wall&&getComputedStyle(wall).pointerEvents==='none',
    expectedVideo:!!wall&&wall.dataset.mediaType==='video'&&!!main&&document.querySelectorAll('button,textarea,[contenteditable=true]').length>20,
    mainPresent:!!main,rootPresent:!!document.querySelector('#root'),
    mainVisible:!!main&&main.getBoundingClientRect().width>0&&main.getBoundingClientRect().height>0,
    bodyWidth:body?.scrollWidth,viewport:innerWidth,horizontalOverflow:(body?.scrollWidth??0)>innerWidth+3,
    interactiveControls:document.querySelectorAll('button,textarea,[contenteditable=true]').length
  };
})()`;
async function makePayload(override) {
  const selection = await selectedVariant(override);
  const scopeCheck='('+themeSkipReason.toString()+')(location.href)';
  const scopeGuard='if('+scopeCheck+'){'+removeSource+';return {skipped:true,reason:'+scopeCheck+'};}';
  const css = await fs.readFile(path.join(ROOT, 'theme.css'), 'utf8');
  const original=selection.type==='image'?selection.id:selection.poster?selection.id+'-poster':'original';
  const video=selection.type==='video'?selection.id:null;
  const ui=await fs.readFile(path.join(ROOT,'ui.js'),'utf8');
  const appearance=await selectedAppearance();
  const controls=await fs.readFile(path.join(ROOT,'controls.css'),'utf8');
  const tuning=await readTuning();
  const recommended=await readRecommended();
  const tuningEngine=await fs.readFile(path.join(ROOT,'tuning-engine.js'),'utf8');
  const tuningCss=await fs.readFile(path.join(ROOT,'custom.css'),'utf8');
  const choices=Object.entries(variants).map(([id,item])=>({id,name:item.name}));
  const removed=Object.entries(allVariants).filter(([id])=>removedIds.has(id)).map(([id,item])=>({id,name:item.name}));
  const menuSetup=`window.__emiliaLibraryStatus=${JSON.stringify(libraryStatus)};window.__emiliaRemoved=${JSON.stringify(removed)};window.__emiliaImportStatus=${JSON.stringify(importer.getStatus())};window.__emiliaRecommended=${JSON.stringify(recommended[selection.id]??null)};window.__emiliaVariants=${JSON.stringify(choices)};let menuStyle=document.getElementById('emilia-controls-style');if(!menuStyle){menuStyle=document.createElement('style');menuStyle.id='emilia-controls-style';document.head.append(menuStyle);}menuStyle.textContent=${JSON.stringify(controls)};`;
  if(selection.type==='native')return `(()=>{
   ${scopeGuard}
   function apply(){${scopeGuard}if(!document.body)return;
    const root=document.documentElement;root.removeAttribute('data-emilia-theme');root.removeAttribute('data-emilia-mode');root.removeAttribute('data-emilia-custom');root.dataset.emiliaBackground='system';
    const media=document.querySelector('#emilia-wallpaper video');if(media){media.pause();media.removeAttribute('src');media.load();}
    document.getElementById('emilia-wallpaper')?.remove();document.getElementById('emilia-style')?.remove();document.getElementById('emilia-custom-style')?.remove();
    if(window.__emiliaVisibilityHandler){document.removeEventListener('visibilitychange',window.__emiliaVisibilityHandler);delete window.__emiliaVisibilityHandler;}
    for(const url of Object.values(window.__emiliaAssets??{}))URL.revokeObjectURL(url);delete window.__emiliaAssets;window.__emiliaImageReady=false;
    ${menuSetup}
    ${ui}
   }
   if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
   return {loaded:true,variant:'system'};
  })()`;
  return `(() => {
    ${scopeGuard}
    const css=${JSON.stringify(css)},art=${JSON.stringify(original)},source=${JSON.stringify(video)},variant=${JSON.stringify(selection.id)};
    const ui=${JSON.stringify(ui)};
    function apply(){
      ${scopeGuard}
      if(!document.body)return;
      document.documentElement.dataset.emiliaTheme='on';
      document.documentElement.dataset.emiliaBackground=variant;
      document.documentElement.dataset.emiliaMode=${JSON.stringify(appearance)};
      let style=document.getElementById('emilia-style');
      if(!style){style=document.createElement('style');style.id='emilia-style';document.head.append(style);}
      style.textContent=css;
      let wall=document.getElementById('emilia-wallpaper');
      if(!wall){wall=document.createElement('div');wall.id='emilia-wallpaper';wall.setAttribute('aria-hidden','true');document.body.prepend(wall);}
      wall.dataset.mediaType=${JSON.stringify(selection.type)};
      let image=wall.querySelector('img');
      if(!image){image=document.createElement('img');image.alt='';wall.append(image);}
      if(image.dataset.emiliaAsset!==art){image.onload=()=>{window.__emiliaImageReady=true;};image.dataset.emiliaAsset=art;image.removeAttribute('src');if(window.__emiliaAssets?.[art])image.src=window.__emiliaAssets[art];else window.__emiliaRequestAsset?.(art);}
      let media=wall.querySelector('video');
      if(wall.dataset.variant!==variant){
        if(media){media.pause();media.removeAttribute('src');media.load();media.remove();media=null;}
        for(const [id,url] of Object.entries(window.__emiliaAssets??{})){
          if(id!==art&&id!==source){URL.revokeObjectURL(url);delete window.__emiliaAssets[id];}
        }
        wall.dataset.variant=variant;
      }
      const animate=!!source&&!!document.querySelector('main')&&document.querySelectorAll('button,textarea,[contenteditable=true]').length>20;
      if(!animate&&media){media.pause();media.removeAttribute('src');media.load();media.remove();media=null;}
      if(animate&&!media){
        media=document.createElement('video');
        media.muted=true;media.defaultMuted=true;media.loop=true;media.autoplay=true;media.playsInline=true;
        media.preload='auto';media.disablePictureInPicture=true;media.tabIndex=-1;
        media.setAttribute('aria-hidden','true');media.setAttribute('muted','');media.setAttribute('playsinline','');
        media.dataset.emiliaAsset=source;wall.append(media);if(window.__emiliaAssets?.[source]){media.src=window.__emiliaAssets[source];media.play().catch(()=>{});}else window.__emiliaRequestAsset?.(source);
      }
      if(window.__emiliaVisibilityHandler)document.removeEventListener('visibilitychange',window.__emiliaVisibilityHandler);
      window.__emiliaVisibilityHandler=()=>{const current=document.querySelector('#emilia-wallpaper video');if(!current)return;if(document.hidden)current.pause();else current.play().catch(()=>{});};
      document.addEventListener('visibilitychange',window.__emiliaVisibilityHandler);
      if(media&&!document.hidden)media.play().catch(()=>{});
      if(image.complete&&image.naturalWidth>0)window.__emiliaImageReady=true;
      window.__emiliaTuningSaved=${JSON.stringify(tuning.themes[selection.id]??null)};
      window.__emiliaTuningCss=${JSON.stringify(tuningCss)};
      ${tuningEngine}
      ${menuSetup}
      ${ui}
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
    return {loaded:true,variant};
  })()`;
}
const importer=createImporter({
 root:ROOT,getVariants:()=>allVariants,getRecommended:readRecommended,
 commit:change=>{
  selectionQueue=selectionQueue.catch(()=>{}).then(async()=>{
   const {id,item,preset,existing,applyRecommended,activate}=change;
   if(!existing){
    const catalog=JSON.parse(await fs.readFile(path.join(ROOT,'catalog.json'),'utf8'));
    catalog[id]=item;
    await fs.writeFile(path.join(ROOT,'catalog.json.tmp'),JSON.stringify(catalog,null,2),'utf8');await fs.rename(path.join(ROOT,'catalog.json.tmp'),path.join(ROOT,'catalog.json'));
   }
   if(preset){
    const recommended=JSON.parse(await fs.readFile(RECOMMENDED,'utf8'));
    recommended[id]={name:preset.name,value:validTuning(preset.value)};
    await fs.writeFile(RECOMMENDED+'.tmp',JSON.stringify(recommended,null,2),'utf8');await fs.rename(RECOMMENDED+'.tmp',RECOMMENDED);
   }
   const library=await readLibrary();if(library.removed.includes(id))await writeLibrary(library.removed.filter(value=>value!==id));
   await refreshCatalog();
   if(applyRecommended&&preset)await customize(JSON.stringify({id,value:preset.value}));
   if(activate)await selectVariant(id);
  });
  return selectionQueue;
 }
});
async function restore(state) {
  if (!state?.browserId) return;
  let live;
  try {live = await identity();} catch {return;}
  if (live !== state.browserId) throw Error('客户端已换成另一个会话，停止恢复操作');
  for (const target of await targets()) {
    let client;
    try {
      client = await CDP.connect(target);
      for (const identifier of state.scripts?.[target.id] ?? []) await client.send('Page.removeScriptToEvaluateOnNewDocument', {identifier}).catch(() => {});
      await client.evaluate(removeSource);
    } finally {client?.close();}
  }
}
async function watch(expectedBrowser) {
  if (await identity() !== expectedBrowser) throw Error('客户端身份不符');
  const state = {browserId: expectedBrowser, port: PORT, pid: process.pid, scripts: {}, startedAt: new Date().toISOString()};
  const previous=JSON.parse(await fs.readFile(STATE,'utf8').catch(()=>'{}'));if(previous.browserId===expectedBrowser)state.scripts=previous.scripts??{};
  await fs.rm(STOP, {force: true});
  await save('state.json', state);
  await save('worker-status.json', {running: true, startedAt: state.startedAt, pid: process.pid});
  const sessions = new Map();
  let fingerprint, payload, currentVariant, failure, firstFrameMs, lastReportAt=0, lastReportKey;const startup=performance.now();
  try {
    while (!await exists(STOP)) {
      if (await identity() !== expectedBrowser) break;
      const selection = await selectedVariant();
      const cssStat = await fs.stat(path.join(ROOT, 'theme.css'));
      const appearance=await selectedAppearance();
      const uiStat=await fs.stat(path.join(ROOT,'ui.js'));
      const componentStats=await Promise.all(['custom.css','tuning-engine.js','controls.css'].map(file=>fs.stat(path.join(ROOT,file))));
      const appearanceStat=await fs.stat(APPEARANCE).catch(()=>({mtimeMs:0}));
      const configStat=await fs.stat(CONFIG);
      const tuningStat=await fs.stat(CUSTOM).catch(()=>({mtimeMs:0}));
      const recommendedStat=await fs.stat(RECOMMENDED);
      const catalogStat=await fs.stat(path.join(ROOT,'catalog.json'));
      const libraryStat=await fs.stat(LIBRARY).catch(()=>({mtimeMs:0}));
      const nextFingerprint = [selection.id,appearance,cssStat.mtimeMs,uiStat.mtimeMs,appearanceStat.mtimeMs,configStat.mtimeMs,tuningStat.mtimeMs,recommendedStat.mtimeMs,catalogStat.mtimeMs,libraryStat.mtimeMs,...componentStats.map(stat=>stat.mtimeMs)].join(':');
      const changed = nextFingerprint !== fingerprint;
      if (changed) {payload = await makePayload(selection.id); fingerprint = nextFingerprint; currentVariant = selection;}
      const pages = await targets(), active = new Set(pages.map(page => page.id));
      for (const [id, client] of sessions) if (!active.has(id)) {client.close(); sessions.delete(id);}
      const reports = [];
      for (const target of pages) {
        let client = sessions.get(target.id);
        try {
          const skipReason=themeSkipReason(target.url);
          if(skipReason){
            if(!client){client=await CDP.connect(target);sessions.set(target.id,client);}
            const scripts=state.scripts[target.id]??[];
            for(const identifier of scripts)await client.send('Page.removeScriptToEvaluateOnNewDocument',{identifier}).catch(()=>{});
            if(scripts.length){delete state.scripts[target.id];await save('state.json',state);}
            if(!client.nativeSurfaceCleaned||changed){
              await client.evaluate(removeSource);
              client.nativeSurfaceCleaned=true;
            }
            reports.push({id:target.id,skipped:true,reason:skipReason});
            continue;
          }
          if(client?.nativeSurfaceCleaned){client.close();sessions.delete(target.id);client=null;}
          const newlyConnected = !client;
          if (!client) {client = await CDP.connect(target); sessions.set(target.id, client);
            const importClient=client;
            client.onImport=raw=>{
             let request;
             try{
              if(typeof raw!=='string'||raw.length>16000)throw Error('导入请求过大');request=JSON.parse(raw);
              if(request.action==='start')importer.start(request);
              else if(request.action==='cancel')importer.cancel();
              else if(request.action==='open-steam')importer.openSteam().catch(()=>{});
              else throw Error('未知导入操作');
             }catch(error){importer.reportError(error.message,request?.requestId);}
            };
            await client.send('Runtime.addBinding',{name:'__emiliaImport'});
            client.onLibrary=raw=>{selectionQueue=selectionQueue.catch(()=>{}).then(()=>manageWallpaper(raw)).catch(error=>{libraryStatus={action:'error',message:error.message,changedAt:Date.now()};});};
            await client.send('Runtime.addBinding',{name:'__emiliaLibrary'});
            client.onChoice=id=>{if(Object.hasOwn(variants,id))selectionQueue=selectionQueue.catch(()=>{}).then(()=>selectVariant(id)).catch(console.error);};
            await client.send('Runtime.addBinding',{name:'__emiliaChoose'});
            client.onAppearance=mode=>{if(mode==='light'||mode==='dark')selectionQueue=selectionQueue.catch(()=>{}).then(()=>selectAppearance(mode)).catch(console.error);};
            await client.send('Runtime.addBinding',{name:'__emiliaAppearance'});
            client.onCustomization=raw=>{selectionQueue=selectionQueue.catch(()=>{}).then(()=>customize(raw)).catch(console.error);};
            await client.send('Runtime.addBinding',{name:'__emiliaCustomize'});
            const assetClient=client;client.onAsset=params=>provideAsset(assetClient,params).catch(console.error);
            await client.send('Runtime.addBinding',{name:'__emiliaRequestAsset'});
          }
          if (newlyConnected || changed) {
            for (const identifier of state.scripts[target.id] ?? []) await client.send('Page.removeScriptToEvaluateOnNewDocument', {identifier}).catch(() => {});
            const script = await client.send('Page.addScriptToEvaluateOnNewDocument', {source: payload});
            state.scripts[target.id] = [script.identifier];
            await save('state.json', state);
            await client.evaluate(payload);
          }
          const importStatus=JSON.stringify(importer.getStatus());
          if(client.lastImportStatus!==importStatus){await client.evaluate(`window.__emiliaImportStatus=${importStatus};window.__emiliaRenderImport?.()`);client.lastImportStatus=importStatus;}
          const libraryMessage=JSON.stringify(libraryStatus);
          if(client.lastLibraryStatus!==libraryMessage){await client.evaluate(`window.__emiliaLibraryStatus=${libraryMessage};window.__emiliaRenderLibrary?.()`);client.lastLibraryStatus=libraryMessage;}
          let probe = await client.evaluate(probeSource);
          if (selection.type==='native'?(!probe.nativeDefault||!await client.evaluate("!!document.getElementById('emilia-theme-controls')")):(!probe.applied || probe.variant !== selection.id || (probe.expectedVideo && (probe.mediaType !== 'video' || !await client.evaluate("!!document.getElementById('emilia-theme-controls')"))))) {await client.evaluate(payload); probe = await client.evaluate(probeSource);}
          reports.push({id: target.id, ...probe});
        } catch (error) {client?.close(); sessions.delete(target.id); reports.push({id: target.id, error: error.message});}
      }
      const passed = reports.some(report=>selection.type==='native'?(report.nativeDefault&&report.mainVisible&&report.interactiveControls>20):report.applied&&report.backgroundLoaded&&report.pointerSafe&&report.mainVisible&&report.interactiveControls>20&&!report.horizontalOverflow&&(selection.type!=='video'||(report.mediaType==='video'&&report.mediaPlaying)));
      if(passed&&firstFrameMs===undefined)firstFrameMs=Math.round(performance.now()-startup);
      const reportKey=JSON.stringify(reports.map(({mediaTime,...stable})=>stable));
      if(changed||reportKey!==lastReportKey||Date.now()-lastReportAt>=5000){
      lastReportKey=reportKey;lastReportAt=Date.now();
      await save('verification.json', {firstFrameMs,status: passed ? 'verified' : 'waiting-for-background', checkedAt: new Date().toISOString(), variant: currentVariant.id, background: currentVariant.name, pages: reports, version: '1.1.0', payloadBytes:payload.length});
      }
      if (changed) console.log(`${new Date().toISOString()} selected ${currentVariant.id}`);
      await sleep(700);
    }
  } catch (error) {failure = error.message; console.error(failure);}
  finally {
    for (const client of sessions.values()) client.close();
    if (await exists(STOP)) await restore(state).catch(error => console.error(error.message));
    await save('worker-status.json', {running: false, stoppedAt: new Date().toISOString(), error: failure ?? null});
  }
}


async function provideAsset(client,params){
 const id=params.payload;if(!Object.hasOwn(assets,id))return;
 const file=path.join(ROOT,assets[id].file),stat=await fs.stat(file);
 const key=file+':'+stat.size+':'+stat.mtimeMs;
 let base64=assetCache.get(key);
 if(base64===undefined){base64=(await fs.readFile(file)).toString('base64');assetCache.set(key,base64);}
 await client.send('Runtime.callFunctionOn',{
  executionContextId:params.executionContextId,
  functionDeclaration:`function(base64,mime,id){
   if(![...document.querySelectorAll('#emilia-wallpaper [data-emilia-asset]')].some(media=>media.dataset.emiliaAsset===id))return false;
   window.__emiliaAssets??={};
   if(!window.__emiliaAssets[id]){const raw=atob(base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);window.__emiliaAssets[id]=URL.createObjectURL(new Blob([bytes],{type:mime}));}
   for(const media of document.querySelectorAll('#emilia-wallpaper [data-emilia-asset]')){if(media.dataset.emiliaAsset===id){media.src=window.__emiliaAssets[id];if(media.tagName==='VIDEO')media.play().catch(()=>{});}}
   return true;
  }`,
  arguments:[{value:base64},{value:assets[id].mime},{value:id}],returnByValue:true
 });
}
function bridgeCheck(mode,pid){
 if(!Number.isSafeInteger(pid)||pid<=0)return {valid:false,known:true,trusted:false};
 try{
  return JSON.parse(execFileSync(path.join(ROOT,'LaunchChatGPT.exe'),[mode,String(pid)],{encoding:'utf8',windowsHide:true,timeout:16000}).trim());
 }catch{return null;}
}
async function trustedOwner(){
 try{
  const rows=execFileSync('netstat.exe',['-ano','-p','tcp'],{encoding:'utf8',windowsHide:true});
  const listeners=rows.split(/\r?\n/).map(x=>x.trim().split(/\s+/)).filter(x=>x[3]==='LISTENING'&&/:9387$/.test(x[1]??''));
  if(!listeners.length||listeners.some(x=>x[1]!=='127.0.0.1:9387'))return false;
  return listeners.every(row=>bridgeCheck('--owner-check',Number(row[4]))?.trusted===true);
 }catch{return false;}
}
async function daemon(){
 const lock=path.join(ROOT,'daemon.lock');
 try{
  const text=await fs.readFile(lock,'utf8'),old=JSON.parse(text);
  let alive=false;try{if(Number.isSafeInteger(old.pid)&&old.pid>0){process.kill(old.pid,0);alive=true;}}catch{}
  if(alive){const owner=bridgeCheck('--worker-check',old.pid);if(owner?.valid||owner===null||owner.known===false)return;}
  // Reclaim a stale PID only if the lock has not changed while checking it.
  if(await fs.readFile(lock,'utf8')===text)await fs.rm(lock,{force:true});else return;
 }catch(error){if(error.code!=='ENOENT'){
  // Give a starting worker time to finish its lock, then recover a corrupt one.
  const stat=await fs.stat(lock).catch(()=>null);
  if(stat){if(Date.now()-stat.mtimeMs<15000)return;await fs.rm(lock,{force:true});}
 }}
 let handle;try{handle=await fs.open(lock,'wx');}catch{return;}
 await handle.writeFile(JSON.stringify({pid:process.pid,root:ROOT,startedAt:new Date().toISOString()}));await handle.close();
 await fs.rm(STOP,{force:true});
 try{while(!await exists(STOP)){
  try{const browser=await identity();if(await trustedOwner())await watch(browser);}catch{}
  if(!await exists(STOP))await sleep(2000);
 }}finally{
  const current=JSON.parse(await fs.readFile(lock,'utf8').catch(()=>'{}'));
  if(current.pid===process.pid)await fs.rm(lock,{force:true});
 }
}

async function main() {
  const mode = process.argv[2];
  if(mode==='daemon')return daemon();
  if(mode==='import'){
   importer.start({action:'start',requestId:'cli-'+Date.now(),links:process.argv[3],applyRecommended:process.argv[4]!=='--keep-colors',activate:true});
   const result=await importer.wait();console.log(JSON.stringify(result));if(!['done','partial'].includes(result.state))process.exitCode=1;return;
  }
  if (mode === 'watch') {const expected = process.argv[3]; urlFor(expected, 'browser'); return watch(expected);}
  if (mode === 'select') return selectVariant(process.argv[3]);
  if(mode==='appearance')return selectAppearance(process.argv[3]);
  if(mode==='customize')return customize(process.argv[3]);
  if (mode === 'restore') {
    await fs.writeFile(STOP, 'stop');
    await sleep(2300);
    await restore(JSON.parse(await fs.readFile(STATE, 'utf8').catch(() => '{"scripts":{}}')));
    await save('verification.json', {status: 'restored', checkedAt: new Date().toISOString()});
    console.log('主题外观已移除，原图和动态背景文件均已保留。');
    return;
  }
  if (mode === 'probe') {console.log(JSON.stringify({browserId: await identity(), pageCount: (await targets()).length})); return;}
  if (mode === 'payload-check') {
    const payload = await makePayload(process.argv[3]);
    new Function(payload); new Function(removeSource); new Function(probeSource);
    console.log(JSON.stringify({pass: true, bytes: payload.length, port: PORT, remoteNetwork: false}));
    return;
  }
  throw Error('请使用主题启用、切换或恢复入口');
}
export {CDP, makePayload, probeSource, removeSource,validTuning,themeSkipReason};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(async error => {await save('error.json', {error: error.message, time: new Date().toISOString()}).catch(() => {}); console.error(error.message); process.exitCode = 1;});
}
