import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/tuning-engine.js',import.meta.url),'utf8');
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const lum=hex=>rgb(hex).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
  .reduce((total,v,i)=>total+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
function render(value) {
  const elements=new Map();
  const root={dataset:{emiliaBackground:'original'},removeAttribute(){}};
  const context={
    window:{__emiliaTuningSaved:value,__emiliaTuningCss:''},
    document:{documentElement:root,getElementById:id=>elements.get(id),
      createElement:()=>({remove(){}}),head:{append:element=>elements.set(element.id,element)}},
    getComputedStyle:()=>({getPropertyValue:()=>''})
  };
  vm.runInNewContext(source,context,{timeout:1000});
  const css=elements.get('emilia-custom-style').textContent;
  return Object.fromEntries([...css.matchAll(/(--[\w-]+):([^;!]+)!important/g)].map(m=>[m[1],m[2]]));
}
test('action labels and activity levels remain readable with light, dark and saturated palettes', () => {
  for (const [base,accent] of [
    ['#e9dfd7','#8f5278'],['#1c1739','#bb9ffa'],['#ffffff','#fffffe'],
    ['#000000','#000001'],['#808080','#808080'],['#ff0000','#00ff00'],
    ['#00ff00','#ff0000'],['#0000ff','#ff00ff'],['#ffff00','#00ffff'],
    ['#dce4e4','#547b82'],['#eadce1','#986077'],['#e3e2d4','#6e7950']
  ]) {
    const values=render({base,accent,text:'auto',panelTransparency:33,maskStrength:39,blur:8});
    assert.ok(contrast(values['--emilia-action'],base)>=3, base+' action');
    assert.ok(contrast(values['--emilia-action'],values['--emilia-on-accent'])>=4.5,base+' label');
    const levels=Array.from({length:5},(_,i)=>values['--emilia-activity-'+i]);
    assert.equal(new Set(levels).size,5,base+' distinct activity');
    const direction=Math.sign(lum(levels[4])-lum(levels[0]));
    for (let i=1;i<5;i++) assert.equal(Math.sign(lum(levels[i])-lum(levels[i-1])),direction,base+' activity order');
  }
});
