// Obskure Fälle: was im Lokal passiert, aber selten getestet wird.
// Gesperrter Browserspeicher, falsche Handy-Uhr, Serverfehler und hängende Antworten, große Schrift, Querformat,
// zwei Tabs, seltsame Ziffern, Kopieren nicht erlaubt, Turnier über Mitternacht, Größtturnier (24 Spieler, 20 Runden).
// PADEL_URL=http://localhost:8787 PADEL_KEY=geheim node tests/online/obskur.mjs
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const BASE=process.env.PADEL_URL||'http://localhost:8787',KEY=process.env.PADEL_KEY||'geheim';
let f=0,n=0;const ok=(c,m,x)=>{n++;if(!c){f++;console.log('FEHLER',m,x===undefined?'':JSON.stringify(x).slice(0,300))}};
const T00=Date.now(),step=s=>console.error('['+((Date.now()-T00)/1000).toFixed(0)+'s] '+s);
let ipn=100;const ip=()=>'20.0.'+((ipn>>8)&255)+'.'+(ipn++&255);
async function api(method,path,o={}){const h={'cf-connecting-ip':o.ip||ip()};if(o.token)h.authorization='Bearer '+o.token;if(o.key)h['x-create-key']=o.key;
  let body=o.body!==undefined?JSON.stringify(o.body):undefined;if(body!==undefined)h['content-type']='application/json';
  const r=await fetch(BASE+path,{method,headers:h,body});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch(e){}return{s:r.status,j,len:t.length}}
const create=async(cfg)=>{const r=await api('POST','/api/t',{key:KEY,body:cfg?{cfg}:{}});if(!r.j||!r.j.ok)throw new Error('Anlegen '+r.s);return{code:r.j.code,adm:r.j.adminKey}};
const join=(c,name)=>api('POST','/api/t/'+c+'/join',{body:{name}});
const P=(c,route,token,body)=>api('POST','/api/t/'+c+'/'+route,{token,body});
const st=(c,token)=>api('GET','/api/t/'+c+'/state',{token});
function games(S){const out=[],seen=new Set();(function w(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(w);return}
  if(Number.isInteger(x.gid)&&Number.isInteger(x.a)&&Number.isInteger(x.b)&&!seen.has(x.gid)){seen.add(x.gid);out.push(x)}for(const k in x)w(x[k])})(S);return out}
const br=await chromium.launch(),errs=[];
const BADTXT=/undefined|NaN|\[object|Invalid Date|null\b/;
const visibleText=p=>p.evaluate(()=>[...document.querySelectorAll('#onl,#app,#onl2,header')].map(e=>e.innerText).join(' \n '));
async function phone(o={}){const c=await br.newContext({viewport:{width:o.w||360,height:o.h||740},isMobile:!o.desktop,hasTouch:!o.desktop,deviceScaleFactor:2,locale:'de-CH',...(o.ctx||{})});
  if(o.init)await c.addInitScript(o.init);
  const p=await c.newPage();p.on('pageerror',e=>errs.push((o.tag||'')+' '+String(e)));p.on('dialog',d=>{errs.push('DIALOG');d.dismiss()});return p}
/* Turnier mit Robin (Handy) + 7 API-Spielern, laufend */
async function running(cfg={R:4,courts:4}){const T=await create();const tk={};for(const nm of ['Anna','Ben','Cem','Dora','Emil','Fritz','Gerda']){tk[nm]=(await join(T.code,nm)).j.token}
  const rb=await join(T.code,'Robin');await P(T.code,'admin/config',T.adm,{cfg});await P(T.code,'admin/start',T.adm,{});return{...T,tk,robin:rb.j.token,pid:rb.j.pid}}
const asRobin=async(p,T)=>{await p.addInitScript(([k,v])=>{try{localStorage.setItem(k,v)}catch(e){}},['padel-online-'+T.code,JSON.stringify({p:T.robin,a:null,pid:T.pid})])};

/* ===== 1. Browserspeicher gesperrt (privates Fenster, App-Browser in Messengern) ===== */
step('1 Speicher gesperrt');
{const T=await create();for(const nm of ['Anna','Ben','Cem'])await join(T.code,nm);
 const p=await phone({tag:'speicher',init:()=>{const bad={get(){throw new Error('gesperrt')}};for(const m of ['getItem','setItem','removeItem'])Storage.prototype[m]=function(){throw new DOMException('gesperrt','SecurityError')}}});
 await p.goto(BASE+'/#'+T.code);await p.waitForSelector('#nameIn');await p.fill('#nameIn','Robin');await p.click('[data-act=join]');await p.waitForSelector('text=Du bist dabei');
 ok(true,'Beitritt ohne nutzbaren Browserspeicher klappt');
 await P(T.code,'admin/start',T.adm,{});await p.waitForSelector('.hero',{timeout:15000});ok(true,'Spieleransicht ohne Browserspeicher');
 await p.close()}

/* ===== 2. Handy-Uhr geht völlig falsch ===== */
step('2 falsche Uhr');
{const T=await running({R:4,courts:4,t0:1110});const p=await phone({tag:'uhr'});await asRobin(p,T);
 await p.clock.install({time:new Date('2031-03-09T02:30:00Z')});
 await p.goto(BASE+'/#'+T.code);await p.waitForSelector('.hero .ho',{timeout:15000});const t=await visibleText(p);
 ok(!BADTXT.test(t.replace(/Unentschieden|null/g,'')),'Falsche Handy-Uhr (2031): keine NaN/undefined im Text',(t.match(BADTXT)||[])[0]);
 ok(/ab \d\d:\d\d/.test(t),'Uhrzeit des Spiels kommt vom Turnier, nicht von der Handy-Uhr',t.slice(0,200));
 await p.close()}

/* ===== 3. Server liefert Unsinn oder hängt ===== */
step('3 Serverfehler');
{const T=await running();const p=await phone({tag:'netz'});await asRobin(p,T);await p.goto(BASE+'/#'+T.code);await p.waitForSelector('.hero .ho');
 const opp=await p.textContent('.hero .ho');
 const modes=[['Cloudflare-Fehlerseite 502 (HTML)',r=>r.fulfill({status:502,contentType:'text/html',body:'<html><body>Bad gateway</body></html>'})],
  ['leere Antwort 200',r=>r.fulfill({status:200,body:''})],['kein JSON 200',r=>r.fulfill({status:200,contentType:'text/plain',body:'ok'})],
  ['JSON-Liste',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'})],['JSON null',r=>r.fulfill({status:200,contentType:'application/json',body:'null'})],
  ['429',r=>r.fulfill({status:429,contentType:'application/json',body:JSON.stringify({ok:false,err:'zu_viele',msg:'Gerade sehr viel los. Bitte kurz warten.'})})],
  ['Verbindung abgebrochen',r=>r.abort('connectionreset')]];
 for(const [l,h] of modes){await p.route('**/api/**',h);await p.evaluate(()=>window.__online&&window.__online.poll&&window.__online.poll(true)).catch(()=>{});await p.waitForTimeout(3600);
  const t=await visibleText(p);ok(!BADTXT.test(t.replace(/null/g,'')),'Serverantwort '+l+': keine kaputten Texte',(t.match(BADTXT)||[])[0]);
  ok(await p.evaluate(()=>!!document.querySelector('.hero .ho')),'Serverantwort '+l+': Spieleransicht bleibt stehen');
  await p.unroute('**/api/**')}
 await p.waitForTimeout(3600);ok((await p.textContent('.hero .ho'))===opp,'Nach den Störungen alles wieder normal');
 /* hängende Antworten: nie beantwortet */
 let hung=0;await p.route('**/api/**',()=>{hung++});await p.waitForTimeout(16000);ok(hung>=1,'Anfragen hängen (Test aufgebaut)',hung);
 ok(await p.evaluate(()=>!!document.querySelector('.hero .ho')),'Bei hängendem Server bleibt die Ansicht stehen');
 await p.unroute('**/api/**');await p.waitForTimeout(16000);
 const ver0=await p.evaluate(()=>window.__online.state().D.ver);await P(T.code,'admin/config',T.adm,{cfg:{auto:'confirmed'}});await p.waitForFunction(v=>window.__online.state().D.ver>v,ver0,{timeout:14000}).catch(()=>{});
 ok(await p.evaluate(v=>window.__online.state().D.ver>v,ver0),'Nach hängendem Server holt die Seite wieder auf (kein Dauer-Hänger)');
 await p.close()}

/* ===== 4. Große Schrift, schmale und breite Bildschirme, Querformat ===== */
step('4 Größen');
{const T=await running();
 for(const [w,h,zoom,label] of [[320,568,1,'320 breit (alte iPhones)'],[360,740,1.5,'360 mit 150 % Schrift'],[360,740,2,'360 mit 200 % Schrift'],[740,360,1,'Querformat Handy'],[1024,600,1,'Tablet quer'],[1920,1080,1,'Desktop groß']]){
  const p=await phone({w,h,tag:label,desktop:w>=1024});await asRobin(p,T);await p.goto(BASE+'/#'+T.code);await p.waitForSelector('.hero .ho');
  if(zoom!==1)await p.addStyleTag({content:'html{zoom:'+zoom+'}'});await p.waitForTimeout(300);
  const r=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,wide:[...document.querySelectorAll('.hero,.hero *,.rankc,.rankc *,.panel,#tab')].filter(e=>{if(e.closest('.wrap,.plan,input,select'))return false;const b=e.getBoundingClientRect();return b.width&&b.right>innerWidth+1}).length}));
  ok(r.sw<=r.iw+1&&r.wide===0,'Kein Überlauf: '+label,r);await p.context().close()}}

/* ===== 5. Zwei Tabs, ein Spieler; Zahlen-Eingaben ===== */
step('5 Tabs und Ziffern');
{const T=await running();const A=await phone({tag:'tabA'});await asRobin(A,T);const B=await phone({tag:'tabB'});await asRobin(B,T);
 await A.goto(BASE+'/#'+T.code);await B.goto(BASE+'/#'+T.code);await A.waitForSelector('.hero .m input');await B.waitForSelector('.hero .m input');
 const odd=[['٦','٣'],['６','３'],['6 ','3 '],['+6','3'],['1e1','3'],['','3'],['-1','3'],['100','3'],['6,5','3'],['abc','3'],['6','6'],['0','0']];
 for(const [a,b] of odd){const ins=await A.$$('.hero .m input');if(ins.length<2)break;await ins[0].fill(a).catch(()=>{});await ins[1].fill(b).catch(()=>{});await A.click('.hero [data-act=save]');await A.waitForTimeout(400)}
 const sv=(await st(T.code,T.adm)).j;const mine=games(sv.S).filter(g=>g.sa!=null);
 ok(mine.every(g=>Number.isInteger(g.sa)&&Number.isInteger(g.sb)&&g.sa>=0&&g.sa<=99&&g.sb>=0&&g.sb<=99),'Seltsame Ziffern: nur gültige ganze Zahlen werden gespeichert',mine.map(g=>[g.sa,g.sb]));
 ok(mine.length<=1,'Seltsame Eingaben speichern höchstens ein Ergebnis',mine.length);
 const tx=await visibleText(A);ok(!BADTXT.test(tx.replace(/null/g,'')),'Keine kaputten Texte nach seltsamen Eingaben');
 /* Tab B sieht Änderung, widersprüchliches Speichern aus dem alten Stand */
 await B.waitForTimeout(4000);
 const ins=await B.$$('.hero .m input');if(ins.length>=2){await ins[0].fill('1');await ins[1].fill('6');await B.click('.hero [data-act=save]');await B.waitForTimeout(1200)}
 const sv2=(await st(T.code,T.adm)).j;const m2=games(sv2.S).filter(g=>g.sa!=null);ok(m2.length<=1,'Zwei Tabs: weiterhin höchstens ein Ergebnis für dieses Spiel',m2.length);
 ok((await visibleText(B)).length>50,'Tab B bleibt benutzbar');
 await A.context().close();await B.context().close()}

/* ===== 6. Kopieren und Teilen nicht erlaubt ===== */
step('6 Kopieren');
{const T=await create();const p=await phone({tag:'kopie',desktop:true,w:1280,h:800,init:()=>{Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true});Object.defineProperty(navigator,'share',{value:undefined,configurable:true})}});
 await p.goto(BASE+'/#'+T.code+'/'+T.adm);await p.waitForSelector('text=Warteraum');
 const copies=await p.$$('[data-act=copy]');ok(copies.length>=1,'Kopier-Knöpfe vorhanden',copies.length);
 await copies[0].click();await p.waitForTimeout(400);const m=await p.evaluate(()=>(document.querySelector('#onlmsg')||{}).textContent||'');ok(m.length>0,'Kopieren nicht möglich: Hinweis statt Absturz',m);
 await p.close()}

/* ===== 7. Code-Eingabe: Leerzeichen, Kleinbuchstaben, ganzer Link eingefügt ===== */
step('7 Code-Eingabe');
{const T=await create();const p=await phone({tag:'code'});
 for(const [l,v] of [['klein',T.code.toLowerCase()],['mit Leerzeichen',' '+T.code.slice(0,3)+' '+T.code.slice(3)+' '],['mit Bindestrich',T.code.slice(0,3)+'-'+T.code.slice(3)],['ganzer Link',BASE+'/#'+T.code],['Link mit Tracking',BASE+'/?fbclid=abc123#'+T.code]]){
  await p.goto(BASE+'/');await p.waitForSelector('#codeIn');await p.evaluate(v=>{const i=document.querySelector('#codeIn');i.removeAttribute('maxlength');i.value=v},v);await p.click('[data-act=goto]');await p.waitForTimeout(800);
  ok(await p.evaluate(c=>location.hash.toUpperCase().startsWith('#'+c),T.code),'Code-Eingabe: '+l+' führt zum Turnier',await p.evaluate(()=>location.hash))}
 await p.goto(BASE+'/#'+T.code+'x');ok(true);
 for(const h of ['#abc','#K7MQ2X/a_kurz','#%00%00','#<script>','#AAAAAA']){await p.goto(BASE+'/'+h);await p.waitForTimeout(700);ok(await p.evaluate(()=>document.querySelector('#codeIn,.panel')!==null),'Seltsamer Link '+h+': Seite bleibt benutzbar')}
 await p.close()}

/* ===== 8. Seltsame Namen im Layout ===== */
step('8 Namen');
{const nm=['W'.repeat(24),'漢'.repeat(24),'Z\u0334\u0321\u031b\u0315\u0310\u0302\u0308\u030a\u0303'.repeat(2),'🎾'.repeat(12),'A'+'\u0301'.repeat(20),'ﷺ'.repeat(10)];
 const T=await create();let okn=0;for(const x of nm){const r=await join(T.code,x);if(r.s===200)okn++}
 for(let i=okn;i<4;i++)await join(T.code,'Fill'+i);
 await P(T.code,'admin/config',T.adm,{cfg:{R:3,courts:4}});const s=await P(T.code,'admin/start',T.adm,{});ok(s.s===200,'Start mit seltsamen Namen',[s.s,s.j]);
 for(const w of [360,1280]){const p=await phone({w,tag:'namen'+w,desktop:w>1000});await p.goto(BASE+'/#'+T.code+'/'+T.adm);await p.waitForSelector('#tab table');
  const r=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,rows:[...document.querySelectorAll('#tab tbody tr')].map(r=>Math.round(r.getBoundingClientRect().height)),tab:(()=>{const t=document.querySelector('#tab');return t.scrollWidth-t.clientWidth})()}));
  ok(r.sw<=r.iw+1&&r.tab<=1,'Seltsame Namen: kein Überlauf bei '+w,r);ok(Math.max(...r.rows)<=160,'Seltsame Namen: Tabellenzeilen bleiben unter 160 px Höhe bei '+w,Math.max(...r.rows));await p.context().close()}}

/* ===== 9. Turnier über Mitternacht ===== */
step('9 Mitternacht');
{const T=await create();for(const x of ['A1','B2','C3','D4','E5','F6','G7','H8'])await join(T.code,x);
 await P(T.code,'admin/config',T.adm,{cfg:{R:5,courts:2,t0:1430,ov:'no'}});await P(T.code,'admin/start',T.adm,{});
 const p=await phone({w:1280,h:900,desktop:true,tag:'mitternacht'});await p.goto(BASE+'/#'+T.code+'/'+T.adm);await p.waitForSelector('#tab table');
 const t=await p.evaluate(()=>document.querySelector('#app').innerText);
 ok(!/\b(2[4-9]|[3-9]\d):\d\d\b/.test(t),'Zeiten nach Mitternacht erscheinen als 00:xx, nicht 24:xx',(t.match(/\b(2[4-9]|[3-9]\d):\d\d\b/)||[])[0]);
 ok(/\b00:\d\d\b/.test(t)||/\b0[1-9]:\d\d\b/.test(t),'Zeiten nach Mitternacht sind vorhanden');await p.close()}

/* ===== 10. Größtes Turnier: 24 Spieler, 12 Plätze, 20 Runden, komplett durchspielen ===== */
step('10 Größtturnier');
{const T=await create();const pids=[];for(let i=0;i<24;i++){const r=await join(T.code,'Spieler '+String.fromCharCode(65+i)+'-'+'x'.repeat(14));pids.push(r.j.token)}
 const c=await P(T.code,'admin/config',T.adm,{cfg:{R:20,courts:12}});ok(c.s===200,'Größte Einstellung (20 Runden, 12 Plätze) möglich',[c.s,c.j&&c.j.err]);
 const s=await P(T.code,'admin/start',T.adm,{});ok(s.s===200,'Start mit 24 Spielern',s.s);
 let seed=11;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff};let guard=0,sv,maxState=0,t0=Date.now();
 while(guard++<400){const r=await st(T.code,T.adm);sv=r.j;maxState=Math.max(maxState,r.len);if(sv.over||sv.status==='finished')break;
  const open=games(sv.S).filter(g=>g.sa==null);if(!open.length){await P(T.code,'admin/assign',T.adm,{});continue}
  await Promise.all(open.map(g=>{const w=rnd()<.5;return P(T.code,'admin/result',T.adm,{gid:g.gid,sa:w?6:Math.floor(rnd()*5),sb:w?Math.floor(rnd()*5):6})}))}
 ok(sv.over||sv.status==='finished',guard<400?'Größtturnier läuft zu Ende':'Größtturnier endet nicht',guard);
 const cnt={};games(sv.S).filter(g=>g.sa!=null).forEach(g=>{cnt[g.a]=(cnt[g.a]||0)+1;cnt[g.b]=(cnt[g.b]||0)+1});const cs=Object.values(cnt);
 ok(cs.length===24&&Math.max(...cs)-Math.min(...cs)<=1,'Alle 24 haben (nahezu) gleich viele Spiele',[Math.min(...cs),Math.max(...cs)]);
 const ex=await api('GET','/api/t/'+T.code+'/admin/export',{token:T.adm});ok(ex.len<110000,'Gespeicherter Stand bleibt klein genug (<110 KB, Grenze 128 KB je Eintrag)',ex.len);
 ok(maxState<400000,'Zustandsantwort bleibt klein (<400 KB)',maxState);
 const rs=await api('POST','/api/t',{key:KEY,body:{restore:ex.j.backup}});ok(rs.s===200,'Sicherung des Größtturniers lässt sich wiederherstellen',[rs.s,rs.j&&rs.j.err]);
 const p=await phone({w:390,tag:'gross'});await p.goto(BASE+'/#'+T.code+'/'+T.adm);const t1=Date.now();await p.waitForSelector('#tab table',{timeout:20000});const dt=Date.now()-t1;
 ok(dt<8000,'Tabelle mit 24 Spielern und 20 Runden erscheint in unter 8 s',dt);
 const lay=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,tab:(()=>{const t=document.querySelector('#tab');return t.scrollWidth-t.clientWidth})()}));ok(lay.sw<=lay.iw+1&&lay.tab<=1,'Endtabelle mit 24 Spielern ohne Überlauf',lay);
 await p.close()}


/* ===== 11. Platzanzeige nach Ausfall: "von N" zählt nur aktive Spieler ===== */
step('11 Platzanzeige');
{const T=await create();const tk={};for(const x of ['Anna','Ben','Cem','Dora','Emil','Fritz','Gerda','Hanna']){tk[x]=(await join(T.code,x)).j}
 await P(T.code,'admin/config',T.adm,{cfg:{R:4,courts:2}});await P(T.code,'admin/start',T.adm,{});
 const d=await P(T.code,'admin/drop',T.adm,{pid:tk.Ben.pid});ok(d.s===200,'Ausfall möglich',d.s);
 const p=await phone({tag:'platz'});await p.addInitScript(([k,v])=>{try{localStorage.setItem(k,v)}catch(e){}},['padel-online-'+T.code,JSON.stringify({p:tk.Anna.token,a:null,pid:tk.Anna.pid})]);
 await p.goto(BASE+'/#'+T.code);await p.waitForSelector('.rankc .rv',{timeout:15000});
 ok((await p.textContent('.rankc .rv')).trim()==='von 7','Platzanzeige zählt nur aktive Spieler (8 angemeldet, 1 ausgeschieden: "von 7")',await p.textContent('.rankc .rv'));
 const leg=await p.evaluate(()=>(document.querySelector('#leg')||{}).textContent||'');ok(!/ :/.test(leg),'Legende ohne Leerzeichen vor Doppelpunkt',leg.slice(0,120));
 await p.close()}

ok(errs.length===0,'Keine JS-Fehler im ganzen Test',errs.slice(0,4));
await br.close();console.log(f?'FEHLER: '+f+' von '+n:'ALLES OK ('+n+' Prüfungen)');process.exit(f?1:0);
