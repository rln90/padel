// Komfort für Spieler: Mein Stand, Meine Spiele, Hinweis bei neuem Spiel, Endstand teilen.
import {makeEnv,client,seeded} from '../server/harness.mjs';
import {mkPage} from './page.mjs';
let f=0,n=0;const ok=(c,m,x)=>{n++;if(!c){f++;console.log('FEHLER '+m,x===undefined?'':JSON.stringify(x))}};
Math.random=seeded(11);
const env=makeEnv({createKey:'geheim'}),call=client(env),errors=[],O='https://padel.test/';
const cr=await call('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{cfg:{R:4,courts:2,ov:'no',auto:'reported'}}});
const code=cr.json.code,adm=cr.json.adminKey,T='/api/t/'+code;
const names=['Anna','Ben "B" O\'Neil & Co','Cem','Dóra','Emil'],P={};
for(const nm of names){const p=mkPage(env,O+'#'+code,{errors});await p.settle(10);p.type('#nameIn',nm);await p.click('[data-act=join]');await p.settle(10);P[nm]=p}
const V=async()=>(await call('GET',T+'/state',{token:adm})).json;
const gamesOf=S=>S.rounds.flatMap(r=>r.m.concat(r.x?[r.x]:[]));
await call('POST',T+'/admin/start',{token:adm});
for(const nm of names)await P[nm].poll();
let v=await V(),S=v.S;
const g1=gamesOf(S).filter(m=>m.sa==null),inG=new Set(g1.flatMap(m=>[m.a,m.b])),idx=nm=>S.names.indexOf(nm);
// 1. Hinweis auf das erste Spiel (Seite war schon im Warteraum)
for(const nm of names){const p=P[nm],has=inG.has(idx(nm));
  ok(!!p.$('.newgame')===has,'Erstes Spiel: Hinweis '+(has?'sichtbar':'nicht sichtbar')+' für '+nm);
  ok(has===/^● /.test(p.d.title),'Titel '+(has?'mit':'ohne')+' Markierung bei '+nm,p.d.title);
  ok(/Noch kein Spiel gespielt/.test(p.text('.mygame')),'Stand vor dem ersten Ergebnis: '+nm);
  ok(!has||/Meine Spiele \(1\)/.test(p.text('.mygame')),'Meine Spiele (1) bei '+nm)}
const A=P['Anna'],a=idx('Anna');
if(inG.has(a)){const opp=S.names[g1.find(m=>m.a===a||m.b===a).a===a?g1.find(m=>m.a===a||m.b===a).b:g1.find(m=>m.a===a||m.b===a).a];
  ok(A.text('.newgame').includes(opp),'Hinweis nennt den Gegner ('+opp+')');
  await A.click('.newgame [data-act=seen]');ok(!A.$('.newgame')&&!/^● /.test(A.d.title),'OK schließt den Hinweis und stellt den Titel zurück')}
// 2. Neuladen: kein Hinweis auf bekannte Spiele
{const tok=A.w.localStorage.getItem('padel-online-'+code);const R=mkPage(env,O+'#'+code,{errors,store:{['padel-online-'+code]:tok}});await R.settle(12);
  ok(!R.$('.newgame'),'Nach Neuladen kein Hinweis auf bekannte Spiele');R.close()}
// 3. Ergebnisse eintragen, nächste Runde ansetzen, neuer Hinweis
const score=(i)=>[6,i%5];
async function playOpen(){const v=await V(),open=gamesOf(v.S).concat(v.S.so||[]).filter(m=>m.sa==null||m.sb==null);let i=0;for(const m of open){const [x,y]=score(m.gid);await call('POST',T+'/admin/result',{token:adm,body:{gid:m.gid,sa:x,sb:y}});i++}return open.length}
await playOpen();await call('POST',T+'/admin/assign',{token:adm});
for(const nm of names)await P[nm].poll();
v=await V();S=v.S;
const open2=gamesOf(S).filter(m=>m.sa==null||m.sb==null),in2=new Set(open2.flatMap(m=>[m.a,m.b]));
ok(open2.length>0,'Runde 2 angesetzt',open2.length);
for(const nm of names){const p=P[nm],has=in2.has(idx(nm));ok(!!p.$('.newgame')===has,'Runde 2: Hinweis '+(has?'sichtbar':'nicht sichtbar')+' für '+nm)}
// 4. Stand und Meine Spiele stimmen mit der Tabelle überein
for(const nm of names){const p=P[nm],r=p.w.ranking().find(x=>x.i===idx(nm));
  const t=p.text('.mygame .stand');ok(r.g===0?/Noch kein Spiel/.test(t):(t.includes('Platz '+r.rk+' von 5')&&t.includes(r.p+' Punkt')&&t.includes('Games '+r.gf+':'+r.ga)),'Mein Stand stimmt mit Tabelle: '+nm,t)}
{const p=P['Cem'],mi=idx('Cem');const det=p.$('details[data-k=mine]');ok(!!det,'Meine Spiele vorhanden');
  const mine=gamesOf(S).filter(m=>m.a===mi||m.b===mi),doneN=mine.filter(m=>m.sa!=null&&m.sb!=null);
  ok(p.$$('details[data-k=mine] li').length===mine.length,'Eine Zeile je eigenem Spiel ('+mine.length+')');
  for(const m of doneN){const x=m.a===mi?m.sa:m.sb,y=m.a===mi?m.sb:m.sa;ok(p.text('details[data-k=mine]').includes(x+':'+y+' '+(x>y?'Sieg':x<y?'Niederlage':'Unentschieden')),'Ergebnis '+x+':'+y+' richtig bewertet')}
  ok(p.$$('details[data-k=mine] li .mr').some(e=>/offen/.test(e.textContent))||mine.every(m=>m.sa!=null),'Offenes Spiel als „offen“ markiert')}
{const p=P['Anna'];const h=p.$('.mygame').innerHTML;ok(!/<img|onerror|<script/.test(h),'Namen nur als Text');
  ok(p.$$('.mygame details li *').every(e=>!/^(IMG|SCRIPT|IFRAME)$/.test(e.tagName)),'Keine fremden Elemente in „Meine Spiele“')}
// 5. Turnier zu Ende spielen
let guard=0;while((await V()).status!=='finished'&&guard++<30){await playOpen();await call('POST',T+'/admin/assign',{token:adm})}
v=await V();ok(v.status==='finished','Turnier beendet ('+v.status+')');
for(const nm of names)await P[nm].poll();
{const p=P['Dóra'];ok(!!p.$('.panel.final')&&/Turnier beendet/.test(p.text('.panel.final')),'Endstand-Feld erscheint');
  ok(!p.$('.newgame')&&!/^● /.test(p.d.title),'Nach Turnierende kein Hinweis');
  const rk=p.w.ranking();ok(p.text('.panel.final').includes('1. '+rk[0].nm.replace(/\s+/g,' ')),'Sieger im Endstand-Feld');
  await p.click('[data-act=share]');const clip=p.w.__clip||'';
  ok(/^Padel-Turnier, Endstand\n1\. /.test(clip)&&clip.split('\n').length===5+2,'Teilen ohne Teilen-Funktion: Text in Zwischenablage ('+clip.split('\n').length+' Zeilen)');
  ok(clip.includes(O+'#'+code)&&!/a_|p_/.test(clip.split('\n').pop()),'Link ohne Zugangsschlüssel');
  ok(rk.every(r=>clip.includes(r.rk+'. '+r.nm+': '+r.p+' Pkt')),'Alle Plätze im Text');
  ok(/kopiert/.test(p.text('#onlmsg')),'Bestätigung „kopiert“');
  let shared=null;p.w.navigator.share=async d=>{shared=d};await p.click('[data-act=share]');
  ok(shared&&/Endstand/.test(shared.text)&&shared.title,'Teilen mit Teilen-Funktion des Geräts');
  p.w.navigator.share=async()=>{const e=new Error('x');e.name='AbortError';throw e};p.w.__clip=null;await p.click('[data-act=share]');ok(p.w.__clip===null,'Abbruch beim Teilen kopiert nichts');}
{const o=mkPage(env,O+'#'+code,{errors});await o.settle(12);ok(!!o.$('.panel.final')&&!o.$('.mygame'),'Zuschauer sieht Endstand, kein „Dein Spiel“')}
ok(errors.length===0,'Keine JS-Fehler',errors.slice(0,3));
console.log(f?`FEHLER gesamt ${f} von ${n}`:`ALLES OK (${n} Prüfungen)`);process.exit(f?1:0);
