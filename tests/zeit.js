const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(require('./paths').HTML,'utf8');
const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
const q=(w,s)=>w.document.querySelector(s),qa=(w,s)=>[...w.document.querySelectorAll(s)];
const set=(w,id,v)=>{q(w,id).value=String(v);q(w,id).dispatchEvent(new w.Event('change',{bubbles:true}))};
let f=0;const ok=(c,m)=>{if(!c)f++;console.log((c?'OK     ':'FEHLER ')+m)};
const txt=(w,s)=>q(w,s).textContent.replace(/\s+/g,' ');
for(const mode of ['no','yes','wait']){
  const w=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true}).window;
  set(w,'#n',8);set(w,'#r',4);set(w,'#c',2);set(w,'#ov',mode);set(w,'#wu',10);set(w,'#t0','18:00');
  ok(/18:10/.test(txt(w,'#plan'))&&/Aufwärmen · 10 min/.test(txt(w,'#plan')),mode+': Vorschau 18:10 + Aufwärmen');
  ok(/18:00 bis/.test(txt(w,'#sum')),mode+': Buchung mit Uhrzeiten: '+txt(w,'#sum').match(/\d\d:\d\d bis \d\d:\d\d/));
  w.start();
  ok(/18:10/.test(txt(w,'#plan')),mode+': Plan nach Start 18:10');
  if(mode!=='no')ok(/ab 18:10/.test(txt(w,'#cur')),mode+': Spielzeile "ab 18:10"');
  const first=txt(w,'#plan').match(/18:\d\d|19:\d\d/g);
  qa(w,'.tctl button').find(b=>/\+10/.test(b.textContent)).click();
  ok(/18:20/.test(txt(w,'#plan')),mode+': +10 min verschiebt erste Zeile auf 18:20');
  ok(/Insgesamt \+10/.test(txt(w,'#tctl')),mode+': Anzeige Verzögerung');
  q(w,'.tctl input[type=text]').value='19:00';q(w,'.tctl input[type=text]').dispatchEvent(new w.Event('change',{bubbles:true}));
  ok(/19:20/.test(txt(w,'#plan')),mode+': Startzeit ändern -> 19:20');
  qa(w,'.tctl button').find(b=>/Zurücksetzen/.test(b.textContent)).click();
  ok(/19:10/.test(txt(w,'#plan')),mode+': Zurücksetzen');
  const S=JSON.parse(w.localStorage.getItem('padel-turnier-v2'));ok(S.t0===1140&&S.wu===10&&!S.dl,mode+': Zustand gespeichert');
  const w2=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,beforeParse(x){x.localStorage.setItem('padel-turnier-v2',w.localStorage.getItem('padel-turnier-v2'))}}).window;
  ok(/19:10/.test(txt(w2,'#plan')),mode+': nach Neuladen');
  ok(!/undefined|NaN/.test(txt(w,'#app')),mode+': kein undefined/NaN');
}
// ohne Startzeit
const w=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true}).window;
set(w,'#n',8);set(w,'#c',2);set(w,'#ov','yes');w.start();ok(/0:25/.test(txt(w,'#plan'))&&!/· ab \d/.test(txt(w,'#cur')),'ohne Startzeit: relative Zeiten');
console.log('JS-Fehler',errs.length,errs[0]||'');process.exit(f?1:0)
