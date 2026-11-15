const setNames=(w,l)=>{const ins=[...w.document.querySelectorAll('#nf input[data-k="p"]')];ins.forEach(i=>{i.value='';i.dispatchEvent(new w.Event('input',{bubbles:true}))});l.forEach((v,i)=>{if(ins[i]){ins[i].value=v;ins[i].dispatchEvent(new w.Event('input',{bubbles:true}))}})};
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('fs');
const html=fs.readFileSync(require('./paths').HTML,'utf8');
const errors=[];let fails=0;
function boot(pre){
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',e=>errors.push(String(e)));
  return new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true,beforeParse(w){if(pre)w.localStorage.setItem('padel-turnier-v2',pre)}}).window;
}
const q=(w,s)=>w.document.querySelector(s),qa=(w,s)=>[...w.document.querySelectorAll(s)];
const typeScore=(w,i,v)=>{i.value=String(v);i.dispatchEvent(new w.Event('input',{bubbles:true}))};
const ok=(c,m)=>{if(!c)fails++;console.log((c?'OK     ':'FEHLER ')+m)};
const setSel=(w,id,v)=>{const e=q(w,id);e.value=String(v);e.dispatchEvent(new w.Event('change',{bubbles:true}))};
const fill=(w,f)=>qa(w,'#cur .m').forEach((r,i)=>{const x=r.querySelectorAll('input');const [a,b]=f(i);typeScore(w,x[0],a);typeScore(w,x[1],b)});
const prim=w=>q(w,'#act button:not(.quiet):not(.danger)');
const optVals=(w,id)=>qa(w,id+' option').map(o=>+o.value);

// A: Auswahl
{
  const w=boot();
  const n=optVals(w,'#n');ok(n[0]===4&&n[n.length-1]===24&&n.length===21,'Spieler: 4 bis 24 ('+n.length+' Optionen)');
  let r=optVals(w,'#r');ok(r[0]===4&&r.every(x=>x%2===0)&&q(w,'#r').value==='4','9 Spieler: Runden nur gerade ab 4 ['+r.slice(0,4)+' …], Standard 4');
  ok(/18 Spiele/.test(q(w,'#sum').textContent),'Zusammenfassung: '+q(w,'#sum').textContent.slice(0,60));
  setSel(w,'#n',8);r=optVals(w,'#r');ok(r[0]===3&&r.includes(5),'8 Spieler: Runden ab 3, auch ungerade');
  setSel(w,'#r',5);setSel(w,'#n',9);ok(q(w,'#r').value==='6','Wechsel 8 -> 9 Spieler: 5 Runden werden zu 6 ('+q(w,'#r').value+')');
  setSel(w,'#n',4);setSel(w,'#r',20);ok(/nicht vermeiden/.test(q(w,'#sum').textContent),'Hinweis bei mehr Runden als Gegnern');
}
// B: kompletter Ablauf 9 Spieler, 4 Runden, Unentschieden
{
  const w=boot();setSel(w,'#n',9);w.start();
  ok(/Runde 1 von 4/.test(q(w,'#rh').textContent),'Start: '+q(w,'#rh').textContent);
  for(let r=1;r<=4;r++){
    const rows=qa(w,'#cur .m').length;
    ok(rows===(r%2===0?5:4)&&(/Zusatzspiel/.test(q(w,'#cur').textContent)===(r%2===0)),`Runde ${r}: ${rows} Zeilen`);
    if(r<4)ok(prim(w).disabled===true,`Runde ${r}: Button gesperrt bis alle Ergebnisse da`);
    fill(w,i=>i%3===0?[5,5]:(i%2?[6,4]:[3,6]));
    ok(/\d von \d Ergebnissen/.test(q(w,'#prog').textContent)&&!/offen/.test(q(w,'#act .status').textContent),`Runde ${r}: Fortschritt "${q(w,'#prog').textContent}"`);
    if(r<4){ok(!prim(w).disabled&&/Runde \d erstellen/.test(prim(w).textContent),'Button: '+prim(w).textContent);prim(w).click()}
  }
  const rows=qa(w,'#tab tbody tr');
  ok(rows.length===9&&rows.every(t=>t.children[2].textContent==='4'),'Tabelle: 9 Zeilen, alle 4 Spiele');
  ok(!!q(w,'#champ .champ'),'Anzeige: '+q(w,'#champ').textContent.replace(/\s+/g,' '));
  ok(qa(w,'#hist details').length===3&&!q(w,'#histc').hidden,'Verlauf mit 3 Runden');
  ok(qa(w,'#tab th').length===10,'Spalten inkl. U und Buchholz');
  // Undo mit Absicherung
  q(w,'#act .quiet').click();if(q(w,'#act .danger'))q(w,'#act .danger').click();ok(/Runde 3 von 4/.test(q(w,'#rh').textContent),'Zurück zu Runde 3 (Runde 4 hatte Eingaben, aber aktuelle Anzeige: '+q(w,'#rh').textContent+')');
}
// C: Undo mit/ohne Eingaben
{
  const w=boot();w.start();
  fill(w,()=>[6,4]);prim(w).click();
  ok(/Runde 2 von/.test(q(w,'#rh').textContent),'In Runde 2');
  q(w,'#act .quiet').click();
  ok(/Runde 1 von/.test(q(w,'#rh').textContent),'Ohne Eingaben: sofort zurück zu Runde 1');
  prim(w).click();fill(w,(i)=>i===0?[6,4]:[null,null].map(()=>''));
  const b=q(w,'#act .quiet');b.click();
  ok(/Runde 2 von/.test(q(w,'#rh').textContent)&&/wirklich verwerfen/.test(q(w,'#act .danger').textContent),'Mit Eingaben: erst Rückfrage ("'+q(w,'#act .danger').textContent+'")');
  q(w,'#act .danger').click();ok(/Runde 1 von/.test(q(w,'#rh').textContent),'Zweiter Klick verwirft');
  q(w,'#topbtns button').click();ok(/Wirklich/.test(q(w,'#topbtns button').textContent),'Zurücksetzen fragt nach');
  q(w,'#topbtns button').click();ok(!!q(w,'#n'),'Zurücksetzen führt zur Einrichtung');
}
// D: ohne Unentschieden
{
  const w=boot();setSel(w,'#n',4);setSel(w,'#r',3);setSel(w,'#draw','no');w.start();
  fill(w,()=>[5,5]);ok(prim(w).disabled&&/offen/.test(q(w,'#act .status').textContent),'5:5 bleibt offen ('+q(w,'#act .status').textContent+')');
  ok(qa(w,'#tab th').length===9&&!/Unentschieden/.test(q(w,'#leg').textContent),'Keine U-Spalte');
  fill(w,()=>[6,4]);ok(!prim(w).disabled,'Nach 6:4 freigegeben');
}
// E: Namen
{
  const w=boot();setSel(w,'#n',4);
  setNames(w,['Anna','anna']);
  ok(q(w,'#nh').classList.contains('err'),'Doppelter Name: '+q(w,'#nh').textContent);
  w.start();ok(!!q(w,'#n'),'Start bei doppeltem Namen blockiert');
  setNames(w,['B']);
  ok(/1 von 4 Namen/.test(q(w,'#nh').textContent),'Hinweis: '+q(w,'#nh').textContent);
  w.start();const nm=JSON.parse(w.localStorage.getItem('padel-turnier-v2')).names;
  ok(new Set(nm).size===4&&nm[0]==='B','Auffüllen ohne Kollision: '+nm);
}
// F: Gleichstand, geteilter Platz, Enter-Taste
{
  const w=boot();setSel(w,'#n',4);setSel(w,'#r',3);w.start();
  const ins=qa(w,'#cur .m input');ins[0].focus();
  ins[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  ok(w.document.activeElement===ins[1],'Enter springt ins nächste Feld');
  for(let r=1;r<=3;r++){fill(w,()=>[4,4]);if(r<3)prim(w).click()}
  ok(/Entscheidungsspiele/.test(q(w,'#champ').textContent)&&qa(w,'#so .m').length===6,'Gleichstand: Entscheidungsspiele nötig ('+qa(w,'#so .m').length+' Spiele)');
  qa(w,'#so .m').forEach(r=>{const x=r.querySelectorAll('input');typeScore(w,x[0],4);typeScore(w,x[1],4)});
  ok(/Gleichstand an der Spitze/.test(q(w,'#champ').textContent),'Gleichstand nach Entscheidungsspielen: '+q(w,'#champ').textContent.slice(0,60));
  ok(qa(w,'#tab tbody tr').every(t=>t.children[0].textContent==='1'),'Alle teilen Platz 1');
}
// G: kaputter Speicherstand
{
  const w=boot('{"bad":1}');ok(!!q(w,'#n'),'Ungültiger Speicherstand führt zur Einrichtung');
}

// H: Zeitplanung
{
  const w=boot();setSel(w,'#n',9);setSel(w,'#r',4);
  const ev=e=>w.eval(e);
  ok(ev('plan(9,4,4,20,5).total')===145&&ev('plan(9,4,4,20,5).waves')===6,'9 Spieler, 4 Plätze, 4 Runden: 6 Blöcke, 145 min');
  ok(ev('plan(9,4,1,20,5).waves')===18,'1 Platz: 18 Blöcke = 18 Spiele');
  ok(ev('plan(8,3,4,20,5).total')===70,'8 Spieler, 4 Plätze, 3 Runden: 70 min');
  ok(optVals(w,'#c').join()==='1,2,3,4','Plätze 1 bis 4 bei 9 Spielern');
  setSel(w,'#c',4);ok(/2 h 25 min/.test(q(w,'#sum').textContent)&&/8 Spieler, 1 pausieren/.test(q(w,'#sum').textContent),'Zusammenfassung: '+q(w,'#sum').textContent.slice(0,150));
  setSel(w,'#c',2);ok(/4 h 5 min/.test(q(w,'#sum').textContent)&&/4 Spieler, 5 pausieren/.test(q(w,'#sum').textContent),'2 Plätze: 4 h 5 min, 4 spielen, 5 warten');
  ok(qa(w,'#ptab tr.cmp1').length===4&&q(w,'#ptab tr.sel.cmp1 td').textContent==='2 Plätze','Tabelle nach Platzzahl, Auswahl markiert');
  setSel(w,'#n',24);ok(optVals(w,'#c').length===12,'24 Spieler: bis 12 Plätze');
  setSel(w,'#n',9);
  setSel(w,'#lim','no');
  ok(q(w,'#draw').disabled&&q(w,'#draw').value==='no'&&q(w,'#dur').value==='40'&&/Geschätzte Dauer/.test(q(w,'#durl').textContent),'Ohne Zeitlimit: Unentschieden gesperrt, Label "'+q(w,'#durl').textContent+'"');
  setSel(w,'#lim','yes');ok(!q(w,'#draw').disabled&&q(w,'#draw').value==='yes'&&q(w,'#dur').value==='20','Mit Zeitlimit: Unentschieden wieder wählbar');
  setSel(w,'#lim','no');setSel(w,'#c',3);w.start();
  const s=JSON.parse(w.localStorage.getItem('padel-turnier-v2'));
  ok(s.lim===false&&s.draw===false&&s.courts===3&&s.dur===40&&s.brk===5,'Gespeichert: '+JSON.stringify({lim:s.lim,draw:s.draw,courts:s.courts,dur:s.dur,brk:s.brk}));
  ok(/3 Plätze, ohne Zeitlimit, geplant ca\./.test(q(w,'#tl').textContent),'Untertitel: '+q(w,'#tl').textContent);
  ok(!/Gespielt wird/.test(q(w,'#cur').textContent),'Kein Zeitlimit-Hinweis ohne Limit');
}
{
  const w=boot();setSel(w,'#n',8);setSel(w,'#r',3);setSel(w,'#dur',30);w.start();
  ok(!/Gespielt wird/.test(q(w,'#cur').textContent),'Kein Hinweis zur Spielzeit mehr in der Runde');
}

// I: Pausenzeiten, Buchung, Spielplan
{
  const w=boot();setSel(w,'#n',9);setSel(w,'#r',4);
  ok(optVals(w,'#brk').join()==='0,1,2,3,4,5,10,15,20','Pausenzeiten: '+optVals(w,'#brk').join(','));
  setSel(w,'#c',4);
  {const rr=qa(w,'#sum tbody tr').map(t=>[...t.children].map(c=>c.textContent).join(' / '));ok(rr.length===2&&rr[0]==='Platz 1 / 2 h 30 min / 90 + 60 min'&&rr[1]==='Platz 2 bis 4 / 2 h / 120 min','Buchung 4 Plätze: '+rr.join(' | '))}
  ok(!/Platzzeit/.test(w.document.body.textContent),'"Platzzeit" ist entfernt');
  {const t=qa(w,'#ptab tr.cmp2').pop().textContent;ok(t==='Buchung: Platz 1: 2 h 30 min · Platz 2 bis 4: 2 h','Vergleich nutzt dieselbe Benennung wie die Buchungstabelle: '+t)}
  setSel(w,'#c',2);
  ok(qa(w,'#plan .cell').length===18&&qa(w,'#plan .cell.ghost').length===18,'Vorschau: 18 anonyme Felder (2 Plätze)');
  ok(qa(w,'#plan .rh').length===4&&/Pause: 1 Spieler/.test(q(w,'#plan').textContent),'4 Runden-Köpfe mit Pause-Hinweis');
  ok(qa(w,'#plan .ph').length===2&&qa(w,'#plan .tm').length===11,'2 Plätze, 10 Zeitzeilen + Kopf');
  ok(/0:00/.test(q(w,'#plan').textContent)&&/3:45/.test(q(w,'#plan').textContent),'Zeiten von 0:00 bis 3:45');
  ok(!/Anna|Ben/.test(q(w,'#plan').textContent),'Vorschau anonym');
  setSel(w,'#c',2);setNames(w,'Anna, Ben, Clara, David, Eva, Felix, Greta, Hanna, Ivo'.split(', '));
  w.start();
  ok(qa(w,'#plan .cell:not(.ghost)').length===4&&qa(w,'#plan .cell.ghost').length===14,'Nach Start: Runde 1 gefüllt (4), Rest anonym (14)');
  ok(qa(w,'#plan .cell.cur').length===4&&/Pause: \w+/.test(q(w,'#plan .rh span').textContent)&&!/1 Spieler/.test(q(w,'#plan .rh span').textContent),'Aktuelle Runde hervorgehoben, Pause mit Namen: '+q(w,'#plan .rh span').textContent);
  fill(w,i=>[6,i]);
  ok(qa(w,'#plan .pl.w').length===4&&/6/.test(q(w,'#plan .cell').textContent),'Ergebnisse und Sieger erscheinen im Plan');
  prim(w).click();
  ok(qa(w,'#plan .cell:not(.ghost)').length===4+5&&qa(w,'#plan .cell.cur').length===5,'Runde 2 gefüllt: 4 Spiele + Zusatzspiel');
  const xcell=qa(w,'#plan .cell').find(c=>/Zusatzspiel/.test(c.textContent));
  const cells=qa(w,'#plan .cell');const x2=cells.indexOf(xcell);
  const pv=JSON.parse(w.localStorage.getItem('padel-turnier-v2')).rounds[1].x.a;
  const nm=JSON.parse(w.localStorage.getItem('padel-turnier-v2')).names[pv];
  const idx=cells.findIndex((c,i)=>i>=4&&c.textContent.includes(nm)&&!/Zusatzspiel/.test(c.textContent));
  ok(idx>=4&&idx<x2,'Zusatzspiel liegt nach dem regulären Spiel von '+nm+' (Zelle '+idx+' vor '+x2+')');
}
console.log(errors.length?'JS-FEHLER: '+errors.join(' | '):'Keine JavaScript-Fehler.');
console.log(fails?fails+' Prüfung(en) fehlgeschlagen':'Alle Prüfungen bestanden.');
