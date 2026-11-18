// Angriffstest: Spieler versuchen aktiv, das System zu stören oder zu knacken.
// Läuft gegen einen echten lokalen Worker (wrangler dev), mit verschiedenen Absender-Adressen (cf-connecting-ip).
// Prüft: kein Serverfehler (5xx), keine Übernahme, Grenzen halten, ein einzelner Störer legt die anderen nicht lahm,
// Namen mit Skriptversuchen bleiben harmlos, ein ehrliches Turnier läuft trotz Störung korrekt zu Ende.
// PADEL_URL=http://localhost:8787 PADEL_KEY=geheim node tests/online/angriff.mjs
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const BASE=process.env.PADEL_URL||'http://localhost:8787',KEY=process.env.PADEL_KEY||'geheim';
let f=0,n=0;const ok=(c,m,x)=>{n++;if(!c){f++;console.log('FEHLER',m,x===undefined?'':JSON.stringify(x).slice(0,300))}};
const T00=Date.now();const five=[];let ipn=10;const ip=()=>'10.'+((ipn>>16)&255)+'.'+((ipn>>8)&255)+'.'+(ipn++&255);
async function api(method,path,o={}){
  const h={...(o.headers||{}),'cf-connecting-ip':o.ip||ip()};if(o.token)h.authorization='Bearer '+o.token;
  let body=o.raw!==undefined?o.raw:(o.body!==undefined?JSON.stringify(o.body):undefined);if(body!==undefined&&!h['content-type'])h['content-type']='application/json';
  let r;try{r=await fetch(BASE+path,{method,headers:h,body})}catch(e){return{s:0,j:null,err:String(e)}}
  const t=await r.text();let j=null;try{j=JSON.parse(t)}catch(e){}
  if(r.status>=500)five.push(method+' '+path+' '+r.status+' '+t.slice(0,100));
  return{s:r.status,j,t,h:r.headers};
}
const create=async(body={})=>{const r=await api('POST','/api/t',{headers:{'x-create-key':KEY},body});if(!r.j||!r.j.ok)throw new Error('Anlegen fehlgeschlagen '+r.s+' '+r.t);return{code:r.j.code,adm:r.j.adminKey}};
const join=(code,name,o={})=>api('POST','/api/t/'+code+'/join',{body:{name},...o});
const st=(code,token)=>api('GET','/api/t/'+code+'/state',{token});
const P=(code,route,token,body,o={})=>api('POST','/api/t/'+code+'/'+route,{token,body,...o});
const burst=async(n,fn,k=100)=>{const out=[];for(let i=0;i<n;i+=k)out.push(...await Promise.all(Array.from({length:Math.min(k,n-i)},(_,j)=>fn(i+j))));return out};
const bad4=s=>s>=400&&s<500;
function games(S){const out=[],seen=new Set();(function w(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(w);return}
  if(Number.isInteger(x.gid)&&Number.isInteger(x.a)&&Number.isInteger(x.b)&&!seen.has(x.gid)){seen.add(x.gid);out.push(x)}
  for(const k in x)w(x[k])})(S);return out}

/* ===== 1. Kaputte Eingaben beim Beitritt ===== */
console.error('['+((Date.now()-T00)/1000).toFixed(0)+'s] Abschnitt 1');
const T1=await create();
const junk=[['kein JSON','{{{'],['Liste','[]'],['null','null'],['Text','"Anna"'],['Zahl','42'],['leer',''],
  ['Name Objekt','{"name":{"a":1}}'],['Name Liste','{"name":["x"]}'],['Name Zahl','{"name":123}'],['Name null','{"name":null}'],['Name true','{"name":true}'],
  ['Skript','{"name":"<script>alert(1)</script>"}'],['Bild','{"name":"<img src=x onerror=alert(1)>"}'],
  ['nur Leerraum','{"name":"   \\t  "}'],['25 Zeichen','{"name":"'+'x'.repeat(25)+'"}'],['5000 Zeichen','{"name":"'+'y'.repeat(5000)+'"}'],
  ['nur Steuerzeichen','{"name":"\\u0000\\u0007\\u001b"}'],['sehr tief','{"name":'+'['.repeat(5000)+']'.repeat(5000)+'}']];
for(const [l,raw] of junk){const r=await api('POST','/api/t/'+T1.code+'/join',{raw});ok(bad4(r.s),'Beitritt '+l+' wird abgelehnt (4xx)',[r.s,r.t&&r.t.slice(0,80)])}
const big=await api('POST','/api/t/'+T1.code+'/join',{raw:'{"name":"a","x":"'+'z'.repeat(20000)+'"}'});ok(big.s===413,'Zu große Anfrage (20 KB) wird mit 413 abgewiesen',big.s);
const big2=await api('POST','/api/t/'+T1.code+'/join',{raw:'{"name":"a","x":"'+'z'.repeat(5e6)+'"}'});ok(big2.s===413,'Riesige Anfrage (5 MB) wird mit 413 abgewiesen',big2.s);
let s1=await st(T1.code);ok(s1.j.players.length===0,'Nach allen Fehlversuchen ist kein Spieler eingetragen',s1.j.players);
/* Namen, die erlaubt sind, aber Ärger machen könnten: müssen als harmloser Text erscheinen */
const odd=['x" onmouseover="window.__pwn=1','javascript:window.__pwn=1','{{7*7}}','${7*7}','&lt;b&gt;fett','\'); window.__pwn=1;//','‮RTL-Test','Zero​Width','😀 Smiley 🎾','__proto__','constructor'];
const toks={};
for(const nm of odd){const r=await join(T1.code,nm);ok(r.s===200||bad4(r.s),'Name mit Sonderzeichen '+JSON.stringify(nm)+' nicht 5xx',r.s);if(r.s===200)toks[nm]=r.j.token}
/* Prototype-Verschmutzung beim Beitritt */
const pp=await api('POST','/api/t/'+T1.code+'/join',{raw:'{"__proto__":{"role":"admin","isAdmin":true},"constructor":{"prototype":{"role":"admin"}},"name":"Mallory"}'});
ok(pp.s===200,'Beitritt mit __proto__-Feldern erlaubt, Zusatzfelder werden ignoriert',pp.s);
const mal=pp.j&&pp.j.token;
let ex=await api('GET','/api/t/'+T1.code+'/admin/export',{token:mal});ok(ex.s===403,'Mallory (Spieler) darf den Admin-Export nicht',ex.s);
const ex2=await api('GET','/api/t/'+T1.code+'/admin/export',{token:T1.adm});ok(ex2.s===200,'Organisator darf den Export',ex2.s);
/* Doppelte Namen */
for(const v of ['MALLORY','  mallory ','Mallory','mallory​','Mal‍lory'])
  {const r=await join(T1.code,v);ok(r.s===409||(r.s===200&&false),'Doppelter Name '+JSON.stringify(v)+' wird abgelehnt',[r.s,r.j&&r.j.err])}

/* ===== 2. Zugänge fälschen ===== */
console.error('['+((Date.now()-T00)/1000).toFixed(0)+'s] Abschnitt 2');
const T2=await create();const tk=await join(T2.code,'Echt');const rt=tk.j.token;
const adminRoutes=['admin/config','admin/add','admin/rename','admin/kick','admin/release','admin/start','admin/result','admin/drop','admin/dismiss','admin/assign','admin/undo','admin/end'];
const fakes=[null,'','x','a_','a_'+'A'.repeat(24),'p_'+'A'.repeat(24),'a_'+'A'.repeat(500),rt,"a_' OR '1'='1",'../../etc/passwd','a_\u0000'];
for(const t of fakes)for(const r of adminRoutes){const res=await P(T2.code,r,t,{gid:1,sa:6,sb:0,pid:0,name:'X',cfg:{R:3}});if(res.s===200||res.s>=500)ok(false,'Admin-Route '+r+' mit Zugang '+JSON.stringify(t&&t.slice(0,12))+' darf nicht gelingen',res.s)}
ok(true,'Admin-Routen mit gefälschten Zugängen: alle abgewiesen ('+fakes.length*adminRoutes.length+' Versuche)');
const exp=await api('GET','/api/t/'+T2.code+'/admin/export',{token:rt});ok(exp.s===403||exp.s===401,'Spieler-Zugang öffnet keinen Export',exp.s);
const tt=await api('GET','/api/t/'+T2.code+'/state',{token:'p_'+'Z'.repeat(24)});ok(tt.s===200&&tt.j.badToken===true,'Gefälschter Zugang beim Lesen: Zuschauer mit Hinweis, kein Fehler',[tt.s,tt.j&&tt.j.badToken]);
const t3=await api('GET','/api/t/'+T2.code+'/state',{headers:{authorization:'Bearer '+'q'.repeat(100)}});ok(bad4(t3.s)||t3.s===200,'Überlanger Zugang kein 5xx',t3.s);
const T2b=await create();const cross=await api('GET','/api/t/'+T2b.code+'/admin/export',{token:T2.adm});ok(cross.s===401||cross.s===403,'Admin-Zugang eines anderen Turniers gilt hier nicht',cross.s);
const cross2=await P(T2b.code,'join',rt,{name:'Fremd'});ok(cross2.s!==500,'Spieler-Zugang aus anderem Turnier kein 5xx',cross2.s);

/* ===== 3. Ansturm auf die Spielerzahl (parallel) ===== */
console.error('['+((Date.now()-T00)/1000).toFixed(0)+'s] Abschnitt 3');
const T3=await create();
const rs=await Promise.all(Array.from({length:60},(_,i)=>join(T3.code,'Rush'+i)));
const okc=rs.filter(r=>r.s===200).length,full=rs.filter(r=>r.s===409&&r.j.err==='voll').length;
ok(okc===24,'60 gleichzeitige Beitritte: genau 24 kommen durch',[okc,full,rs.filter(r=>![200,409].includes(r.s)).map(r=>r.s)]);
s1=await st(T3.code);const ids=s1.j.players.map(p=>p.id);ok(s1.j.players.length===24&&new Set(ids).size===24&&new Set(s1.j.players.map(p=>p.name)).size===24,'24 Spieler, keine doppelten Nummern oder Namen',ids.length);
const tk3=rs.filter(r=>r.s===200).map(r=>r.j);
/* Gleichzeitig starten, mehrfach */
const sts=await Promise.all(Array.from({length:8},()=>P(T3.code,'admin/start',T3.adm,{})));
ok(sts.filter(r=>r.s===200).length===1&&sts.every(r=>r.s===200||r.s===409),'8 gleichzeitige Starts: genau einer gelingt',sts.map(r=>r.s));
s1=await st(T3.code);ok(s1.j.status==='running'&&s1.j.S.n===24,'Turnier läuft mit 24 Spielern');
const late=await join(T3.code,'ZuSpaet');ok(late.s===409,'Beitritt nach dem Start abgewiesen',late.s);
const cfgAfter=await P(T3.code,'admin/config',T3.adm,{cfg:{R:9,courts:1}});ok(cfgAfter.s===409,'Rundenzahl nach dem Start nicht änderbar',cfgAfter.s);

/* ===== 4. Ergebnis-Angriffe im laufenden Turnier ===== */
console.error('['+((Date.now()-T00)/1000).toFixed(0)+'s] Abschnitt 4');
const T4=await create();const names4=['Anna','Ben','Cem','Dora','Emil','Fritz','Gerda','Hans'],tk4={};
for(const nm of names4){const r=await join(T4.code,nm);tk4[nm]=r.j.token;if(r.s!==200)ok(false,'Beitritt '+nm,r.s)}
ok((await P(T4.code,'admin/start',tk4.Anna,{})).s===403,'Spieler kann nicht starten');
ok((await P(T4.code,'result',tk4.Anna,{gid:0,sa:6,sb:2})).s>=400,'Ergebnis vor dem Start abgewiesen');
await P(T4.code,'admin/config',T4.adm,{cfg:{R:4,courts:4,draw:false}});
ok((await P(T4.code,'admin/start',T4.adm,{})).s===200,'Start mit 8 Spielern');
let S4=(await st(T4.code,T4.adm)).j;let G=games(S4.S);ok(G.length>=4,'Spiele vorhanden',G.length);
const byIdx={};names4.forEach((nm,i)=>byIdx[i]=nm);
const g0=G[0],pa=byIdx[g0.a],pb=byIdx[g0.b];const third=names4.find(nm=>nm!==pa&&nm!==pb);
const bads=[[-1,3],[3,-1],[100,0],[0,100],[1.5,2],['3',2],[null,2],[2,null],[true,1],[[],1],[{},1],[1e9,0],[NaN,1],['１',2],[undefined,undefined],['6','2'],[0.1,0],[3,3]];
for(const [a,b] of bads){const r=await P(T4.code,'result',tk4[pa],{gid:g0.gid,sa:a,sb:b});ok(r.s===400||r.s===409||r.s===422,'Ungültiges Ergebnis '+JSON.stringify([a,b])+' abgewiesen',[r.s,r.j&&r.j.err])}
const gids=[999999,-1,1.5,'0','x',null,{},[],0x7fffffff,1e300];
for(const g of gids){const r=await P(T4.code,'result',tk4[pa],{gid:g,sa:6,sb:2});ok(bad4(r.s),'Ergebnis für ungültiges Spiel '+JSON.stringify(g)+' abgewiesen',r.s)}
ok((await P(T4.code,'result',tk4[third],{gid:g0.gid,sa:6,sb:0})).s===403,'Dritter Spieler kann kein fremdes Ergebnis eintragen');
const first=await P(T4.code,'result',tk4[pa],{gid:g0.gid,sa:6,sb:3});ok(first.s===200,'Spieler trägt eigenes Ergebnis ein',[first.s,first.j]);
ok((await P(T4.code,'confirm',tk4[pa],{gid:g0.gid})).s===409,'Eigenes Ergebnis nicht selbst bestätigen');
ok((await P(T4.code,'confirm',tk4[third],{gid:g0.gid})).s===403,'Dritter kann nicht bestätigen');
ok((await P(T4.code,'dispute',tk4[pa],{gid:g0.gid})).s>=400,'Eigenes Ergebnis nicht selbst anfechten');
ok((await P(T4.code,'dispute',tk4[third],{gid:g0.gid})).s===403,'Dritter kann nicht widersprechen');
/* Gegner widerspricht mehrfach, dann überschreibt der Eintragende heimlich */
const d1=await P(T4.code,'dispute',tk4[pb],{gid:g0.gid});ok(d1.s===200,'Gegner widerspricht',d1.s);
const d2=await P(T4.code,'dispute',tk4[pb],{gid:g0.gid});ok(bad4(d2.s),'Zweiter Widerspruch bleibt wirkungslos',d2.s);
const s2=await st(T4.code,T4.adm);ok(!!s2.j.res[g0.gid]&&s2.j.res[g0.gid].st==='disputed','Strittiges Ergebnis ist als strittig markiert für den Organisator',s2.j.res[g0.gid]);
/* Organisator entscheidet, danach darf kein Spieler mehr ändern */
const adm1=await P(T4.code,'admin/result',T4.adm,{gid:g0.gid,sa:6,sb:4});ok(adm1.s===200,'Organisator setzt Ergebnis',adm1.s);
for(const t of [pa,pb]){const r=await P(T4.code,'result',tk4[t],{gid:g0.gid,sa:0,sb:6});ok(r.s===409,'Spieler '+t+' kann ein vom Organisator gesetztes Ergebnis nicht überschreiben',[r.s,r.j&&r.j.err])}
const after=(await st(T4.code,T4.adm)).j;const gg=games(after.S).find(g=>g.gid===g0.gid);ok(gg.sa===6&&gg.sb===4,'Ergebnis unverändert 6:4',[gg.sa,gg.sb]);
/* Wiederholung/Parallel: dasselbe Ergebnis 30 mal gleichzeitig, gegensätzliche Ergebnisse gleichzeitig */
const g1=G.find(g=>g.gid!==g0.gid&&g.a!==g0.a&&g.b!==g0.a&&g.a!==g0.b&&g.b!==g0.b)||G[1];const q1=byIdx[g1.a],q2=byIdx[g1.b];
const par=await Promise.all([...Array.from({length:15},()=>P(T4.code,'result',tk4[q1],{gid:g1.gid,sa:6,sb:1})),...Array.from({length:15},()=>P(T4.code,'result',tk4[q2],{gid:g1.gid,sa:1,sb:6}))]);
ok(par.every(r=>r.s<500),'30 gegensätzliche Ergebnisse gleichzeitig: kein Serverfehler',par.map(r=>r.s));
const fin=games((await st(T4.code,T4.adm)).j.S).find(g=>g.gid===g1.gid);ok((fin.sa===6&&fin.sb===1)||(fin.sa===1&&fin.sb===6),'Spielstand ist ein gültiges Ergebnis, kein Mischmasch',[fin.sa,fin.sb]);
/* Ausscheiden-Anfragen fluten */
const dr=await Promise.all(Array.from({length:40},()=>P(T4.code,'drop-request',tk4[pa],{})));
const reqs=(await st(T4.code,T4.adm)).j.reqs;ok(reqs.filter(r=>r.pid===reqs[0]?.pid).length<=1&&reqs.length<=1,'40 Ausscheiden-Anfragen: höchstens eine offen',reqs.length);
/* Umbenennen */
const rn1=await P(T4.code,'rename',tk4[pa],{name:'Ben'});ok(bad4(rn1.s),'Umbenennen auf vergebenen Namen abgewiesen',rn1.s);
const rn2=await P(T4.code,'rename',tk4[pa],{name:'<b>x</b>'});ok(bad4(rn2.s),'Umbenennen mit Tags abgewiesen',rn2.s);
const kick=await P(T4.code,'admin/kick',tk4[pa],{pid:0});ok(kick.s===403,'Spieler kann niemanden entfernen',kick.s);
/* Konfig-Extreme in der Lobby */
const T5=await create();
const cfgBad=[{R:0},{R:-5},{R:9999},{R:'x'},{R:1.5},{courts:0},{courts:-1},{courts:1000},{dur:1e9},{dur:-1},{brk:1e9},{lim:'ja'},{ov:'boom'},{cn:Array.from({length:5000},(_,i)=>'P'+i)},{cn:['<b>']},{cn:'text'},{cn:[{a:1}]},{t0:'99:99'},{t0:{}},{auto:'x'},{grace:-1},{grace:1e9},{__proto__:{R:3}},{R:null},null,[],'x'];
const cfg0=(await st(T5.code,T5.adm)).j.cfg;
for(const c of cfgBad){const r=await P(T5.code,'admin/config',T5.adm,{cfg:c});ok(r.s<500,'Konfiguration '+JSON.stringify(c).slice(0,40)+' kein 5xx',r.s)}
const cfg1=(await st(T5.code,T5.adm)).j.cfg;ok(cfg1.R>=3&&cfg1.R<=24&&cfg1.courts>=1&&cfg1.courts<=12&&cfg1.dur>=0&&cfg1.dur<=240,'Konfiguration bleibt nach Extremwerten gültig',cfg1);
const tooFew=await P(T5.code,'admin/start',T5.adm,{});ok(tooFew.s===409,'Start ohne Spieler abgewiesen',tooFew.s);

/* ===== 5. Pfade, Methoden, Codes ===== */
console.error('['+((Date.now()-T00)/1000).toFixed(0)+'s] Abschnitt 5');
const weird=[['GET','/api/t/'],['GET','/api/t/ABCDEF'],['GET','/api/t/ABCDEF/'],['GET','/api/t/../../etc/passwd'],['GET','/api/t/%00/state'],['GET','/api/t/'+'A'.repeat(10000)+'/state'],['PUT','/api/t/'+T1.code+'/state'],['DELETE','/api/t/'+T1.code+'/state'],['POST','/api/t/'+T1.code+'/state'],['GET','/api/t/'+T1.code+'/admin/start'],['GET','/api/t/'+T1.code+'/init'],['POST','/api/t/'+T1.code+'/init'],['OPTIONS','/api/t/'+T1.code+'/state'],['HEAD','/api/t/'+T1.code+'/state'],['GET','/api/t/'+T1.code.toLowerCase()+'/state'],['GET','/api/t/'+T1.code+'/state?since=abc'],['GET','/api/t/'+T1.code+'/state?since=-1&since=2'],['GET','/api/t/'+T1.code+'/state?since='+'9'.repeat(5000)],['GET','/api/unbekannt'],['GET','/api']];
for(const [m,p] of weird){const r=await api(m,p);ok(r.s>0&&r.s<500,m+' '+p.slice(0,40)+' kein 5xx',r.s)}
const lc=await api('GET','/api/t/'+T1.code.toLowerCase()+'/state');ok(lc.s===200,'Kleingeschriebener Code funktioniert (Eingabe per Hand)',lc.s);
const nof=await api('GET','/api/t/AAAAAA/state');ok(nof.s===404,'Unbekanntes Turnier gibt 404',nof.s);
/* Anlegen: Wiederherstellung mit Bomben, falscher Schlüssel */
const deep='['.repeat(150000)+']'.repeat(150000);
for(const [l,raw] of [['tief verschachtelt',JSON.stringify({restore:'x'}).replace('"x"',deep)],['Prototype',JSON.stringify({restore:{__proto__:{a:1}}})],['Format falsch',JSON.stringify({restore:{format:'x',v:1}})],['Liste',JSON.stringify({restore:[1,2,3]})],['riesig',JSON.stringify({restore:'a'.repeat(500000)})],['kein JSON','{{']]){
  const r=await api('POST','/api/t',{headers:{'x-create-key':KEY},raw});ok(r.s>=400&&r.s<500,'Anlegen mit '+l+' abgelehnt (4xx)',r.s)}
for(let i=0;i<3;i++){const r=await api('POST','/api/t',{headers:{'x-create-key':'falsch'+i},body:{}});ok(r.s===403,'Falscher Anlege-Schlüssel abgewiesen',r.s)}
const rk=await api('POST','/api/t',{headers:{'x-create-key':KEY},body:{}});ok(rk.s===200,'Richtiger Schlüssel funktioniert danach weiter (3 Fehlversuche sperren nicht)',rk.s);

/* ===== 6. Überflutung: Ein Störer darf die anderen nicht lahmlegen ===== */
console.error('['+((Date.now()-T00)/1000).toFixed(0)+'s] Abschnitt 6');
const T6=await create();const honest=[];
for(const nm of ['Ida','Jan','Kai','Lea']){const r=await join(T6.code,nm);honest.push(r.j.token)}
const evil=await join(T6.code,'Störer');const et=evil.j.token;
/* a) Ein Spieler schickt 1500 Schreib-Anfragen in einer Minute */
await burst(1500,i=>P(T6.code,'rename',et,{name:'Störer '+(i%9)},{ip:'66.66.66.66'}));
let hs=await st(T6.code,honest[0]);ok(hs.s===200&&hs.j.me,'Nach 1500 Schreib-Anfragen eines Störers können Ehrliche weiter lesen',hs.s);
let hw=await P(T6.code,'rename',honest[1],{name:'Jan Ehrlich'});ok(hw.s===200,'... und weiter schreiben (Umbenennen)',[hw.s,hw.j&&hw.j.err]);
const hadm=await P(T6.code,'admin/add',T6.adm,{name:'Neu1'});ok(hadm.s===200,'... und der Organisator kann weiter arbeiten',[hadm.s,hadm.j&&hadm.j.err]);
/* b) Ein Zuschauer ohne Zugang pollt 8000 Mal */
await burst(8000,()=>api('GET','/api/t/'+T6.code+'/state',{ip:'77.77.77.77'}));
hs=await st(T6.code,honest[2]);ok(hs.s===200&&hs.j.me,'Nach 8000 Lese-Anfragen eines Zuschauers können Ehrliche weiter lesen',hs.s);
const hadm2=await api('GET','/api/t/'+T6.code+'/state',{token:T6.adm});ok(hadm2.s===200&&hadm2.j.role==='admin','... und der Organisator ebenfalls',hadm2.s);
/* c) Ein ganzes Lokal teilt eine Adresse: 24 ehrliche Beitritte plus Tippfehler dürfen niemanden aussperren */
const T7=await create(),LAN='55.55.55.55',okJoin=[];
for(let i=0;i<24;i++){if(i%3===0)await join(T7.code,'Anna0',{ip:LAN});const r=await join(T7.code,'Anna'+i,{ip:LAN});okJoin.push(r.s)}
ok(okJoin.filter(x=>x===200).length===23&&okJoin.filter(x=>x!==200).length===1,'24 Beitritte von einer gemeinsamen Adresse (WLAN) klappen trotz Tippfehlern',okJoin);
/* d) Ein Störer füllt die Liste mit Fantasienamen: Organisator schließt die Anmeldung und entfernt ihn */
const T10=await create();const lo=await join(T10.code,'Anna');
await burst(10,i=>join(T10.code,'Spam'+i,{ip:'88.88.88.88'}));
let sp=(await st(T10.code,T10.adm)).j.players;ok(sp.length===11,'Störer konnte Fantasienamen eintragen (zeigt, warum "Anmeldung schließen" nötig ist)',sp.length);
const cl=await P(T10.code,'admin/config',T10.adm,{cfg:{closed:true}});ok(cl.s===200&&cl.j.cfg.closed===true,'Organisator schließt die Anmeldung',[cl.s,cl.j]);
const afterClose=await join(T10.code,'Spam99',{ip:'88.88.88.88'});ok(afterClose.s===409&&afterClose.j.err==='geschlossen','Nach dem Schließen kommt niemand mehr hinein',[afterClose.s,afterClose.j]);
const byPl=await P(T10.code,'admin/config',lo.j.token,{cfg:{closed:false}});ok(byPl.s===403,'Spieler kann die Anmeldung nicht wieder öffnen',byPl.s);
for(const p of sp.filter(x=>x.name.startsWith('Spam')))await P(T10.code,'admin/kick',T10.adm,{pid:p.id});
sp=(await st(T10.code,T10.adm)).j.players;ok(sp.length===1&&sp[0].name==='Anna','Organisator entfernt die Störer, Anna bleibt',sp.map(x=>x.name));
const addAdm=await P(T10.code,'admin/add',T10.adm,{name:'Ben'});ok(addAdm.s===200,'Organisator kann bei geschlossener Anmeldung weiter selbst eintragen',addAdm.s);
await P(T10.code,'admin/config',T10.adm,{cfg:{closed:false}});
/* e) Die eigenen Kontingente: Störer bremst nur sich selbst */
const T11=await create();const e1=await join(T11.code,'Gut1'),e2=await join(T11.code,'Boese');
const flood=await burst(900,()=>api('GET','/api/t/'+T11.code+'/state',{token:e2.j.token,ip:'3.3.3.3'}));
ok(flood.filter(r=>r.s===429).length>=100,'Störer wird nach seinem Kontingent gebremst (429)',flood.filter(r=>r.s===429).length);
const gh=await st(T11.code,e1.j.token);ok(gh.s===200,'Ehrlicher Spieler bleibt unberührt',gh.s);

/* ===== 7. Oberfläche: feindliche Namen in echtem Browser ===== */
console.error('['+((Date.now()-T00)/1000).toFixed(0)+'s] Abschnitt 7');
const br=await chromium.launch(),errs=[];
const pg=async(w,sch)=>{const c=await br.newContext({viewport:{width:w,height:900},colorScheme:sch,locale:'de-CH'});const p=await c.newPage();p.on('pageerror',e=>errs.push(String(e)));p.on('dialog',d=>{errs.push('DIALOG '+d.message());d.dismiss()});return p};
const T8=await create();const names8=[...odd,'Anna','Ben','Cem'];let c8=0;for(const nm of names8){const r=await join(T8.code,nm);if(r.s===200)c8++}
const need=Math.max(0,4-c8);for(let i=0;i<need;i++)await join(T8.code,'Extra'+i);
await P(T8.code,'admin/config',T8.adm,{cfg:{R:3,courts:4}});const sr=await P(T8.code,'admin/start',T8.adm,{});ok(sr.s===200,'Turnier mit feindlichen Namen startet',[sr.s,sr.j]);
for(const [w,sch] of [[390,'light'],[390,'dark'],[1280,'light']]){
  const p=await pg(w,sch);await p.goto(BASE+'/#'+T8.code+'/'+T8.adm);await p.waitForSelector('#tab table',{timeout:15000});
  const r=await p.evaluate(()=>({pwn:window.__pwn,sw:document.documentElement.scrollWidth,iw:innerWidth,imgs:document.querySelectorAll('#app img,#onl img,#onl2 img,#app script,#onl script').length,ev:[...document.querySelectorAll('body *')].filter(e=>[...e.attributes].some(a=>/^on/i.test(a.name)&&/pwn|alert/.test(a.value))).length,txt:document.body.textContent}));
  ok(r.pwn===undefined,'Kein Skript aus Namen ausgeführt '+w+' '+sch,r.pwn);ok(r.sw<=r.iw,'Kein Seitenüberlauf mit feindlichen Namen '+w+' '+sch,[r.sw,r.iw]);
  ok(r.imgs===0&&r.ev===0,'Keine Elemente oder Ereignis-Attribute aus Namen entstanden '+w+' '+sch,[r.imgs,r.ev]);
  ok(r.txt.includes('{{7*7}}')&&r.txt.includes('${7*7}')&&r.txt.includes('😀 Smiley 🎾'),'Sonderzeichen-Namen erscheinen wörtlich '+w+' '+sch);
  /* Spieler-Sicht mit dem Namen aus Skript-Versuch */
  await p.context().close()}
const tokEvil=toks['x" onmouseover="window.__pwn=1'];
ok(errs.length===0,'Keine JS-Fehler und keine Dialoge',errs.slice(0,3));
await br.close();

/* ===== 7b. Laptop als Organisator, Handy als Spieler; Laptop wird mittendrin ausgeschaltet ===== */
console.error('['+((Date.now()-T00)/1000).toFixed(0)+'s] Abschnitt 7b');
{const br2=await chromium.launch();const e2=[];
 const T=await create();const others={};for(const nm of ['Anna','Ben','Cem','Dora','Emil','Fritz','Gerda']){const r=await join(T.code,nm);others[nm]=r.j.token}
 const lc=await br2.newContext({viewport:{width:1280,height:800},locale:'de-CH'}),L=await lc.newPage();L.on('pageerror',e=>e2.push(String(e)));
 const pc=await br2.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,locale:'de-CH'}),Ph=await pc.newPage();Ph.on('pageerror',e=>e2.push(String(e)));
 await L.goto(BASE+'/#'+T.code+'/'+T.adm);await L.waitForSelector('text=Warteraum');
 await Ph.goto(BASE+'/#'+T.code);await Ph.waitForSelector('#nameIn');await Ph.fill('#nameIn','Robin');await Ph.click('[data-act=join]');await Ph.waitForSelector('text=Du bist dabei');
 await L.waitForFunction(()=>document.querySelectorAll('.plist li').length>=8,null,{timeout:15000});
 ok(await L.evaluate(()=>/Organisator/.test(document.body.textContent)),'Laptop zeigt Organisator-Bereich');
 await L.click('details.cfg summary');await L.selectOption('#c','4');await L.selectOption('#r','4');await L.click('[data-act=config]');await L.waitForSelector('text=gespeichert');
 await L.click('[data-act=arm][data-key=start]');await L.click('[data-act=start]');await L.waitForSelector('#tab table');
 await Ph.waitForSelector('.hero .ho',{timeout:15000});
 const opp1=await Ph.textContent('.hero .ho');ok(Object.keys(others).includes(opp1),'Handy zeigt den Gegner für Runde 1',opp1);
 /* Laptop aus: Fenster schließen, Browserdaten gehen mit */
 await lc.close();
 const pst=async()=>(await st(T.code,T.adm)).j;
 /* Alle anderen Spiele von Runde 1 tragen die Spieler per API ein, Robins Spiel das Handy */
 let sv=await pst();const nInit=games(sv.S).length;const nmByIdx=sv.players.map(p=>p.name);const g1=games(sv.S).filter(g=>g.sa==null);
 const mine=g1.find(g=>nmByIdx[g.a]==='Robin'||nmByIdx[g.b]==='Robin');ok(!!mine,'Robin hat ein offenes Spiel');
 for(const g of g1){if(g===mine)continue;const who=nmByIdx[g.a]!=='Robin'?nmByIdx[g.a]:nmByIdx[g.b];const r=await P(T.code,'result',others[nmByIdx[g.a]],{gid:g.gid,sa:6,sb:3});if(r.s!==200)ok(false,'Spieler trägt Ergebnis ein ohne Laptop',[r.s,r.j])}
 const ins=await Ph.$$('.hero .m input');ok(ins.length>=2,'Handy zeigt Eingabefelder',ins.length);
 await ins[0].fill('6');await ins[1].fill('4');await Ph.click('.hero [data-act=save]');
 await Ph.waitForFunction(()=>!document.querySelector('.hero .m input')||/Letztes Ergebnis|Meine Spiele/.test(document.body.textContent),null,{timeout:15000});
 /* Server setzt ohne Laptop selbst die nächste Runde an */
 for(let i=0;i<20;i++){sv=await pst();if(games(sv.S).length>nInit)break;await new Promise(r=>setTimeout(r,1000))}
 ok(games(sv.S).length>nInit,'Ohne Laptop setzt der Server die nächsten Spiele selbst an',[nInit,games(sv.S).length]);
 await Ph.waitForSelector('.hero .ho',{timeout:15000});
 const opp2=await Ph.textContent('.hero .ho');ok(Object.keys(others).includes(opp2),'Handy zeigt Gegner für Runde 2',opp2);
 /* Handy neu laden: Zugang bleibt */
 await Ph.reload();await Ph.waitForSelector('.hero .ho',{timeout:15000});ok(true,'Handy nach Neuladen weiter als Spieler angemeldet');
 /* Laptop wieder an, aber leerer Browser (Daten weg): Organisator-Link stellt den Zugang wieder her */
 const lc2=await br2.newContext({viewport:{width:1280,height:800},locale:'de-CH'}),L2=await lc2.newPage();await L2.goto(BASE+'/#'+T.code+'/'+T.adm);
 await L2.waitForSelector('.panel.adm',{timeout:15000});ok(true,'Neuer Laptop-Browser mit Organisator-Link: Werkzeuge wieder da');
 const noLink=await (await br2.newContext({viewport:{width:1280,height:800}})).newPage();await noLink.goto(BASE+'/#'+T.code);await noLink.waitForSelector('#tab table',{timeout:15000});
 ok(!(await noLink.evaluate(()=>!!document.querySelector('.panel.adm'))),'Ohne Organisator-Link keine Werkzeuge');
 ok(e2.length===0,'Keine JS-Fehler im Zwei-Geräte-Ablauf',e2.slice(0,3));await br2.close()}

/* ===== 7c. Schlechtes Netz: Handy verliert beim Speichern die Verbindung, doppelt tippen, Seite im Hintergrund ===== */
console.error('['+((Date.now()-T00)/1000).toFixed(0)+'s] Abschnitt 7c');
{const br3=await chromium.launch();const e3=[];
 const T=await create();const ot={};for(const nm of ['Anna','Ben','Cem','Dora','Emil','Fritz','Gerda']){const r=await join(T.code,nm);ot[nm]=r.j.token}
 const pc=await br3.newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true,deviceScaleFactor:2,locale:'de-CH'}),Ph=await pc.newPage();Ph.on('pageerror',e=>e3.push(String(e)));
 await Ph.goto(BASE+'/#'+T.code);await Ph.waitForSelector('#nameIn');await Ph.fill('#nameIn','Robin');await Ph.click('[data-act=join]');await Ph.waitForSelector('text=Du bist dabei');
 await P(T.code,'admin/config',T.adm,{cfg:{R:4,courts:4}});await P(T.code,'admin/start',T.adm,{});await Ph.waitForSelector('.hero .m input',{timeout:15000});
 const ins=await Ph.$$('.hero .m input');await ins[0].fill('6');await ins[1].fill('2');
 await pc.setOffline(true);await Ph.click('.hero [data-act=save]');await Ph.waitForTimeout(1500);
 const vals=await Ph.$$eval('.hero .m input',x=>x.map(i=>i.value));ok(vals[0]==='6'&&vals[1]==='2','Offline: eingetippte Werte bleiben stehen',vals);
 const msg=await Ph.evaluate(()=>(document.querySelector('#onlmsg')||{}).textContent||'');ok(msg.length>0,'Offline: Hinweis statt stiller Fehler',msg);
 await pc.setOffline(false);await Ph.waitForTimeout(3500);
 const v2=await Ph.$$eval('.hero .m input',x=>x.map(i=>i.value));ok(v2[0]==='6'&&v2[1]==='2','Nach Wiederverbindung und Neuladen der Daten sind die Werte noch da',v2);
 await Ph.click('.hero [data-act=save]');await Ph.click('.hero [data-act=save]').catch(()=>{});
 await Ph.waitForFunction(()=>!document.querySelector('.hero .m input')||/Letztes Ergebnis/.test(document.body.textContent),null,{timeout:15000});
 const sv=(await st(T.code,T.adm)).j;const mine=games(sv.S).filter(g=>g.sa!=null);ok(mine.length===1&&((mine[0].sa===6&&mine[0].sb===2)||(mine[0].sa===2&&mine[0].sb===6)),'Doppeltes Tippen speichert genau ein Ergebnis',mine.map(g=>[g.sa,g.sb]));
 /* Tab im Hintergrund und wieder vorn */
 await Ph.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))});await Ph.waitForTimeout(500);
 await Ph.evaluate(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'))});await Ph.waitForTimeout(500);
 ok(await Ph.evaluate(()=>!!document.querySelector('.hero,.rankc')),'Nach Hintergrund/Vordergrund weiter benutzbar');
 ok(e3.length===0,'Keine JS-Fehler bei schlechtem Netz',e3.slice(0,3));await br3.close()}

/* ===== 8. Ehrliches Turnier trotz Störfeuer zu Ende spielen ===== */
console.error('['+((Date.now()-T00)/1000).toFixed(0)+'s] Abschnitt 8');
const T9=await create();const h9=[],nm9=['A1','B2','C3','D4','E5','F6','G7','H8','I9','J10','K11'];
for(const nm of nm9){const r=await join(T9.code,nm);h9.push(r.j.token)}
await P(T9.code,'admin/config',T9.adm,{cfg:{R:5,courts:3,draw:false}});await P(T9.code,'admin/start',T9.adm,{});
let seed=7;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff};
let guard=0,stateEnd;
while(guard++<200){
  const sv=(await st(T9.code,T9.adm)).j;if(sv.over||sv.status==='finished'){stateEnd=sv;break}
  const open=games(sv.S).filter(g=>g.sa==null||g.sa===undefined);
  /* Störer zwischendurch: Ergebnisse in fremde Spiele, Unsinn, Fluten */
  await Promise.all([...h9.slice(0,3).map((t,i)=>P(T9.code,'result',t,{gid:open[0]?open[0].gid:0,sa:99,sb:0})),P(T9.code,'confirm',h9[0],{gid:-5}),P(T9.code,'admin/undo',h9[1],{}),P(T9.code,'admin/end',h9[2],{}),P(T9.code,'admin/start',h9[3],{})]);
  if(!open.length){const a=await P(T9.code,'admin/assign',T9.adm,{});if(a.s!==200&&guard>150)break;continue}
  for(const g of open.slice(0,3)){const w=rnd()<.5;await P(T9.code,'admin/result',T9.adm,{gid:g.gid,sa:w?6:Math.floor(rnd()*5),sb:w?Math.floor(rnd()*5):6})}
}
if(!stateEnd){await P(T9.code,'admin/end',T9.adm,{});stateEnd=(await st(T9.code,T9.adm)).j}
const cnt={};const tally=games(stateEnd.S).filter(g=>g.sa!=null);tally.forEach(g=>{cnt[g.a]=(cnt[g.a]||0)+1;cnt[g.b]=(cnt[g.b]||0)+1});
ok(Object.keys(cnt).length>=nm9.length-1,'Spiele sind gespielt worden',cnt);
const cs=Object.values(cnt);ok(Math.max(...cs)-Math.min(...cs)<=1,'Alle Spieler haben (nahezu) gleich viele Spiele trotz Störfeuer (Zusatzspiele zählen nur für den Bedürftigen)',cnt);
ok(stateEnd.status==='finished'||stateEnd.over,'Turnier beendet',stateEnd.status);

ok(five.length===0,'Kein einziger Serverfehler (5xx) im ganzen Test',five.slice(0,5));
console.log(f?'FEHLER: '+f+' von '+n:'ALLES OK ('+n+' Prüfungen)');process.exit(f?1:0);
