const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(require('./paths').HTML,'utf8');
const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
const q=(w,s)=>w.document.querySelector(s),qa=(w,s)=>[...w.document.querySelectorAll(s)];
const set=(w,id,v)=>{q(w,id).value=String(v);q(w,id).dispatchEvent(new w.Event('change',{bubbles:true}))};
let f=0;const ok=(c,m)=>{if(!c)f++;console.log((c?'OK     ':'FEHLER ')+m)};
const txt=(w,s)=>q(w,s).textContent.replace(/\s+/g,' ');
const mk=()=>new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true}).window;
let w=mk();
ok(qa(w,'fieldset.grp').length===4,'4 Gruppen');
for(const id of ['n','r','c','ov','sec','lead','lim','dur','draw','brk','t0','wu'])ok(!!q(w,'#'+id)&&!!q(w,'#'+id).closest('fieldset.grp'),'#'+id+' in Gruppe');
ok(!/undefined|NaN/.test(txt(w,'#app')),'Setup ohne undefined');
// Zeitparser
const T={'18:30':'18:30','1830':'18:30','18.30':'18:30','9':'09:00','9:05':'09:05','18h30':'18:30','25:00':'','abc':'','':'','24:00':'','18:75':''};
for(const [i,o] of Object.entries(T)){set(w,'#t0',i);ok(q(w,'#t0').value===o,`Zeit "${i}" -> "${q(w,'#t0').value}" (erwartet "${o}")`)}
ok(q(w,'#t0').type==='text','Startzeit ist Textfeld (24 h)');
// Namen-Zähler
set(w,'#n',4);
ok(/0 von 4 Namen/.test(txt(w,'.names summary')),'Zähler 0 von 4: '+txt(w,'.names summary'));
const ins=qa(w,'#nf input[data-k="p"]');ins[0].value='Anna';ins[0].dispatchEvent(new w.Event('input',{bubbles:true}));
ok(/1 von 4 Namen/.test(txt(w,'.names summary')),'Zähler 1 von 4');
for(const mode of ['no','yes','wait']){
  w=mk();
  set(w,'#n',6);set(w,'#r',4);set(w,'#c',2);set(w,'#ov',mode);set(w,'#t0','1800');
  const ps=qa(w,'#nf input[data-k="p"]');['Anna','Ben','Cem','Dora','Emil','Fay'].forEach((x,i)=>{ps[i].value=x;ps[i].dispatchEvent(new w.Event('input',{bubbles:true}))});
  const cs=qa(w,'#nf input[data-k="c"]');if(cs[0]){cs[0].value='Center';cs[0].dispatchEvent(new w.Event('input',{bubbles:true}))}
  w.start();
  ok(!!q(w,'#mineSel'),mode+': Auswahl "Ich bin"');
  ok(qa(w,'#cur .crt').length>=1,mode+': Platzname fett');
  set(w,'#mineSel','0');
  const m1=txt(w,'#mine');
  ok(/Nächstes Spiel: .*Center.* ab 18:00 .* gegen/.test(m1)||/Nächstes Spiel: .*ab 18:00.*gegen/.test(m1),mode+': Nächstes Spiel Anna: '+m1);
  // Gegner stimmt mit angezeigter Paarung überein
  const rows=qa(w,'#cur .mw');const mine=rows.find(r=>/Anna/.test(r.querySelector('.m').textContent));
  const opp=mine&&mine.querySelector('.m').textContent.replace(/Anna/,'').match(/[A-Z][a-z]+/);
  ok(mine&&opp&&m1.includes(opp[0]),mode+': Gegner passt zur Spielzeile ('+(opp&&opp[0])+')');
  // Reload merkt Auswahl
  const tm=qa(w,'#plan .tm.now');ok(tm.length===1,mode+': genau eine markierte Zeile ('+tm.length+')');
  ok(/Markierte Zeile \(▶ 18:\d\d\)/.test(txt(w,'#tctl')),mode+': Satz in Zeitsteuerung: '+txt(w,'#tctl').slice(0,160));
  ok(q(w,'#tab').querySelectorAll('.xc').length>=2*7,mode+': Spalten Games/Bh markiert');
  ok(!!q(w,'#morecol'),mode+': Umschalter vorhanden');
  w.toggleCols();ok(q(w,'#tab').classList.contains('open')&&q(w,'#morecol').getAttribute('aria-expanded')==='true',mode+': aufgeklappt');
  w.toggleCols();ok(!q(w,'#tab').classList.contains('open'),mode+': zugeklappt');
  // alle Ergebnisse der aktuellen Spiele eintragen -> neue Anzeige
  const inp=qa(w,'#cur .m input');inp.forEach((e,i)=>{e.value=i%2?'3':'6';e.dispatchEvent(new w.Event('input',{bubbles:true}))});
  ok(!/undefined|NaN/.test(txt(w,'#app')),mode+': kein undefined/NaN');
  ok(/Nächstes Spiel|Noch nicht angesetzt|Alle Spiele/.test(txt(w,'#mine')),mode+': Mine nach Ergebnissen: '+txt(w,'#mine'));
}
ok(errs.length===0,'keine JS-Fehler '+errs.slice(0,2));
console.log(f?'FEHLER gesamt '+f:'ALLES OK');
