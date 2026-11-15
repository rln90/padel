const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(require('./paths').HTML,'utf8');
const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'OK     ':'FEHLER ')+m)};
function boot(){return new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true}).window}
const q=(w,s)=>w.document.querySelector(s),qa=(w,s)=>[...w.document.querySelectorAll(s)];
const set=(w,id,v)=>{q(w,id).value=String(v);q(w,id).dispatchEvent(new w.Event('change',{bubbles:true}))};
const type=(w,i,v)=>{i.value=String(v);i.dispatchEvent(new w.Event('input',{bubbles:true}))};
for(const mode of ['no','yes','wait']){
  const w=boot();set(w,'#n',4);set(w,'#r',3);set(w,'#ov',mode);set(w,'#lim','yes');set(w,'#draw','yes');w.start();
  let guard=0;
  while(guard++<40){
    if(mode==='no'){const ins=qa(w,'#cur .m');ins.forEach(r=>{const x=r.querySelectorAll('input');type(w,x[0],1);type(w,x[1],1)});
      const b=qa(w,'#act button').find(b=>/erstellen/.test(b.textContent));if(b&&!b.disabled)b.click();else break}
    else{qa(w,'#cur .m').forEach(r=>{const x=r.querySelectorAll('input');if(x[0].value===''){type(w,x[0],1);type(w,x[1],1)}});
      const b=qa(w,'#act button').find(b=>/ansetzen/i.test(b.textContent)&&!b.disabled);if(b)b.click();else if(!qa(w,'#cur .m').some(r=>r.querySelector('input').value===''))break}
  }
  const S=JSON.parse(w.localStorage.getItem('padel-turnier-v2'));
  ok(Array.isArray(S.so)&&S.so.length===6,mode+': 4 punktgleiche Spieler → 6 Entscheidungsspiele ('+(S.so&&S.so.length)+')');
  ok(/Entscheidungsspiele/.test(q(w,'#champ').textContent),mode+': Hinweis statt Sieger');
  // Ergebnisse: Spieler 0 gewinnt alles, dann 1, 2, 3
  const rows=qa(w,'#so .m');ok(rows.length===6,mode+': 6 Eingabezeilen');
  S.so.forEach((m,i)=>{const x=rows[i].querySelectorAll('input');const hi=Math.min(m.a,m.b)===m.a?m.a:m.b;const aWins=m.a<m.b;type(w,x[0],aWins?6:2);type(w,x[1],aWins?2:6)});
  const txt=q(w,'#champ').textContent;
  ok(/Turniersieger/.test(txt)&&/P0|A/.test(txt),mode+': nach Entscheidungsspielen: '+txt.replace(/\s+/g,' ').slice(0,90));
  const t=q(w,'#tab').textContent;ok(/Buchholz|Bh/.test(t),mode+': Tabelle zeigt Buchholz');
}
// kein Entscheidungsspiel ohne Gleichstand
{const w=boot();set(w,'#n',4);set(w,'#r',3);w.start();let g=0;while(g++<10){qa(w,'#cur .m').forEach((r,i)=>{const x=r.querySelectorAll('input');type(w,x[0],6);type(w,x[1],i)});const b=qa(w,'#act button').find(b=>/erstellen/.test(b.textContent));if(b&&!b.disabled)b.click();else break}
 const S=JSON.parse(w.localStorage.getItem('padel-turnier-v2'));console.log('ohne Gleichstand: Entscheidungsspiele',(S.so||[]).length,'| Sieger-Anzeige:',q(w,'#champ').textContent.replace(/\s+/g,' ').slice(0,60))}
console.log('Fehler:',fails,'JS-Fehler:',errs.length,errs[0]||'');
