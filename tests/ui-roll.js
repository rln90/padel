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
const btn=w=>q(w,'#act button:not(.quiet):not(.danger)');

// A: Einrichtung
{
  const w=boot();setSel(w,'#n',9);setSel(w,'#c',3);setSel(w,'#r',4);
  const t0=q(w,'#sum').textContent;
  ok(/Mit überlappenden Runden wären es nur 6 Zeitblöcke/.test(t0),'Nein-Modus nennt Ersparnis: '+(t0.match(/Mit überlappenden[^.]*\./)||[''])[0]);
  const classicBlocks=+(t0.match(/(\d+) Zeitblöcke zu/)||[0,0])[1];
  setSel(w,'#ov','yes');
  const t1=q(w,'#sum').textContent;
  ok(/6 Zeitblöcke zu/.test(t1)&&/Ohne Überlappung wären es 8 Zeitblöcke/.test(t1),'Ja-Modus: 6 statt '+classicBlocks+' Blöcke');
  ok(qa(w,'#plan .cell.ghost').length===18,'Vorschau: 18 anonyme Spiele ('+qa(w,'#plan .cell.ghost').length+')');
  ok(qa(w,'#plan .tm').length===1+6,'Vorschau: 6 Zeilen');
}
// B: kompletter Ablauf, zufällige Reihenfolge
function play(n,c,r,lim,seed){
  const w=boot();setSel(w,'#n',n);setSel(w,'#c',c);setSel(w,'#r',r);setSel(w,'#ov','yes');
  if(lim)setSel(w,'#lim','no');
  w.start();
  let guard=0,maxOpen=0,viol=0;
  while(guard++<400){
    // Konsistenz: kein Spieler in zwei offenen Spielen, Plätze eindeutig
    const S=JSON.parse(w.localStorage.getItem('padel-turnier-v2'));
    const open=S.games.filter(m=>!(Number.isInteger(m.sa)&&Number.isInteger(m.sb)&&(S.draw||m.sa!==m.sb)));
    const ps=open.flatMap(m=>[m.a,m.b]);if(new Set(ps).size!==ps.length)viol++;
    const cs=open.map(m=>m.c);if(new Set(cs).size!==cs.length)viol++;
    maxOpen=Math.max(maxOpen,open.length);
    const rows=qa(w,'#cur .m').filter(r=>{const i=r.querySelectorAll('input');return i[0].value===''||i[1].value===''});
    const b=btn(w);
    if(b&&!b.disabled&&(rows.length===0||Math.random()<.4)){b.click();continue}
    if(!rows.length)break;
    const row=rows[Math.floor(Math.random()*rows.length)],x=row.querySelectorAll('input');
    let a=Math.floor(Math.random()*7),bb=Math.floor(Math.random()*7);if(a===bb)bb=a+1;
    typeScore(w,x[0],a);typeScore(w,x[1],bb);
  }
  return {w,viol,maxOpen};
}
{
  const {w,viol,maxOpen}=play(9,3,4);
  const S=JSON.parse(w.localStorage.getItem('padel-turnier-v2'));
  const g=Array(9).fill(0);S.games.forEach(m=>{g[m.a]++;g[m.b]++});
  ok(S.games.length===18&&g.every(x=>x===4),'9 Spieler/3 Plätze: 18 Spiele, jeder 4 ('+g+')');
  ok(viol===0,'nie ein Spieler/Platz doppelt belegt');
  ok(maxOpen<=3,'höchstens 3 Spiele gleichzeitig ('+maxOpen+')');
  ok(!!q(w,'#champ .champ'),'Sieger/Gleichstand angezeigt: '+q(w,'#champ').textContent.slice(0,50));
  const sp=qa(w,'#tab tbody tr').map(r=>r.children[2].textContent);
  ok(sp.every(x=>x==='4'),'Tabelle: alle 4 Spiele');
  ok(/Alle Spiele gespielt/.test(q(w,'#act').textContent),'Status: Alle Spiele gespielt');
  const rem=new Set();let re=0;S.games.forEach(m=>{const k=[m.a,m.b].sort()+'';if(rem.has(k))re++;rem.add(k)});
  console.log('       Rematches:',re);
  // Verlauf ist schreibgeschützt
  ok(qa(w,'#hist input').length===0,'Bisherige Runden: keine Eingabefelder (gesperrt)');
  ok(qa(w,'#hist details').length>=2&&qa(w,'#cur .m').length>=1,'Verlauf: abgeschlossene Runden gesperrt, jüngster Block im Eingabebereich');
  // Neu laden
  const html2=w.document.documentElement.outerHTML;
  const w2=boot(w.localStorage.getItem('padel-turnier-v2'));
  ok(/Alle Spiele gespielt/.test(q(w2,'#act').textContent)&&qa(w2,'#tab tbody tr').length===9,'Neuladen stellt den Stand wieder her');
  // Zurücksetzen
  q(w2,'#topbtns button').click();q(w2,'#topbtns button').click();
  ok(!!q(w2,'#n'),'Zurücksetzen führt zur Einrichtung');
}
// C: viele Konfigurationen
for(const [n,c,r] of [[9,2,6],[8,4,5],[12,3,4],[7,3,4],[24,6,3],[5,2,4],[4,2,3],[16,8,6],[10,5,9]]){
  let bad=0,v=0;
  for(let i=0;i<8;i++){
    const {w,viol}=play(n,c,r);
    const S=JSON.parse(w.localStorage.getItem('padel-turnier-v2'));
    const g=Array(n).fill(0);S.games.forEach(m=>{g[m.a]++;g[m.b]++});
    if(!g.every(x=>x===r)||!/Alle Spiele gespielt/.test(q(w,'#act').textContent))bad++;
    v+=viol;
  }
  ok(bad===0&&v===0,`n=${n}, ${c} Plätze, ${r} Spiele: 8 Läufe vollständig und konsistent`);
}
// D: Nachrücken, Rückgängig, Unentschieden
{
  const w=boot();setSel(w,'#n',9);setSel(w,'#c',3);setSel(w,'#ov','yes');setSel(w,'#draw','no');w.start();
  ok(qa(w,'#cur .m').length===3,'Start: 3 Spiele auf 3 Plätzen');
  ok(btn(w).disabled,'Ansetzen deaktiviert, solange alle Plätze belegt');
  ok(/Wartende Spieler: /.test(q(w,'#cur').textContent),'Wartende Spieler angezeigt: '+q(w,'#cur .wait').textContent);
  const r0=qa(w,'#cur .m')[0].querySelectorAll('input');
  typeScore(w,r0[0],3);typeScore(w,r0[1],3);
  ok(btn(w).disabled,'3:3 ohne Unentschieden zählt nicht als beendet');
  typeScore(w,r0[1],4);
  ok(!btn(w).disabled&&/Platz frei/.test(q(w,'#act').textContent),'Nach Ergebnis: Platz frei, Ansetzen aktiv ('+q(w,'#act .status').textContent+')');
  ok(qa(w,'#cur .m').length===3,'Beendetes Spiel bleibt bis zum Ansetzen sichtbar (Tippfehler korrigierbar)');
  const S0=JSON.parse(w.localStorage.getItem('padel-turnier-v2'));
  const freed=S0.games[0];
  btn(w).click();
  const S1=JSON.parse(w.localStorage.getItem('padel-turnier-v2'));
  ok(S1.games.length===4&&S1.games[3].c===freed.c,'Neues Spiel auf dem freigewordenen Platz '+(freed.c+1));
  ok(qa(w,'#cur .m').filter(r=>{const i=r.querySelectorAll('input');return i[0].value===''}).length===3,'Danach wieder 3 laufende Spiele (beendete der Runde bleiben sichtbar)');
  ok(!!q(w,'#act .quiet'),'Nach zweiter Ansetzung: Zurück-Knopf vorhanden');
  // Runde 2 beginnen lassen
  const setAll=()=>qa(w,'#cur .m').forEach(r=>{const i=r.querySelectorAll('input');if(i[0].value===''){typeScore(w,i[0],6);typeScore(w,i[1],2)}});
  setAll();btn(w).click();setAll();btn(w).click();setAll();btn(w).click();
  const tags=qa(w,'#cur .tag').map(t=>t.textContent);
  const SS=JSON.parse(w.localStorage.getItem('padel-turnier-v2'));
  const I=w.rollInfo(SS.games,9),mx=Math.max(...I.map(f=>f.r));
  ok(mx>=2&&!!q(w,'#act .quiet')&&q(w,'#act .quiet').textContent==='Letzte Ansetzung zurücknehmen','Zurück-Knopf nennt die Vorrunde: '+(q(w,'#act .quiet')||{}).textContent);
  const nBefore=SS.games.length,KK=Math.max(...SS.games.map(m=>m.k)),keep=SS.games.filter(m=>m.k<KK).length;
  q(w,'#act .quiet').click();
  if(q(w,'#act .danger'))q(w,'#act .danger').click();
  const S3=JSON.parse(w.localStorage.getItem('padel-turnier-v2')),I3=w.rollInfo(S3.games,9);
  ok(S3.games.length===keep&&Math.max(...S3.games.map(m=>m.k))===KK-1,'Zurück: jüngster Block verworfen ('+nBefore+' -> '+S3.games.length+' Spiele)');
  ok(qa(w,'#cur .m').length>=1&&/Runde /.test(q(w,'#rh').textContent),'Vorrunde im Eingabebereich: '+q(w,'#rh').textContent);
  const done1=qa(w,'#cur .m').filter(r=>{const i=r.querySelectorAll('input');return i[0].value!==''&&i[1].value!==''}).length;
  ok(done1>0,'Beendete Spiele der Vorrunde wieder korrigierbar ('+done1+')');
}
console.log(errors.length?'JS-FEHLER: '+errors.slice(0,3).join(' | '):'Keine JavaScript-Fehler.');
console.log(fails+' Prüfung(en) fehlgeschlagen');
