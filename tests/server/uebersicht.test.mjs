// Übersicht der offenen Turniere (Verzeichnis) und Löschen durch den Organisator.
import {makeEnv,client} from './harness.mjs';
let f=0,n=0;const ok=(c,m,x)=>{n++;if(!c){f++;console.log('FEHLER '+m,x===undefined?'':JSON.stringify(x).slice(0,300))}};
const T=x=>`/api/t/${x}`,K={'x-create-key':'geheim'};
async function mk(cfg={},eo={}){const env=makeEnv(eo),c=client(env);const r=await c('POST','/api/t',{headers:K,body:{cfg}});return{env,c,code:r.json.code,adm:r.json.adminKey}}
const list=(c,h=K)=>c('GET','/api/overview',{headers:h});
const NAMES=['Anna','Ben','Cem','Dora','Emil','Fay'];
async function fill(c,code,k){const t=[];for(let i=0;i<k;i++)t.push((await c('POST',T(code)+'/join',{body:{name:NAMES[i]}})).json)  ;return t}

// ---- Zugriff und Schlüssel
{
  const {env,c,code}=await mk();
  const l=await list(c);ok(l.status===200&&l.json.ok&&Array.isArray(l.json.items),'Liste mit Schlüssel: 200',l.status);
  const it=l.json.items.find(x=>x.code===code);ok(!!it&&it.st==='lobby'&&it.n===0&&it.c>0&&it.e>it.t,'Neues Turnier steht sofort in der Liste (Warteraum, 0 Spieler, Ablaufzeit)',it);
  ok(Object.keys(it).sort().join()==='c,code,e,n,st,t','Eintrag enthält nur Code, Status, Zahlen und Zeiten (keine Namen, keine Schlüssel)',Object.keys(it));
  ok((await list(c,{})).status===403,'Liste ohne Schlüssel: 403');
  ok((await list(c,{'x-create-key':'falsch'})).status===403,'Liste mit falschem Schlüssel: 403');
  ok((await c('POST','/api/overview',{headers:K,body:{}})).status===405,'Liste per POST: 405');
  ok((await c('GET','/api/overview/delete',{headers:K})).status===405,'Löschen per GET: 405');
  ok((await c('POST','/api/overview/delete',{body:{code}})).status===403,'Löschen ohne Schlüssel: 403');
  ok(!/Anna|adminHash|a_|token/.test((await list(c)).text),'Antwort ohne Namen, Hashes oder Zugänge');
  const e2=makeEnv({createKey:undefined}),c2=client(e2);ok((await c2('GET','/api/overview')).status===503,'Ohne CREATE_KEY: 503');
  const e3=makeEnv({noDirectory:true}),c3=client(e3);ok((await list(c3)).status===503&&(await list(c3)).json.err==='nicht_eingerichtet','Ohne Verzeichnis: 503 nicht_eingerichtet, kein Absturz');
  const r3=await c3('POST','/api/t',{headers:K,body:{}});ok(r3.status===200,'Anlegen funktioniert auch ohne Verzeichnis');
  ok((await c3('POST',T(r3.json.code)+'/join',{body:{name:'Anna'}})).status===200,'Beitritt funktioniert auch ohne Verzeichnis');
}
// ---- Aktualisierung: Spielerzahl, Start, Ergebnisse (höchstens alle 5 Minuten), Ende
{
  const {env,c,code,adm}=await mk({R:4,courts:2,auto:'reported'});
  const get=async()=>(await list(c)).json.items.find(x=>x.code===code);
  const tk=await fill(c,code,6);ok((await get()).n===6,'Beitritte: Spielerzahl sofort aktuell',(await get()).n);
  await c('POST',T(code)+'/leave',{token:tk[5].token});ok((await get()).n===5,'Austragen: Spielerzahl sofort aktuell');
  await c('POST',T(code)+'/admin/start',{token:adm,body:{}});ok((await get()).st==='running'&&(await get()).n===5,'Start: Status "running"',await get());
  const puts0=env.stats.dirPuts,t0=(await get()).t;
  const st=(await c('GET',T(code)+'/state',{token:adm})).json;const g=JSON.stringify(st.S).match(/"gid":(\d+)/)[1];
  env.clock+=60e3;await c('POST',T(code)+'/admin/result',{token:adm,body:{gid:+g,sa:6,sb:2}});
  ok(env.stats.dirPuts===puts0,'Ergebnis innerhalb von 5 Minuten: keine zusätzliche Meldung ans Verzeichnis',[puts0,env.stats.dirPuts]);
  env.clock+=6*60e3;const st2=(await c('GET',T(code)+'/state',{token:adm})).json;const g2=JSON.stringify(st2.S).match(/"gid":(\d+)/g).map(x=>+x.slice(6)).find(x=>x!==+g);
  await c('POST',T(code)+'/admin/result',{token:adm,body:{gid:g2,sa:6,sb:3}});
  const it=await get();ok(env.stats.dirPuts===puts0+1&&it.t>t0,'Nach 5 Minuten: eine Meldung, "zuletzt geändert" aktualisiert',[env.stats.dirPuts-puts0,it.t-t0]);
  const e=await c('POST',T(code)+'/admin/end',{token:adm,body:{confirm:true}});ok(e.status===200,'Turnier beenden',e.status);
  ok(!(await list(c)).json.items.some(x=>x.code===code),'Nach "Turnier beenden" nicht mehr in der Liste');
  ok((await c('GET',T(code)+'/state')).status===404,'Beendetes Turnier ist weg');
}
// ---- Löschen durch den Organisator
{
  const a=await mk({R:3});const c=a.c,env=a.env;
  const b=await c('POST','/api/t',{headers:K,body:{}});const code2=b.json.code;
  await fill(c,a.code,4);
  const l0=(await list(c)).json.items;ok(l0.length===2,'Zwei Turniere in der Liste',l0.length);
  ok((await c('POST','/api/overview/delete',{headers:K,body:{code:'abc'}})).status===400,'Ungültiger Code: 400');
  ok((await c('POST','/api/overview/delete',{headers:K,body:{}})).status===400,'Fehlender Code: 400');
  const d=await c('POST','/api/overview/delete',{headers:K,body:{code:a.code.toLowerCase()}});ok(d.status===200&&d.json.ok,'Löschen (Kleinschreibung erlaubt): 200',d.status);
  ok((await c('GET',T(a.code)+'/state')).status===404,'Gelöschtes Turnier: 404');
  ok((await c('POST',T(a.code)+'/join',{body:{name:'Neu'}})).status===404,'Beitritt zu gelöschtem Turnier: 404');
  ok((await c('GET',T(a.code)+'/state',{token:a.adm})).status===404,'Organisator-Link des gelöschten Turniers: 404');
  const l1=(await list(c)).json.items;ok(l1.length===1&&l1[0].code===code2,'Nur das andere Turnier bleibt',l1.map(x=>x.code));
  ok((await c('GET',T(code2)+'/state')).status===200,'Das andere Turnier läuft weiter');
  const ghost=await c('POST','/api/overview/delete',{headers:K,body:{code:'ZZZZZZ'}});ok(ghost.status===200,'Unbekanntes Turnier löschen: 200 (räumt Eintrag auf)');
  env._dir.set('t:QQQQQQ',{code:'QQQQQQ',st:'running',n:3,c:1,t:1,e:env.clock+1e6});ok((await list(c)).json.items.some(x=>x.code==='QQQQQQ'),'Verwaister Eintrag erscheint (Test aufgebaut)');
  await c('POST','/api/overview/delete',{headers:K,body:{code:'QQQQQQ'}});ok(!(await list(c)).json.items.some(x=>x.code==='QQQQQQ'),'Verwaister Eintrag lässt sich löschen');
  const dd=await c('POST','/api/overview/delete',{headers:K,body:{code:code2}});ok(dd.status===200&&(await list(c)).json.items.length===0,'Liste leer nach dem Löschen aller Turniere');
  const el=await c('POST','/api/overview/delete',{headers:K,body:{code:code2}});ok(el.status===200,'Zweites Löschen desselben Codes: 200, kein Fehler');
}
// ---- Interne Wege sind von außen nicht erreichbar
{
  const {c,code,adm}=await mk();
  for(const [m,p] of [['POST',T(code)+'/__loeschen'],['POST',T(code)+'/%5F%5Floeschen'],['POST',T(code)+'/init'],['GET',T(code)+'/list'],['POST',T(code)+'/set'],['POST',T(code)+'/del'],['POST','/api/overview/'+code]]){
    const r=await c(m,p,{token:adm,body:{code}});ok(r.status===404||r.status===405,m+' '+p+' nicht erreichbar',r.status)}
  ok((await c('GET',T(code)+'/state',{token:adm})).status===200,'Turnier nach den Versuchen unverändert');
}
// ---- Ablauf nach 7 Tagen entfernt auch den Eintrag
{
  const {env,c,code}=await mk();ok((await list(c)).json.items.some(x=>x.code===code),'Vor Ablauf in der Liste');
  env.clock+=8*864e5;await env.alarmAll();
  ok(!(await list(c)).json.items.some(x=>x.code===code),'Nach Ablauf (Alarm) nicht mehr in der Liste');
  ok((await c('GET',T(code)+'/state')).status===404,'Abgelaufenes Turnier ist weg');
  const x=await mk();x.env._dir.set('t:OLDOLD',{code:'OLDOLD',st:'lobby',n:0,c:1,t:1,e:x.env.clock-2*36e5});
  ok(!(await list(x.c)).json.items.some(i=>i.code==='OLDOLD'),'Längst abgelaufener, verwaister Eintrag wird beim Auflisten entfernt');
}
// ---- Verzeichnis fällt aus: Turniere laufen unbeeinträchtigt weiter
{
  let down=false;const {env,c,code,adm}=await mk({R:3},{dirFail:()=>down});down=true;
  const j=await c('POST',T(code)+'/join',{body:{name:'Anna'}});ok(j.status===200,'Beitritt trotz Ausfall des Verzeichnisses: 200',j.status);
  for(const nm of ['Ben','Cem','Dora'])await c('POST',T(code)+'/join',{body:{name:nm}});
  const s=await c('POST',T(code)+'/admin/start',{token:adm,body:{}});ok(s.status===200,'Start trotz Ausfall: 200',s.status);
  ok((await list(c)).status===503,'Liste bei Ausfall: 503 mit klarer Meldung');
  const del=await c('POST','/api/overview/delete',{headers:K,body:{code}});ok(del.status===503&&del.json.msg&&!/undefined|Error/.test(del.text),'Löschen bei Ausfall: 503 mit klarer Meldung',del.text);
  down=false;ok((await list(c)).status===200,'Nach der Störung wieder erreichbar');
}
// ---- Schutz: Schlüsselraten und Last
{
  const {c,code}=await mk();
  let last;for(let i=0;i<8;i++)last=await list(c,{'x-create-key':'x'+i,'cf-connecting-ip':'9.9.9.9'});
  const bl=await list(c,{...K,'cf-connecting-ip':'9.9.9.9'});ok(bl.status===429&&bl.json.err==='gesperrt','Nach 8 falschen Schlüsseln gesperrt, auch mit richtigem',bl.status);
  const other=await list(c,{...K,'cf-connecting-ip':'8.8.8.8'});ok(other.status===200,'Andere Adresse bleibt unberührt');
  let allOk=true;for(let i=0;i<40;i++){const r=await list(c,{...K,'cf-connecting-ip':'7.7.7.7'});if(r.status!==200)allOk=false}
  ok(allOk,'40 Abrufe der Liste mit richtigem Schlüssel werden nicht als Anlegen gezählt');
  const cr=await c('POST','/api/t',{headers:{...K,'cf-connecting-ip':'7.7.7.7'},body:{}});ok(cr.status===200,'Anlegen danach weiterhin möglich');
  let del=true;for(let i=0;i<40;i++){const r=await c('POST','/api/overview/delete',{headers:{...K,'cf-connecting-ip':'6.6.6.6'},body:{code:'ZZZZZZ'}});if(r.status!==200)del=false}
  ok(del,'40 Löschversuche mit richtigem Schlüssel: kein Zähler für Anlegen');
}
console.log(f?`FEHLER gesamt ${f} von ${n}`:`ALLES OK (${n} Prüfungen)`);process.exit(f?1:0);
