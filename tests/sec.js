const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(require('./paths').HTML,'utf8');
const q=(w,s)=>w.document.querySelector(s);
const set=(w,id,v)=>{q(w,id).value=String(v);q(w,id).dispatchEvent(new w.Event('change',{bubbles:true}))};
(async()=>{const w=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:new VirtualConsole(),pretendToBeVisual:true}).window;
set(w,'#n',10);set(w,'#r',5);set(w,'#c',3);set(w,'#dur',15);set(w,'#brk',5);
for(const mode of ['no','yes','wait']){set(w,'#ov',mode);
 console.log('==',mode,'Sicherheitsfeld sichtbar:',!q(w,'#secf').hidden);
 for(const sec of (mode==='no'?['75']:['50','75','95'])){set(w,'#sec',sec);
  const t=q(w,'#sum').textContent.replace(/\s+/g,' ');
  console.log(sec,(t.match(/reicht in ca\. \d+ %/)||['(keine %-Angabe)'])[0],'|',[...w.document.querySelectorAll('#sum tbody tr')].map(r=>r.cells[0].textContent+' '+r.cells[1].textContent.replace(/\s+/g,' ')).join(' ; '))}}
await new Promise(r=>setTimeout(r,2500));console.log('Vergleich (wait):',q(w,'#ptab').textContent.replace(/\s+/g,' ').slice(0,420));})();
