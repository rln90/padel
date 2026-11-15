const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(require('./paths').HTML,'utf8');
const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
const q=(w,s)=>w.document.querySelector(s),qa=(w,s)=>[...w.document.querySelectorAll(s)];
const set=(w,id,v)=>{q(w,id).value=String(v);q(w,id).dispatchEvent(new w.Event('change',{bubbles:true}))};
let f=0;const ok=(c,m)=>{if(!c)f++;console.log((c?'OK     ':'FEHLER ')+m)};
for(const mode of ['no','yes','wait']){
  const w=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true}).window;
  set(w,'#n',8);set(w,'#r',4);set(w,'#ov',mode);set(w,'#c',2);
  [...w.document.querySelectorAll('#nf input[data-k="c"]')].forEach((i,k)=>{i.value=['Center Court','Nord'][k];i.dispatchEvent(new w.Event('input',{bubbles:true}))});
  ok(/Center Court/.test(q(w,'#plan').textContent),mode+': Vorschau zeigt Namen');
  w.start();
  ok(/Center Court/.test(q(w,'#plan').textContent)&&/Nord/.test(q(w,'#plan').textContent),mode+': Plan zeigt Namen');
  if(mode!=='no')ok(/Center Court|Nord/.test(q(w,'#cur').textContent),mode+': Spielzeile zeigt Platzname');
  const w2=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,beforeParse(x){x.localStorage.setItem('padel-turnier-v2',w.localStorage.getItem('padel-turnier-v2'))}}).window;
  ok(/Center Court/.test(q(w2,'#plan').textContent),mode+': nach Neuladen erhalten');
}
const w=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc}).window;set(w,'#n',8);set(w,'#c',2);w.start();
ok(/Platz 1/.test(q(w,'#plan').textContent),'ohne Eingabe: Platz 1');
console.log('JS-Fehler',errs.length,errs[0]||'');process.exit(f?1:0)
