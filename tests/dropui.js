const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(require('./paths').HTML,'utf8');
const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'OK     ':'FEHLER ')+m)};
const q=(w,s)=>w.document.querySelector(s),qa=(w,s)=>[...w.document.querySelectorAll(s)];
const set=(w,id,v)=>{q(w,id).value=String(v);q(w,id).dispatchEvent(new w.Event('change',{bubbles:true}))};
const type=(w,i,v)=>{i.value=String(v);i.dispatchEvent(new w.Event('input',{bubbles:true}))};
for(const mode of ['no','yes','wait']){
  const w=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true}).window;
  set(w,'#n',6);set(w,'#r',4);set(w,'#ov',mode);w.start();
  ok(!!q(w,'#dropsel'),mode+': Auswahl "Spieler scheidet aus" vorhanden');
  const sel=q(w,'#dropsel');sel.value='2';
  const btn=()=>qa(w,'#outc button')[0];
  btn().click();ok(/Wirklich/.test(btn().textContent),mode+': erster Klick fragt nach');
  btn().click();
  const S=JSON.parse(w.localStorage.getItem('padel-turnier-v2'));
  ok(S.out&&S.out[0]===2,mode+': Spieler 2 ausgeschieden');
  ok(/ausgeschieden/.test(q(w,'#tab').textContent),mode+': Tabelle markiert ihn');
  const open=(S.games||S.rounds[S.rounds.length-1].m).some(m=>(m.a===2||m.b===2)&&m.sa==null);
  ok(!open,mode+': keine offenen Spiele mit ihm');
  // Rest weiterspielen bis Ende
  let g=0;while(g++<80){
    if(mode==='no'){qa(w,'#cur .m').forEach(r=>{const x=r.querySelectorAll('input');if(x[0].value===''){type(w,x[0],6);type(w,x[1],3)}});const b=qa(w,'#act button').find(b=>/erstellen/.test(b.textContent));if(b&&!b.disabled)b.click();else break}
    else{qa(w,'#cur .m').forEach(r=>{const x=r.querySelectorAll('input');if(x[0].value===''){type(w,x[0],6);type(w,x[1],3)}});const b=qa(w,'#act button').find(b=>/ansetzen/i.test(b.textContent)&&!b.disabled);if(b)b.click();else if(!qa(w,'#cur .m').some(r=>r.querySelector('input').value===''))break}
  }
  const rows=qa(w,'#tab tbody tr');
  ok(/Turniersieger|Gleichstand|Entscheidungsspiele/.test(q(w,'#champ').textContent),mode+': Turnier endet ('+q(w,'#champ').textContent.replace(/\s+/g,' ').slice(0,50)+')');
  ok(/ausgeschieden/.test(rows[rows.length-1].textContent),mode+': Ausgeschiedener steht ganz unten');
  const w2=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true,beforeParse(x){x.localStorage.setItem('padel-turnier-v2',w.localStorage.getItem('padel-turnier-v2'))}}).window;
  ok(/ausgeschieden/.test(q(w2,'#tab').textContent),mode+': nach Neuladen weiter ausgeschieden');
}
console.log('Fehler:',fails,'JS-Fehler:',errs.length,errs[0]||'');
