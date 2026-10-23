(() => {
 if(document.querySelectorAll('button').length<20)return;
 let host=document.getElementById('emilia-theme-controls');
 if(host&&host.dataset.version!=='10'){host.remove();host=null;}
 if(!host){
  host=document.createElement('div');host.id='emilia-theme-controls';host.dataset.version='10';
  host.innerHTML='<button type="button" class="theme-toggle" title="幻景 · ChatGPT 主题管理器" aria-label="打开幻景主题管理器" aria-expanded="false">◈ 幻景</button><section hidden aria-label="幻景 · ChatGPT 主题管理器"><strong>幻景 · 主题管理器</strong><button type="button" data-theme-choice="system" class="native-choice">系统默认 · GPT 原生外观</button><details class="wallpaper-picker"><summary>选择壁纸</summary><div class="theme-options"></div></details><div class="library-notice" hidden><span class="library-message" aria-live="polite"></span><button type="button" class="library-undo">撤销</button><button type="button" class="library-dismiss" aria-label="关闭壁纸操作提示">×</button></div><details class="removed-picker" hidden><summary>已删除的壁纸</summary><div class="removed-options"></div></details><button type="button" class="import-open">＋ 导入 Steam 壁纸链接</button><div class="custom-editor"><div class="recommended-card"><div class="recommended-info"><span class="recommended-swatches" aria-hidden="true"><i></i><i></i><i></i></span><span class="recommended-name"></span></div><button type="button" class="apply-recommended">应用推荐配色</button><small>同步设置颜色、透明度、遮罩与模糊</small></div><div class="editor-heading">自定义配色</div><label class="color-row"><span>界面主色</span><input type="color" data-tuning-color="base" aria-label="界面主色"><input class="hex-field" data-tuning-hex="base" aria-label="界面主色十六进制" maxlength="7" spellcheck="false"></label><label class="color-row"><span>强调色</span><input type="color" data-tuning-color="accent" aria-label="强调色"><input class="hex-field" data-tuning-hex="accent" aria-label="强调色十六进制" maxlength="7" spellcheck="false"></label><div class="color-row"><label for="emilia-text-color">文字颜色</label><input id="emilia-text-color" type="color" data-tuning-color="text" aria-label="文字颜色"><label class="text-auto"><input type="checkbox" class="auto-text"> 自动</label></div><label class="slider-row"><span>面板透明度 <output data-value="panelTransparency"></output></span><input type="range" min="0" max="100" step="1" data-tuning-range="panelTransparency" aria-label="面板透明度"><small>顶部、侧栏、输入框和右侧面板一起调整</small></label><label class="slider-row"><span>背景遮罩 <output data-value="maskStrength"></output></span><input type="range" min="0" max="100" step="1" data-tuning-range="maskStrength" aria-label="背景遮罩"><small>越低，壁纸越清晰</small></label><label class="slider-row"><span>面板模糊 <output data-value="blur"></output></span><input type="range" min="0" max="24" step="1" data-tuning-range="blur" aria-label="面板模糊"></label><button type="button" class="reset-tuning">重置当前壁纸的配色</button></div><small class="theme-hint"></small><span class="theme-status" aria-live="polite"></span></section><dialog class="wallpaper-import-dialog" aria-labelledby="emilia-import-title"><form class="import-form"><header><h2 id="emilia-import-title">幻景 · 导入 Steam 壁纸</h2><button type="button" class="import-close" aria-label="关闭导入对话框">×</button></header><p class="import-intro">把 Wallpaper Engine 的创意工坊链接粘贴到这里。支持一次添加多个链接。</p><label class="import-link-label" for="emilia-import-links">壁纸链接</label><textarea id="emilia-import-links" class="import-links" rows="3" maxlength="12000" placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=…" required spellcheck="false"></textarea><label class="import-check"><input type="checkbox" class="import-use-recommended" checked> 应用这张壁纸的推荐配色与透明度</label><label class="import-check"><input type="checkbox" class="import-activate" checked> 导入完成后立即切换到新壁纸</label><p class="import-note">配色采用柔和底色、低饱和点缀和深灰文字，可继续手动微调。视频保留最长 120 秒；场景与网页壁纸生成 20 秒动态循环。</p><div class="import-feedback" aria-live="polite"><span class="import-job-title"></span><span class="import-message"></span><progress max="100" hidden aria-label="壁纸导入进度"></progress><button type="button" class="import-steam" hidden>在 Steam 中打开，订阅下载</button><ul class="import-errors" hidden></ul></div><div class="import-actions"><button type="button" class="import-cancel">关闭</button><button type="submit" class="import-submit">导入并应用</button></div><small class="import-footer">内置插画可离线使用。导入壁纸需要 Steam 与 Wallpaper Engine；首次导入会联网准备约 30 MB 的工具。可关闭窗口继续聊天。</small></form></dialog>';
  document.body.append(host);
  const status=()=>host.querySelector('.theme-status');
  const toggle=host.querySelector('.theme-toggle'),panel=host.querySelector('section');
  toggle.onclick=()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));};
  host.addEventListener('keydown',e=>{if(e.key==='Escape'&&!host.querySelector('.wallpaper-import-dialog')?.open){panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();}});
  let timer;
  function flush(){
   clearTimeout(timer);const draft=window.__emiliaTuningDraft;
   if(draft&&typeof window.__emiliaCustomize==='function')window.__emiliaCustomize(JSON.stringify({id:draft.variant,value:draft.value}));
  }
  function edit(patch){
   const id=document.documentElement.dataset.emiliaBackground;
   if(id==='system'||typeof window.__emiliaApplyTuning!=='function')return;
   const value=window.__emiliaApplyTuning({...window.__emiliaTuningCurrent,...patch});
   window.__emiliaTuningDraft={variant:id,value};window.__emiliaSyncTuning?.();status().textContent='正在保存…';
   clearTimeout(timer);timer=setTimeout(flush,250);
  }
  const choose=button=>{if(!button)return;flush();delete window.__emiliaTuningDraft;status().textContent='正在切换…';window.__emiliaChoose?.(button.dataset.themeChoice);};
  host.querySelector('.native-choice').onclick=e=>choose(e.currentTarget);
  const manage=(action,id,activate=false)=>{
   flush();delete window.__emiliaTuningDraft;
   if(typeof window.__emiliaLibrary!=='function'){status().textContent='主题服务正在连接，请稍后重试';return;}
   window.__emiliaLibrary(JSON.stringify({action,id,activate}));
  };
  host.querySelector('.theme-options').onclick=e=>{
   const remove=e.target.closest('[data-theme-delete]');
   if(remove){manage('delete',remove.dataset.themeDelete);return;}
   choose(e.target.closest('[data-theme-choice]'));
  };
  host.querySelector('.removed-options').onclick=e=>{const button=e.target.closest('[data-theme-restore]');if(button)manage('restore',button.dataset.themeRestore);};
  host.querySelector('.library-undo').onclick=()=>{const s=window.__emiliaLibraryStatus;if(s?.action==='deleted')manage('restore',s.id,s.wasCurrent);};
  host.querySelector('.library-dismiss').onclick=()=>manage('dismiss');
  const dialog=host.querySelector('.wallpaper-import-dialog');
  host.querySelector('.import-open').onclick=()=>{flush();dialog.showModal();window.__emiliaRenderImport?.();host.querySelector('.import-links').focus();};
  host.querySelector('.import-close').onclick=()=>dialog.close();
  host.querySelector('.import-cancel').onclick=()=>{if(window.__emiliaImportStatus?.state==='running'){window.__emiliaImport?.(JSON.stringify({action:'cancel'}));}else dialog.close();};
  host.querySelector('.import-steam').onclick=()=>window.__emiliaImport?.(JSON.stringify({action:'open-steam'}));
  host.querySelector('.import-form').onsubmit=e=>{
   e.preventDefault();flush();
   const links=host.querySelector('.import-links').value.trim();if(!links)return;
   const request={action:'start',requestId:crypto.randomUUID(),links,applyRecommended:host.querySelector('.import-use-recommended').checked,activate:host.querySelector('.import-activate').checked};
   window.__emiliaImportStatus={state:'running',message:'正在准备导入…',requestId:request.requestId,results:[],errors:[]};window.__emiliaRenderImport?.();
   if(typeof window.__emiliaImport==='function')window.__emiliaImport(JSON.stringify(request));
   else{window.__emiliaImportStatus={state:'error',message:'主题服务正在连接，请稍后重试'};window.__emiliaRenderImport?.();}
  };
  host.querySelector('.import-activate').onchange=()=>window.__emiliaRenderImport?.();
  host.querySelectorAll('[data-tuning-color]').forEach(input=>input.addEventListener('input',()=>edit({[input.dataset.tuningColor]:input.value})));
  host.querySelectorAll('[data-tuning-hex]').forEach(input=>input.addEventListener('input',()=>{
   const color=input.value.startsWith('#')?input.value:'#'+input.value;
   const valid=/^#[0-9a-f]{6}$/i.test(color);input.setAttribute('aria-invalid',String(!valid));
   if(valid)edit({[input.dataset.tuningHex]:color.toLowerCase()});
  }));
  host.querySelector('.auto-text').onchange=e=>edit({text:e.target.checked?'auto':window.__emiliaTuningText});
  host.querySelectorAll('[data-tuning-range]').forEach(input=>{
   input.addEventListener('input',()=>edit({[input.dataset.tuningRange]:Number(input.value)}));
   input.addEventListener('change',flush);
  });
  host.querySelector('.apply-recommended').onclick=()=>{
   const preset=window.__emiliaRecommended;if(!preset)return;
   edit(preset.value);flush();
  };
  host.querySelector('.reset-tuning').onclick=()=>{
   clearTimeout(timer);delete window.__emiliaTuningDraft;
   window.__emiliaApplyTuning?.(window.__emiliaTuningDefaults);window.__emiliaSyncTuning?.();
   status().textContent='正在重置…';window.__emiliaCustomize?.(JSON.stringify({id:document.documentElement.dataset.emiliaBackground,value:null}));
  };
  window.addEventListener('pagehide',flush);
 }
 const choices=(window.__emiliaVariants??[]).filter(x=>x.id!=='system');
 const choiceKey=JSON.stringify(choices);
 if(host.dataset.choices!==choiceKey){
  const options=host.querySelector('.theme-options');options.replaceChildren();
  for(const choice of choices){
   const row=document.createElement('div');row.className='wallpaper-row';
   const button=document.createElement('button');button.type='button';button.dataset.themeChoice=choice.id;button.textContent=choice.name;button.title=choice.name;
   const remove=document.createElement('button');remove.type='button';remove.dataset.themeDelete=choice.id;remove.textContent='删除';remove.title='从主题列表删除，可在已删除的壁纸中恢复';remove.setAttribute('aria-label','删除壁纸：'+choice.name);
   row.append(button,remove);options.append(row);
  }
  host.dataset.choices=choiceKey;
 }
 const removed=window.__emiliaRemoved??[];
 const removedKey=JSON.stringify(removed);
 if(host.dataset.removed!==removedKey){
  const details=host.querySelector('.removed-picker'),options=host.querySelector('.removed-options');details.hidden=!removed.length;details.querySelector('summary').textContent='已删除的壁纸（'+removed.length+'）';options.replaceChildren();
  for(const item of removed){const row=document.createElement('div');row.className='removed-row';const title=document.createElement('span');title.textContent=item.name;title.title=item.name;const button=document.createElement('button');button.type='button';button.dataset.themeRestore=item.id;button.textContent='恢复';button.setAttribute('aria-label','恢复壁纸：'+item.name);row.append(title,button);options.append(row);}
  host.dataset.removed=removedKey;
 }
 window.__emiliaRenderLibrary=()=>{
  const s=window.__emiliaLibraryStatus,notice=host.querySelector('.library-notice');notice.hidden=!s;
  host.querySelector('.library-message').textContent=s?.message??'';
  host.querySelector('.library-undo').hidden=s?.action!=='deleted';
 };
 window.__emiliaRenderLibrary();
 window.__emiliaRenderImport=()=>{
  const s=window.__emiliaImportStatus??{},running=s.state==='running',form=host.querySelector('.import-form');
  form.querySelector('.import-message').textContent=s.message??'粘贴链接后点击导入';
  form.querySelector('.import-job-title').textContent=s.title?(s.total>1?`(${s.index}/${s.total}) `:'')+s.title:'';
  const progress=form.querySelector('progress');progress.hidden=!running;if(Number.isFinite(s.percent))progress.value=s.percent;else progress.removeAttribute('value');
  form.querySelector('.import-steam').hidden=!(running&&s.steamLink);
  for(const selector of ['.import-links','.import-use-recommended','.import-activate','.import-submit'])form.querySelector(selector).disabled=running;
  form.querySelector('.import-cancel').textContent=running?'取消导入':'关闭';
  form.querySelector('.import-submit').textContent=running?'正在导入…':form.querySelector('.import-activate').checked?'导入并应用':'加入主题库';
  const errors=form.querySelector('.import-errors');errors.replaceChildren();errors.hidden=!s.errors?.length;
  for(const error of s.errors??[]){const li=document.createElement('li');li.textContent=error.workshopId+'：'+error.message;errors.append(li);}
  host.querySelector('.import-open').textContent=running?'◌ 壁纸正在导入…':'＋ 导入 Steam 壁纸链接';
 };
 window.__emiliaRenderImport();
 window.__emiliaSyncTuning=()=>{
  const v=window.__emiliaTuningCurrent;if(!v)return;
  const preset=window.__emiliaRecommended,card=host.querySelector('.recommended-card');
  card.hidden=!preset;
  if(preset){
   host.querySelector('.recommended-name').textContent=preset.name;
   const colors=[preset.value.base,preset.value.accent,preset.value.text==='auto'?'#f5f6fa':preset.value.text];
   card.querySelectorAll('i').forEach((swatch,index)=>swatch.style.backgroundColor=colors[index]);
   const active=Object.keys(preset.value).every(key=>v[key]===preset.value[key]);
   const button=host.querySelector('.apply-recommended');button.textContent=active?'已应用推荐 · 再次应用':'应用推荐配色';button.setAttribute('aria-pressed',String(active));
  }
  host.querySelectorAll('[data-tuning-color]').forEach(input=>{const key=input.dataset.tuningColor;input.value=key==='text'?(v.text==='auto'?window.__emiliaTuningText:v.text):v[key];input.disabled=key==='text'&&v.text==='auto';});
  host.querySelectorAll('[data-tuning-hex]').forEach(input=>{if(input!==document.activeElement){input.value=v[input.dataset.tuningHex];input.setAttribute('aria-invalid','false');}});
  host.querySelector('.auto-text').checked=v.text==='auto';
  host.querySelectorAll('[data-tuning-range]').forEach(input=>{const key=input.dataset.tuningRange;input.value=v[key];host.querySelector('[data-value="'+key+'"]').textContent=v[key]+(key==='blur'?' px':'%');});
 };
 const native=document.documentElement.dataset.emiliaBackground==='system';host.dataset.native=String(native);
 if(native){const a=getComputedStyle(document.body).color.match(/[0-9.]+/g)?.slice(0,3).map(Number)??[0,0,0];host.dataset.tone=a.reduce((x,y)=>x+y,0)>384?'dark':'light';}
 else{host.dataset.tone=document.documentElement.dataset.emiliaMode;window.__emiliaSyncTuning();}
 host.querySelector('.custom-editor').hidden=native;
 const selected=(window.__emiliaVariants??[]).find(x=>x.id===document.documentElement.dataset.emiliaBackground);
 host.querySelector('summary').textContent='壁纸：'+(selected?.name??'请选择');
 host.querySelectorAll('[data-theme-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeChoice===document.documentElement.dataset.emiliaBackground)));
 host.querySelector('.theme-hint').textContent=native?'使用 GPT 自身的外观设置。':'即时预览 · 每个壁纸单独保存';
 host.querySelector('.theme-status').textContent=native?'已应用 · 系统默认':window.__emiliaTuningDraft?'正在保存…':'已应用 · 自定义配色';
})();
