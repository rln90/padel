// Betrieb: Abfragetakt (Anfragenbudget), schlechtes Netz, Hintergrund und Rückkehr, Doppeltippen, hängende Antworten.
// PADEL_URL=http://localhost:8787 PADEL_KEY=geheim node tests/online/netz.mjs
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const BASE=process.env.PADEL_URL||'http://localhost:8787',KEY=process.env.PADEL_KEY||'geheim';
let f=0,n=0;const ok=(c,m,x)=>{n++;if(!c){f++;console.log('FEHLER',m,x===undefined?'':JSON.stringify(x).slice(0,300))}};
const T00=Date.now(),step=s=>console.error('['+((Date.now()-T00)/1000).toFixed(0)+'s] '+s);
let ipn=900;const ip=()=>'60.0.'+((ipn>>8)&255)+'.'+(ipn++&255);
async function api(method,path,o={}){const h={'cf-connecting-ip':ip()};if(o.token)h.authorization='Bearer '+o.token;if(o.key)h['x-create-key']=o.key;
  const body=o.body!==undefined?JSON.stringify(o.body):undefined;if(body!==undefined)h['content-type']='application/json';
  const r=await fetch(BASE+path,{method,headers:h,body});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch(e){}return{s:r.status,j}}
const games=S=>{const out=[],seen=new Set();(function w(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(w);return}
  if(Number.isInteger(x.gid)&&Number.isInteger(x.a)&&Number.isInteger(x.b)&&!seen.has(x.gid)){seen.add(x.gid);out.push(x)}for(const k in x)w(x[k])})(S);return out};
const names=['Robin','Anna','Ben','Cem','Dora','Emil','Fritz','Gerda','Hanna','Ida','Jonas','Kim','Lena','Max','Nora','Otto','Pia','Quentin','Rosa','Sven','Tina','Uli','Vera','Willi'];
async function make(N,cfg={R:4,courts:4,auto:'reported'}){const c=(await api('POST','/api/t',{key:KEY,body:{cfg}})).j;const pl=[];
  for(let i=0;i<N;i++)pl.push((await api('POST','/api/t/'+c.code+'/join',{body:{name:names[i]}})).j);
  await api('POST','/api/t/'+c.code+'/admin/start',{token:c.adminKey,body:{}});return{C:c.code,A:c.adminKey,pl}}
const br=await chromium.launch(),errs=[];
async function phone(T,who,o={}){const ctx=await br.newContext({viewport:{width:390,height:800},isMobile:true,hasTouch:true,locale:'de-CH'});
  await ctx.addInitScript(([k,v])=>{try{localStorage.setItem(k,v)}catch(e){}},['padel-online-'+T.C,JSON.stringify({p:T.pl[who].token,a:null,pid:T.pl[who].pid})]);
  const p=await ctx.newPage();p.on('pageerror',e=>errs.push(String(e)));p.on('dialog',d=>{errs.push('DIALOG');d.dismiss()});
  if(o.count){p.__req=0;p.on('request',r=>{if(r.url().includes('/state'))p.__req++})}
  await p.goto(BASE+'/#'+T.C);await p.waitForSelector('.hero',{timeout:20000});await p.waitForTimeout(300);return p}
const state=async T=>(await api('GET','/api/t/'+T.C+'/state',{token:T.A})).j;
const idx=(sv,T,who)=>sv.players.findIndex(p=>p.id===T.pl[who].pid); // Spiele verweisen auf die Position in der Spielerliste
const withGame=async T=>games((await state(T)).S).find(x=>x.sa==null).a; // Position eines Spielers mit offenem Spiel (= Beitrittsreihenfolge)
const myGame=async(T,who)=>{const sv=await state(T);const i=idx(sv,T,who);return games(sv.S).find(g=>(g.a===i||g.b===i)&&g.sa==null)};

step('A Abfragetakt');
for(const [N,exp] of [[4,3000],[9,3000],[10,3000],[11,4000],[16,4000],[17,6000],[24,6000]]){
  const T=await make(N,{R:3,courts:Math.min(12,Math.max(1,N>>1))});const p=await phone(T,0);
  const v=await p.evaluate(()=>{const o=window.__online;const a=o.pollBase();o.setLast(Date.now()-61000);const b=o.pollBase();o.setLast(Date.now());return{a,b}});
  ok(v.a===exp,'Takt bei '+N+' Spielern: '+exp+' ms',v);ok(v.b===Math.min(12000,exp*2),'Takt bei '+N+' Spielern nach 60 s Ruhe verdoppelt (höchstens 12 s)',v);
  await p.context().close()}
{const T=await make(24,{R:3,courts:12});const p=await phone(T,0,{count:true});await p.waitForTimeout(500);p.__req=0;await p.waitForTimeout(20000);
  ok(p.__req<=5,'24 Spieler: höchstens 5 Abfragen in 20 s (Takt 6 s)',p.__req);await p.context().close()}
{const T=await make(9,{R:3,courts:4});const p=await phone(T,0,{count:true});await p.waitForTimeout(500);p.__req=0;await p.waitForTimeout(20000);
  ok(p.__req>=5&&p.__req<=9,'9 Spieler: etwa 7 Abfragen in 20 s (Takt 3 s)',p.__req);
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true})});await p.waitForTimeout(3200);p.__req=0;await p.waitForTimeout(20000);
  ok(p.__req<=2,'Versteckter Tab: höchstens 2 Abfragen in 20 s (Takt 15 s)',p.__req);await p.context().close()}
{ /* Hochrechnung: Abfragen je Stunde bei 24 Spielern, alle sichtbar, stets Änderungen (ungünstigster Fall) */
  const perHour=3600/6,total=24*perHour*3;ok(total<60000,'Hochrechnung 24 Spieler, 3 h, immer sichtbar: unter 60 % der Tagesgrenze',total)}

step('B Offline und Doppeltippen');
{const T=await make(8);const W=await withGame(T);const p=await phone(T,W);const g=await myGame(T,W);ok(!!g,'Spieler hat ein offenes Spiel');await p.waitForSelector('.hero .m input');
 const ins=await p.$$('.hero .m input');await ins[0].fill('6');await ins[1].fill('3');
 await p.context().setOffline(true);await p.click('.hero [data-act=save]');await p.waitForTimeout(1500);
 const t1=await p.evaluate(()=>document.body.innerText);ok(/Verbindung|Netz|erreichbar|Fehler/i.test(t1),'Offline: Hinweis statt stillem Scheitern',t1.slice(0,0));
 const vals=await p.$$eval('.hero .m input',a=>a.map(x=>x.value));ok(vals[0]==='6'&&vals[1]==='3','Offline: eingetippte Zahlen bleiben stehen',vals);
 await p.waitForTimeout(4000);ok(await p.evaluate(()=>!!document.querySelector('.hero .ho')),'Offline: Ansicht bleibt stehen');
 await p.context().setOffline(false);await p.waitForTimeout(500);
 await p.dblclick('.hero [data-act=save]').catch(()=>{});await p.waitForTimeout(2500);
 const sv=await state(T);const gg=games(sv.S).find(x=>x.gid===g.gid);ok(gg&&gg.sa===6&&gg.sb===3,'Nach Rückkehr des Netzes ist das Ergebnis genau einmal gespeichert',gg&&[gg.sa,gg.sb]);
 const t2=await p.evaluate(()=>document.body.innerText);ok(!/undefined|NaN|\[object/.test(t2),'Nach Doppeltippen keine kaputten Texte');await p.context().close()}

step('C Langsames und hängendes Netz');
{const T=await make(8);const W=await withGame(T);const p=await phone(T,W);const g=await myGame(T,W);await p.waitForSelector('.hero .m input');
 await p.route('**/api/**',async r=>{await new Promise(x=>setTimeout(x,4000));r.continue()});
 const ins=await p.$$('.hero .m input');await ins[0].fill('6');await ins[1].fill('2');await p.click('.hero [data-act=save]');await p.waitForTimeout(6500);
 let sv=await state(T);let gg=games(sv.S).find(x=>x.gid===g.gid);ok(gg&&gg.sa===6&&gg.sb===2,'4 s Verzögerung: Ergebnis kommt an',gg&&[gg.sa,gg.sb]);
 await p.unroute('**/api/**');await p.context().close()}
{const T=await make(8);const W=await withGame(T);const p=await phone(T,W);const g=await myGame(T,W);await p.waitForSelector('.hero .m input');
 /* Antwort geht verloren (Server hat gespeichert, Handy erfährt es nicht) */
 await p.route('**/result',async r=>{await r.fetch();await r.abort('connectionreset')});
 const ins=await p.$$('.hero .m input');await ins[0].fill('6');await ins[1].fill('1');await p.click('.hero [data-act=save]');await p.waitForTimeout(2500);
 await p.unroute('**/result');await p.waitForTimeout(7000);
 const sv=await state(T);const gg=games(sv.S).find(x=>x.gid===g.gid);ok(gg&&gg.sa===6&&gg.sb===1,'Antwort verloren: Server hat das Ergebnis',gg&&[gg.sa,gg.sb]);
 const t=await p.evaluate(()=>document.body.innerText);ok(!/undefined|NaN|\[object/.test(t),'Antwort verloren: keine kaputten Texte');
 const stillEdit=(await p.$$('.hero .m input')).length;const txt=await p.evaluate(()=>document.querySelector('.hero')?document.querySelector('.hero').innerText:'');
 ok(stillEdit===0||/6.{0,6}1/.test(txt+t),'Antwort verloren: nach dem nächsten Abruf zeigt die Seite das gespeicherte Ergebnis oder das nächste Spiel',{stillEdit});
 await p.context().close()}

step('D Hintergrund und Rückkehr');
{const T=await make(8);const W=await withGame(T);const p=await phone(T,W);await p.waitForSelector('.hero .m input');
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true})});
 const g=await myGame(T,W);await api('POST','/api/t/'+T.C+'/admin/result',{token:T.A,body:{gid:g.gid,sa:6,sb:0}});
 await p.waitForTimeout(500);ok((await p.$$('.hero .m input')).length>=2,'Im Hintergrund noch nicht aktualisiert (erwartet)');
 const t0=Date.now();await p.evaluate(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'))});
 await p.waitForFunction(()=>document.querySelectorAll('.hero .m input').length===0,null,{timeout:2500}).catch(()=>{});
 ok((await p.$$('.hero .m input')).length===0&&Date.now()-t0<2600,'Rückkehr in die App: Stand sofort aktuell (unter 2,5 s)',Date.now()-t0);await p.context().close()}
{const T=await make(8);const W=await withGame(T);const p=await phone(T,W);await p.waitForSelector('.hero .m input');const ins=await p.$$('.hero .m input');await ins[0].fill('4');await ins[1].fill('6');
 const sv0=await state(T),i0=idx(sv0,T,W);const other=games(sv0.S).find(g=>g.sa==null&&g.a!==i0&&g.b!==i0);await api('POST','/api/t/'+T.C+'/admin/result',{token:T.A,body:{gid:other.gid,sa:6,sb:2}});
 await p.waitForTimeout(7000);const v=await p.$$eval('.hero .m input',a=>a.map(x=>x.value));ok(v[0]==='4'&&v[1]==='6','Änderung eines anderen Spiels löscht angefangene Eingabe nicht',v);await p.context().close()}

ok(errs.length===0,'Keine JS-Fehler',errs.slice(0,4));
await br.close();console.log(f?'FEHLER: '+f+' von '+n:'ALLES OK ('+n+' Prüfungen)');process.exit(f?1:0);
