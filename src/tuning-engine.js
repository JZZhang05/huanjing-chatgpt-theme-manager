(() => {
 const root=document.documentElement;
 document.getElementById('emilia-custom-style')?.remove();root.removeAttribute('data-emilia-custom');
 const styles=getComputedStyle(root);
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)));
 const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 const hex=values=>'#'+values.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
 const mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
 const lum=a=>a.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const fromStyle=(name,fallback)=>{const a=styles.getPropertyValue(name).match(/[0-9.]+/g)?.slice(0,3).map(Number);return a?.length===3?hex(a):fallback;};
 const defaults={base:fromStyle('--emilia-panel','#242035'),accent:fromStyle('--emilia-accent','#c4a7ff'),text:'auto',panelTransparency:18,maskStrength:55,blur:12};
 window.__emiliaTuningDefaults=defaults;
 function normalize(value){
  const v={...defaults,...value};
  for(const key of ['base','accent'])if(!/^#[0-9a-f]{6}$/i.test(v[key]))v[key]=defaults[key];
  if(v.text!=='auto'&&!/^#[0-9a-f]{6}$/i.test(v.text))v.text='auto';
  return {base:v.base.toLowerCase(),accent:v.accent.toLowerCase(),text:v.text==='auto'?'auto':v.text.toLowerCase(),panelTransparency:clamp(v.panelTransparency,0,100),maskStrength:clamp(v.maskStrength,0,100),blur:clamp(v.blur,0,24)};
 }
 window.__emiliaApplyTuning=value=>{
  const v=normalize(value),base=rgb(v.base),accent=rgb(v.accent);
  const baseLum=lum(base),light=(baseLum+.05)/(lum([32,34,42])+.05)>=(lum([245,246,250])+.05)/(baseLum+.05);
  const fg=v.text==='auto'?(light?[32,34,42]:[245,246,250]):rgb(v.text);
  const side=mix(base,light?[255,255,255]:[0,0,0],.08),muted=mix(fg,base,.22);
  let link=accent.slice();
  for(let i=0;i<32;i++){
   const levels=[lum(link),lum(base)].sort((a,b)=>b-a);
   if((levels[0]+.05)/(levels[1]+.05)>=4.55)break;
   link=mix(link,light?[0,0,0]:[255,255,255],.12);
  }
  const strength=v.maskStrength/100,stops=[3.5,3,2.2,1.5,.8,.5].map(k=>1-Math.pow(1-strength,k));
  const alpha=1-v.panelTransparency/100;
  // Actions keep their own contrasting label, independent of the page text color.
  const ink=[24,27,34],paper=[255,255,255];
  const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  let action=accent.slice();
  for(let i=0;i<32&&contrast(action,base)<3.05;i++)action=mix(action,light?[0,0,0]:paper,.10);
  const onAccent=contrast(action,paper)>=contrast(action,[0,0,0])?paper:[0,0,0];
  const actionShade=onAccent===paper?[0,0,0]:paper;
  // Space activity levels by luminance so custom hues preserve the data order.
  const activityColor=fraction=>{
   const actionLum=lum(action),target=baseLum+(actionLum-baseLum)*fraction;
   let lower=0,upper=1;
   for(let i=0;i<16;i++){
    const middle=(lower+upper)/2,current=lum(mix(base,action,middle));
    if((actionLum>baseLum&&current<target)||(actionLum<baseLum&&current>target))lower=middle;else upper=middle;
   }
   return hex(mix(base,action,(lower+upper)/2));
  };
  const values={
   '--emilia-panel':base.join(','),'--emilia-side':side.map(Math.round).join(','),'--emilia-wash':base.join(','),
   '--emilia-accent':accent.join(','),'--emilia-fg':hex(fg),'--emilia-muted':hex(muted),'--emilia-link':hex(link),
   '--emilia-page':v.base,'--emilia-raised':hex(mix(base,light?[0,0,0]:[255,255,255],.06)),
   '--emilia-custom-alpha':alpha.toFixed(3),'--emilia-custom-blur':v.blur+'px',
   '--emilia-action':hex(action),'--emilia-action-hover':hex(mix(action,actionShade,.10)),
   '--emilia-action-active':hex(mix(action,actionShade,.18)),'--emilia-on-accent':hex(onAccent),
   '--emilia-focus':hex(link),
   '--emilia-action-disabled':hex(mix(accent,base,.68)),
   '--emilia-fg-disabled':hex(mix(fg,base,.38)),
   '--emilia-elevated-alpha':(.88+.10*alpha).toFixed(3),
   '--emilia-selected':hex(mix(base,accent,.16)),
   '--emilia-control':hex(mix(base,light?paper:ink,.16)),
   '--emilia-custom-shadow':lum(fg)>.5?'0 1px 3px rgba(0,0,0,.5)':'none',
   '--color-codex-syntax-comment':light?'#635d6b':'#bcb7c9',
   '--color-codex-syntax-keyword':light?'#7345a6':'#c7a8ff',
   '--color-codex-syntax-string':light?'#26764a':'#8bdaa6',
   '--color-codex-syntax-number':light?'#a74c1c':'#f6bb8c',
   '--color-codex-syntax-variable':light?'#6651a5':'#c9b1ff'
  };
  [.06,.28,.52,.76,1].forEach((fraction,i)=>values['--emilia-activity-'+i]=activityColor(fraction));
  for(let i=0;i<stops.length;i++)values['--emilia-mask-'+i]=stops[i].toFixed(3);
  let style=document.getElementById('emilia-custom-style');
  if(!style){style=document.createElement('style');style.id='emilia-custom-style';document.head.append(style);}
  const variables=Object.entries(values).map(([key,val])=>key+':'+val+'!important').join(';');
  style.textContent=window.__emiliaTuningCss+'\nhtml[data-emilia-theme="on"][data-emilia-custom="on"]{'+variables+';color-scheme:'+(light?'light':'dark')+'!important;}';
  root.dataset.emiliaCustom='on';root.dataset.emiliaMode=light?'light':'dark';
  window.__emiliaTuningCurrent=v;window.__emiliaTuningText=hex(fg);
  const host=document.getElementById('emilia-theme-controls');if(host)host.dataset.tone=light?'light':'dark';
  return v;
 };
 const saved=normalize(window.__emiliaTuningSaved??defaults),draft=window.__emiliaTuningDraft;
 if(draft?.variant===root.dataset.emiliaBackground&&JSON.stringify(normalize(draft.value))===JSON.stringify(saved))delete window.__emiliaTuningDraft;
 const current=window.__emiliaTuningDraft;
 window.__emiliaApplyTuning(current?.variant===root.dataset.emiliaBackground?current.value:saved);
})();
