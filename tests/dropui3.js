const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(require('./paths').HTML,'utf8');
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>errs.push(e.message));
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'OK     ':'FEHLER ')+m)};
const q=(w,s)=>w.document.querySelector(s),qa=(w,s)=>[...w.document.querySelectorAll(s)];
const set=(w,id,v)=>{q(w,id).value=String(v);q(w,id).dispatchEvent(new w.Event('change',{bubbles:true}))};
const type=(w,i,v)=>{i.value=String(v);i.dispatchEvent(new w.Event('input',{bubbles:true}))};
for(const n of [7,8,9,10])for(const mode of ['no','yes','wait'])for(const dsel of ['0','3','5','8']){if(+dsel>=n)continue;
  const w=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true}).window;
  set(w,'#n',n);set(w,'#r',4);set(w,'#ov',mode);set(w,'#c',2);w.start();
  let seenEq=false,bad=0,g=0;
  q(w,'#dropsel').value=dsel;let btn=()=>qa(w,'#outc button')[0];btn().click();btn().click();
  while(g++<120){
    qa(w,'#cur .m').forEach(r=>{const x=r.querySelectorAll('input');if(x[0]&&x[0].value===''){type(w,x[0],6);type(w,x[1],3)}});
    const t=[...w.document.body.querySelectorAll('#app *')].filter(e=>!e.children.length&&e.tagName!=='SCRIPT').map(e=>e.textContent).join(' ');if(/undefined|NaN/.test(t)){bad++;if(bad===1)console.log('   >>',n,mode,dsel,t.match(/.{40}(undefined|NaN).{20}/)[0])};if(/Ausgleichsspiel/.test(t))seenEq=true;
    const b=qa(w,'#act button').find(b=>/Nächste|Weiter|ansetzen|Spiele|erstellen/i.test(b.textContent)&&!b.disabled);if(!b)break;b.click();
  }
  const S=JSON.parse(w.localStorage.getItem('padel-turnier-v2'));
  const all=S.games||S.rounds.flatMap(r=>r.m.concat(r.x?[r.x]:[]));const cnt=Array(n).fill(0);all.forEach(m=>{cnt[m.a]++;if(!m.h)cnt[m.b]++});
  const act=[...Array(n).keys()].filter(i=>!S.out.includes(i)),want=S.R;
  ok(act.every(i=>cnt[i]===want),`n=${n} ${mode} drop${dsel}: alle Aktiven gleich viele Spiele (${act.map(i=>cnt[i]).join(',')} von ${want})`);
  ok(bad===0,`n=${n} ${mode}: kein "undefined/NaN" im Text`);
  ok(/Turniersieger|Gleichstand|Entscheidungsspiele/.test(q(w,'#champ').textContent),`n=${n} ${mode}: Turnier endet`);
  console.log('   Ausgleichsspiel sichtbar:',seenEq);
}
console.log('JS-Fehler:',errs.length,errs[0]||'');console.log(fails?'FEHLER':'ALLES OK');
