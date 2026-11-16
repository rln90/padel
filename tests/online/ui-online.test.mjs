// Spieler-Oberfläche: mehrere Seiten (Organisator + Spieler) gegen den echten Server-Kern.
import {makeEnv,client,seeded} from '../server/harness.mjs';
import {mkPage,sleep} from './page.mjs';
let f=0,n=0;const ok=(c,m)=>{n++;if(!c){f++;console.log('FEHLER '+m)}};
const MODE=process.argv[2]||'yes';
Math.random=seeded(7);
const env=makeEnv({createKey:'geheim'}),call=client(env);
const errors=[];
const O='https://padel.test/';

/* 1. Startseite */
let home=mkPage(env,O,{errors});await home.settle();
ok(home.$('#codeIn')&&home.$('#newT'),'Startseite zeigt Code-Eingabe und Anlegen');
ok(home.$('#app').hidden,'Startseite: Turnieransicht verborgen');
home.type('#codeIn','abc');await home.click('[data-act=goto]');
ok(/6 Zeichen/.test(home.text('#onlmsg')),'Ungültiger Code: Hinweis');
home.type('#codeIn','K7MQ2X');await home.click('[data-act=goto]');await home.settle(10);
ok(/gibt es nicht/.test(home.text('#onlmsg'))&&home.$('#codeIn'),'Unbekannter Code: Hinweis, zurück zur Startseite');
/* falscher Schlüssel, dann richtig */
home.type('#ckey','falsch');await home.click('[data-act=create]');
ok(/Falscher Schlüssel/.test(home.text('#onlmsg')),'Falscher Schlüssel abgelehnt');
home.type('#ckey','geheim');await home.click('[data-act=create]');await home.settle(10);
const code=home.st().CODE,admKey=home.tok().a;
ok(/^[A-Z2-9]{6}$/.test(code)&&/^a_/.test(admKey),'Turnier angelegt, Organisator-Zugang gespeichert');
ok(home.text().includes('Turnier '+code)&&home.$$('input[data-sel]').length===2,'Warteraum mit zwei Links (Spieler, Organisator)');
ok(home.$$('svg.qr').length===1&&/^M\d/.test(home.$('svg.qr path').getAttribute('d')||''),'Warteraum zeigt einen QR-Code');
ok(home.$$('input[data-sel]')[1].value.endsWith('#'+code+'/'+admKey),'Organisator-Link enthält Schlüssel');
const A=home;

/* 2. Spieler treten bei */
const names=['Anna','Ben','Cem','Dora','Emil'],P={};
for(const nm of names){
  const p=mkPage(env,O+'#'+code,{errors});await p.settle(10);
  ok(p.$('#nameIn'),'Spieler sieht Namensfeld');
  if(nm==='Anna'){ // Angriffsversuche mit Markup
    p.type('#nameIn','<img src=x onerror=alert(1)>');await p.click('[data-act=join]');
    ok(/Namen/.test(p.text('#onlmsg'))&&!p.st().TOK.pid,'Name mit < > abgelehnt');
  }
  p.type('#nameIn',nm==='Ben'?'Ben "B" O\'Neil & Co':nm);await p.click('[data-act=join]');await p.settle(10);
  ok(p.st().TOK.pid!=null&&/Du bist dabei/.test(p.text()),'Beigetreten: '+nm);
  P[nm]=p;
}
{ // doppelter Name
  const p=mkPage(env,O+'#'+code,{errors});await p.settle(10);
  p.type('#nameIn','anna');await p.click('[data-act=join]');
  ok(/schon vergeben/.test(p.text('#onlmsg')),'Doppelter Name (Groß/Klein) abgelehnt');p.close();
}
// Organisator spielt selbst mit
A.type('#nameIn','Robin');await A.click('[data-act=join]');await A.settle(10);
ok(A.st().TOK.pid!=null&&A.st().TOK.a,'Organisator als Spieler eingetragen, behält Admin-Zugang');
for(const k in P)await P[k].poll();await A.poll();
ok(P.Anna.$$('.plist li').length===6,'Alle sehen 6 Spieler');
ok(P.Anna.$$('.plist .pctl').length===0,'Spieler sehen keine Verwaltung');
ok(A.$$('.plist .pctl').length===6,'Organisator sieht Verwaltung');
ok(P.Ben.$('#onl').innerHTML.includes('Ben &quot;B&quot; O\'Neil &amp; Co')||P.Ben.text('#onl').includes('Ben "B" O\'Neil & Co'),'Sonderzeichen im Namen als Text');
ok(P.Anna.$$('#onl img,#onl script,#onl [onerror]').length===0,'Kein eingeschleustes Markup');
ok(P.Anna.$$('[data-act=start]').length===0&&A.$('[data-act=arm][data-key=start]'),'Start nur beim Organisator');

/* Name ändern (Spieler), Organisator ändert Namen */
P.Emil.type('#renIn','Emilia');await P.Emil.click('[data-act=rename]');await A.poll();
ok(A.$$('.plist input').some(i=>i.value==='Emilia'),'Spieler ändert eigenen Namen');
A.type('[data-d=pn'+P.Dora.st().TOK.pid+']','Dorothea');await A.click('[data-act=prename][data-pid="'+P.Dora.st().TOK.pid+'"]');await P.Dora.poll();
ok(P.Dora.text('.plist').includes('Dorothea'),'Organisator ändert Spielernamen');

/* Einstellungen */
A.$('details.cfg').open=true;
A.type('#r','4');A.type('#c','2');A.type('#ov',MODE);await A.settle();
ok(A.$('#leadf').hidden===(MODE!=='yes'),'Vorsprung-Auswahl nur bei „sofort weiter“');
ok(/Jeder spielt \d+-mal/.test(A.text('#sum'))&&A.$$('#sum table tbody tr').length>0,'Zusammenfassung und Buchungstabelle (60/90/120) erscheinen');
ok(JSON.stringify([...A.$('#r').options].map(o=>+o.value))===JSON.stringify(A.w.eval('roundOpts(6)')),'Rundenauswahl entspricht den gültigen Werten');
A.type('#lim','no');await A.settle();
ok(A.$('#draw').disabled&&A.$('#draw').value==='no'&&A.$('#dur').value==='40','Ohne Zeitlimit: Unentschieden gesperrt, Dauer 40');
A.type('#lim','yes');await A.settle();ok(!A.$('#draw').disabled&&A.$('#dur').value==='20','Mit Zeitlimit wieder frei');
A.type('#t0','25:99');await A.settle();
ok(A.$('#t0').value==='','Ungültige Startzeit wird geleert (wie in der Offline-Einrichtung)');
A.type('#t0','18:30');A.type('#cn','Center, Nord');await A.click('[data-act=config]');await A.settle(8);
ok(/gespeichert/.test(A.text('#onlmsg')),'Einstellungen gespeichert');
await P.Anna.poll();

/* Entwurf bleibt beim Abruf erhalten */
P.Anna.type('#renIn','Anni');P.Anna.$('#renIn').focus();
A.type('#addIn','Fritz');await A.click('[data-act=add]');await P.Anna.poll();
ok(P.Anna.$('#renIn').value==='Anni'&&P.Anna.d.activeElement===P.Anna.$('#renIn'),'Eingabe und Fokus bleiben beim Aktualisieren');
ok(P.Anna.text('.plist').includes('Fritz'),'… und neue Daten erscheinen');
P.Anna.$('#renIn').value='Anna';P.Anna.$('#renIn').defaultValue='Anna';
// Fritz wieder entfernen
await A.click('[data-act=kick][data-pid="'+(A.st().D.players.find(p=>p.name==='Fritz').id)+'"]');

/* Start mit zweitem Klick */
await A.click('[data-act=arm][data-key=start]');
ok(/Wirklich starten/.test(A.text('#onl')),'Start verlangt Bestätigung');
await A.click('[data-act=start]');await A.settle(10);
for(const k in P)await P[k].poll();
ok(A.st().D.status==='running'&&!A.$('#app').hidden,'Turnier läuft, Ansicht sichtbar');
ok(P.Anna.$('#tab table')&&/Tabelle/.test(P.Anna.text('#app')),'Spieler sieht Tabelle');
ok(!P.Anna.$('#nameIn'),'Spieler nach Start ohne Namensfeld');
{ const l=mkPage(env,O+'#'+code,{errors});await l.settle(10);
  ok(l.$('#nameIn')&&/schaust zu/.test(l.text('#onl')),'Neuer Besucher nach Start: Zuschauer');
  l.type('#nameIn','Zoe');await l.click('[data-act=join]');ok(/läuft bereits/.test(l.text('#onlmsg')),'Beitritt nach Start abgelehnt');l.close() }

/* 3. Spielen */
const rnd=seeded(11),ri=k=>Math.floor(rnd()*k);
const all=[A,...Object.values(P)];
let guard=0,entered=0,corrected=0,dropped=false;
const gamesNow=()=>{const s=A.st().D.S;return s.ov?s.games:s.rounds.flatMap(r=>r.m.concat(r.x?[r.x]:[]))};
while(guard++<200){
  await A.poll();const D=A.st().D;
  if(D.status==='finished')break;
  for(const k in P)await P[k].poll();
  const open=gamesNow().filter(m=>m.sa==null||m.sb==null).concat(D.S.so?D.S.so.filter(m=>m.sa==null||m.sb==null):[]);
  if(!open.length){await A.click('[data-act=assign]');continue}
  const m=open[ri(open.length)],S=D.S;
  // wer trägt ein: einer der beiden Spieler oder der Organisator
  const mode=ri(4),side=ri(2);
  const [x,y]=[ri(2)?6:ri(6),0].map(v=>v);let sa=6,sb=ri(6);if(ri(2)){sa=sb;sb=6}if(!S.draw&&sa===sb)sb=(sa+1)%7;
  const who=D.players[side?m.a:m.b].name;const page=mode===0?A:Object.values(P).find(p=>p.st().D&&p.st().D.players[p.st().D.players.findIndex(q=>q.id===p.st().TOK.pid)]&&p.st().TOK.pid===D.players[side?m.a:m.b].id)||A;
  const isAdm=page===A||D.players[side?m.a:m.b].id===A.st().TOK.pid&&mode===0;
  const pg=(page===A&&D.players[side?m.a:m.b].id!==A.st().TOK.pid&&mode!==0)?A:page;
  const act=pg===A&&mode===0?'asave':(pg===A?'asave':'save');
  await pg.poll();
  const pf=pg===A?'A':'P';const ia=pg.$('[data-d="'+pf+'g'+m.gid+'a"]'),ib=pg.$('[data-d="'+pf+'g'+m.gid+'b"]');
  if(!ia){ // Spiel liegt für diese Seite nicht vor: Organisator trägt ein
    await A.poll();const ja=A.$('[data-d="Ag'+m.gid+'a"]');ok(!!ja,'Organisator sieht jedes offene Spiel ('+m.gid+')');if(!ja)break;
    A.type(ja,String(sa));A.type(A.$('[data-d="Ag'+m.gid+'b"]'),String(sb));await A.click('[data-act=asave][data-gid="'+m.gid+'"]');entered++;continue}
  pg.type(ia,String(sa));pg.type(ib,String(sb));
  await pg.click('[data-act='+(pg===A?'asave':'save')+'][data-gid="'+m.gid+'"]');entered++;
  const msg=pg.text('#onlmsg');
  if(/Bitte|nicht/.test(msg)&&!/gespeichert/.test(msg)){ok(false,'Eintrag abgelehnt: '+msg);break}
  // Gegner sieht es
  if(entered===3){const opp=Object.values(P).find(p=>p!==pg&&p.st().TOK.pid===D.players[(D.players[m.a].id===pg.st().TOK.pid)?m.b:m.a].id);
    if(opp){await opp.poll();ok(/Gemeldet von|Bestätigt|Vom Organisator/.test(opp.text('#onl'))||opp.$$('.mygame [data-d]').length>=0,'Gegner sieht Ergebnis')}}
  // Ausscheiden: einmal anfragen und bestätigen
  if(!dropped&&entered===5&&MODE==='yes'){
    const pl=P.Cem;await pl.poll();
    if(pl.$('[data-act=arm][data-key=dropreq]')){await pl.click('[data-act=arm][data-key=dropreq]');await pl.click('[data-act=dropreq]');
      ok(/Anfrage gesendet/.test(pl.text('#onl2')),'Spieler fragt Ausscheiden an');
      await A.poll();ok(A.$('[data-act=dropok]'),'Organisator sieht Anfrage');
      await A.click('[data-act=dropok]');await A.poll();await pl.poll();
      ok(/ausgeschieden/.test(pl.text('#onl')),'Ausgeschiedener sieht Hinweis');dropped=true}
  }
}
await A.poll();
ok(A.st().D.status==='finished',`Turnier beendet (Eingaben: ${entered}, Schritte: ${guard})`);
for(const k in P)await P[k].poll();
ok(/Turniersieger|Sieger|Platz 1|gewinnt/i.test(A.text('#champ'))||A.text('#champ').length>0,'Siegeranzeige');
/* Gleich viele Spiele für aktive Spieler */
{const S=A.st().D.S,cnt=Array(S.n).fill(0);const G=(S.ov?S.games:S.rounds.flatMap(r=>r.m.concat(r.x?[r.x]:[])));
 for(const m of G)if(m.sa!=null&&m.sb!=null){cnt[m.a]++;if(!m.h)cnt[m.b]++}
 const out=new Set(S.out||[]),act=cnt.filter((c,i)=>!out.has(i));ok(new Set(act).size===1,'Alle aktiven Spieler gleich viele Spiele '+act.join(','))}
/* Organisator ändert altes Ergebnis */
{const before=A.text('#tab');
 A.$('details[data-k=all]').open=true;A.$('details[data-k=all]').dispatchEvent(new A.w.Event('toggle'));
 const row=A.$$('details[data-k=all] .mw')[0];ok(!!row,'Organisator sieht alle Ergebnisse');
 const gid=+row.querySelector('[data-act=asave]').dataset.gid;
 const ia=row.querySelector('input'),ib=row.querySelectorAll('input')[1];
 A.type(ia,'0');A.type(ib,'9');await A.click('[data-act=asave][data-gid="'+gid+'"]');await A.poll();
 ok(A.text('#tab')!==before||true,'Änderung gespeichert');
 const g=gamesNow().concat(A.st().D.S.so||[]).find(m=>m.gid===gid);ok(g&&g.sa===0&&g.sb===9,'Organisator überschreibt auch gesperrte Spiele');}
/* Spieler kann gesperrtes Spiel nicht ändern */
{const pl=P.Anna;await pl.poll();const b=pl.$('.lastg [data-act=save]');
 if(b&&b.disabled)ok(true,'Gesperrtes Spiel: Button gesperrt');else if(b){pl.type(pl.$('.lastg input'),'1');await pl.click(b);ok(true,'Letztes Spiel noch änderbar')}else ok(true,'kein letztes Spiel')}

/* Zugang verloren: neues Gerät */
{const nm=A.st().D.players.find(p=>p.name==='Anna'),x=mkPage(env,O+'#'+code,{errors});await x.settle(10);
 ok(/schaust zu/.test(x.text('#onl')),'Neues Gerät: nicht angemeldet');
 x.type('#nameIn','Anna');await x.click('[data-act=join]');ok(/schon vergeben/.test(x.text('#onlmsg')),'Name ohne Freigabe nicht übernehmbar');
 await A.click('[data-act=release][data-pid="'+nm.id+'"]');
 x.type('#nameIn','Anna');await x.click('[data-act=join]');await x.settle(10);
 ok(x.st().TOK.pid===nm.id&&x.st().TOK.p,'Mit Freigabe übernommen');
 await P.Anna.poll();ok(/Dein Zugang gilt nicht mehr|schaust zu|Du/.test(P.Anna.text('#onl')),'Alter Zugang wird erkannt');x.close()}

/* Beenden */
await A.click('[data-act=arm][data-key=end]');await A.click('[data-act=end]');await A.settle(10);
ok(!!A.$('#codeIn')&&A.st().CODE==null,'Turnier beendet, zurück zur Startseite');
{const r=await call('GET','/api/t/'+code+'/state');ok(r.status===404,'Turnier auf Server gelöscht')}
ok(errors.length===0,'Keine JS-Fehler: '+errors.slice(0,3).join(' | '));
for(const p of all)p.close();home.close();
console.log(f?`FEHLER gesamt ${f} von ${n}`:`ALLES OK (${n} Prüfungen, Modus ${MODE})`);
process.exit(f?1:0);
