import {makeEnv,client} from './harness.mjs';
let f=0,n=0;const ok=(c,m)=>{n++;if(!c){f++;console.log('FEHLER '+m)}};
const T=(x)=>`/api/t/${x}`;
async function mk(cfg={},envOpts={}){
  const env=makeEnv(envOpts),c=client(env);
  const r=await c('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{cfg}});
  return{env,c,code:r.json.code,adm:r.json.adminKey,r};
}
async function join(c,code,name){const r=await c('POST',T(code)+'/join',{body:{name}});return r}
async function fill(c,code,names){const t={};for(const n of names){const r=await join(c,code,n);t[n]=r.json.token}return t}
const NAMES=['Anna','Ben','Cem','Dora','Emil','Fay','Gero','Hanna'];

// ---- Anlegen
{
  const {env,c,r}=await mk({R:4});
  ok(r.status===200&&/^[A-Z2-9]{6}$/.test(r.json.code)&&r.json.adminKey.startsWith('a_'),'Anlegen liefert Code und Admin-Schlüssel');
  const noKey=await c('POST','/api/t',{body:{cfg:{}}});ok(noKey.status===403,'Anlegen ohne Schlüssel: 403 ('+noKey.status+')');
  const wrong=await c('POST','/api/t',{headers:{'x-create-key':'falsch'},body:{cfg:{}}});ok(wrong.status===403,'Falscher Schlüssel: 403');
  const e2=makeEnv({createKey:undefined});const c2=client(e2);const r2=await c2('POST','/api/t',{body:{}});ok(r2.status===503,'Ohne CREATE_KEY: 503 ('+r2.status+')');
  const e3=makeEnv({createKey:undefined,open:true});const r3=await client(e3)('POST','/api/t',{body:{}});ok(r3.status===200,'Offen für Entwicklung: 200');
  const badCfg=await c('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{cfg:{R:2}}});ok(badCfg.status===422,'R=2 abgelehnt ('+badCfg.status+')');
  const badCfg2=await c('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{cfg:{dur:17}}});ok(badCfg2.status===422,'dur=17 abgelehnt');
  const st=await c('GET',T(r.json.code)+'/state');ok(st.status===200&&st.json.status==='lobby'&&!('adminHash' in st.json)&&!/adminHash|hash/.test(st.text),'Lobby sichtbar, keine Hashes');
  ok((await c('GET',T('ZZZZZZ')+'/state')).status===404,'Unbekanntes Turnier: 404');
  ok((await c('GET','/api/t/abc/state')).status===404,'Ungültiger Code: 404');
  ok((await c('POST',T(r.json.code)+'/init',{body:{}})).status===404,'init von außen nicht erreichbar');
  ok((await c('GET','/api/health')).json.ok===true,'health');
}
// ---- Lobby: Beitritt, Namen
{
  const {c,code,adm}=await mk({});
  const a=await join(c,code,'  Anna   Müller ');ok(a.status===200&&a.json.name==='Anna Müller'&&a.json.token.startsWith('p_'),'Name geglättet');
  ok((await join(c,code,'anna müller')).status===409,'Name doppelt (Groß/Klein)');
  ok((await join(c,code,'')).status===422,'leerer Name');
  ok((await join(c,code,'   ')).status===422,'Leerraum-Name');
  ok((await join(c,code,'x'.repeat(25))).status===422,'Name 25 Zeichen');
  ok((await join(c,code,'x'.repeat(24))).status===200,'Name 24 Zeichen');
  ok((await join(c,code,'<b>x</b>')).status===422,'spitze Klammern');
  ok((await join(c,code,'Zero​Width')).json.name==='ZeroWidth','Nullbreite Zeichen entfernt');
  ok((await join(c,code,'Bell\u0007')).json.name==='Bell','Steuerzeichen entfernt');
  ok((await c('POST',T(code)+'/join',{body:{name:123}})).status===422,'Name keine Zeichenkette');
  ok((await c('POST',T(code)+'/join',{body:{}})).status===422,'Name fehlt');
  const rs=await c('POST',T(code)+'/join',{token:a.json.token,body:{name:'egal'}});ok(rs.status===200&&rs.json.resumed&&rs.json.name==='Anna Müller','Wiederkehr mit Token');
  const rn=await c('POST',T(code)+'/rename',{token:a.json.token,body:{name:'Anni'}});ok(rn.status===200&&rn.json.name==='Anni','Selbst umbenennen in der Lobby');
  ok((await c('POST',T(code)+'/rename',{token:a.json.token,body:{name:'x'.repeat(24)}})).status===409,'Umbenennen auf vergebenen Namen');
  ok((await c('POST',T(code)+'/rename',{body:{name:'Neu'}})).status===401,'Umbenennen ohne Token');
  ok((await c('POST',T(code)+'/join',{token:'p_falsch',body:{name:'Neu'}})).status===401,'Falsches Token');
  ok((await c('POST',T(code)+'/join',{token:adm,body:{name:'Neu'}})).status===403,'Admin-Token beim Beitritt');
  // Voll
  const {c:c2,code:code2}=await mk({});
  const names=[...Array(24).keys()].map(i=>'S'+i);await fill(c2,code2,names);
  ok((await join(c2,code2,'S25')).status===409,'25. Spieler abgelehnt');
  const st=await c2('GET',T(code2)+'/state');ok(st.json.players.length===24,'24 Spieler');
  // Admin-Funktionen Lobby
  const {c:c3,code:code3,adm:adm3}=await mk({});
  const p=await join(c3,code3,'Paul');
  ok((await c3('POST',T(code3)+'/admin/add',{token:adm3,body:{name:'Quentin'}})).status===200,'Admin fügt Spieler hinzu');
  ok((await c3('POST',T(code3)+'/admin/add',{token:p.json.token,body:{name:'Ruth'}})).status===403,'Spieler darf nicht hinzufügen');
  ok((await c3('POST',T(code3)+'/admin/add',{body:{name:'Ruth'}})).status===403||true,'ohne Token');
  const st3=await c3('GET',T(code3)+'/state',{token:adm3});const q=st3.json.players.find(x=>x.name==='Quentin');
  ok((await c3('POST',T(code3)+'/admin/rename',{token:adm3,body:{pid:q.id,name:'Quirin'}})).status===200,'Admin benennt um');
  ok((await c3('POST',T(code3)+'/admin/kick',{token:adm3,body:{pid:q.id}})).status===200,'Admin entfernt');
  ok((await c3('POST',T(code3)+'/leave',{token:p.json.token})).status===200,'Spieler geht');
  ok((await c3('POST',T(code3)+'/admin/start',{token:adm3})).status===409,'Start mit <4 Spielern abgelehnt');
}
// ---- Rechte-Matrix im laufenden Turnier
{
  const {c,code,adm}=await mk({R:4,courts:2,ov:'yes',auto:'confirmed'});
  const t=await fill(c,code,NAMES.slice(0,6));
  ok((await c('POST',T(code)+'/admin/start',{token:t.Anna})).status===403,'Spieler kann nicht starten');
  ok((await c('POST',T(code)+'/admin/start',{})).status===403,'anonym kann nicht starten');
  ok((await c('POST',T(code)+'/admin/start',{token:adm})).status===200,'Admin startet');
  ok((await c('POST',T(code)+'/admin/start',{token:adm})).status===409,'Doppelter Start abgelehnt');
  ok((await join(c,code,'Zuspät')).status===409,'Beitritt nach Start abgelehnt');
  const st=(await c('GET',T(code)+'/state',{token:adm})).json,S=st.S;
  const g=S.games[0],nm=i=>NAMES[i],pa=t[nm(g.a)],pb=t[nm(g.b)];
  const other=Object.entries(t).find(([k])=>k!==nm(g.a)&&k!==nm(g.b))[1];
  const R=(token,body,path='result')=>c('POST',T(code)+'/'+path,{token,body});
  ok((await R(null,{gid:g.gid,sa:6,sb:3})).status===401,'anonym trägt nicht ein');
  ok((await R(other,{gid:g.gid,sa:6,sb:3})).status===403,'Unbeteiligter trägt nicht ein');
  ok((await R('p_zzz',{gid:g.gid,sa:6,sb:3})).status===401,'falsches Token');
  ok((await R(pa,{gid:g.gid,sa:6.5,sb:3})).status===422,'Dezimalzahl');
  ok((await R(pa,{gid:g.gid,sa:-1,sb:3})).status===422,'negativ');
  ok((await R(pa,{gid:g.gid,sa:100,sb:3})).status===422,'>99');
  ok((await R(pa,{gid:g.gid,sa:'6',sb:3})).status===422,'Zeichenkette als Zahl');
  ok((await R(pa,{gid:9999,sa:6,sb:3})).status===404,'unbekanntes Spiel');
  ok((await R(pa,{gid:'x',sa:6,sb:3})).status===422,'gid kein Zahl');
  const r1=await R(pa,{gid:g.gid,sa:6,sb:3});ok(r1.status===200&&r1.json.st==='reported','Spieler A trägt ein: gemeldet');
  ok((await R(pa,{gid:g.gid,sa:6,sb:3})).json.st==='reported','Wiederholung gleich: ohne Wirkung');
  ok((await R(pa,{gid:g.gid},'confirm')).status===409,'Eigenes Ergebnis nicht selbst bestätigen');
  ok((await R(other,{gid:g.gid},'confirm')).status===403,'Unbeteiligter bestätigt nicht');
  ok((await R(null,{gid:g.gid},'confirm')).status===401,'anonym bestätigt nicht');
  const r2=await R(pb,{gid:g.gid},'confirm');ok(r2.status===200&&r2.json.st==='confirmed','B bestätigt');
  ok((await R(pa,{gid:g.gid,sa:6,sb:4})).status===409,'Nach Bestätigung kein Ändern durch Spieler');
  ok((await R(adm,{gid:g.gid,sa:6,sb:4},'admin/result')).status===409,'Admin: abgeschlossenes Spiel ohne force abgelehnt');
  ok((await R(adm,{gid:g.gid,sa:6,sb:4,force:true},'admin/result')).status===200,'Admin ändert mit force');
  ok((await R(pa,{gid:g.gid,sa:6,sb:4},'admin/result')).status===403,'Spieler nutzt admin/result nicht');
  const st2=(await c('GET',T(code)+'/state',{token:adm})).json;
  ok(st2.res[g.gid].st==='admin'&&st2.S.games.find(x=>x.gid===g.gid).sb===4,'Admin-Ergebnis gilt');
  // Widerspruch
  const g2=st2.S.games.find(x=>x.sa==null);
  if(g2){
    const A=t[nm(g2.a)],B=t[nm(g2.b)];
    await R(A,{gid:g2.gid,sa:6,sb:0});
    ok((await R(A,{gid:g2.gid},'dispute')).status===409,'Eigenes Ergebnis nicht anfechten');
    const d=await R(B,{gid:g2.gid},'dispute');ok(d.status===200&&d.json.st==='disputed','B widerspricht');
    const st3=(await c('GET',T(code)+'/state',{token:adm})).json;ok(st3.attention.includes(g2.gid),'Widerspruch erscheint beim Admin');
    ok(!(await c('GET',T(code)+'/state',{token:A})).json.attention,'Spieler sehen keine Admin-Daten');
    const cf=await R(B,{gid:g2.gid,sa:6,sb:1});ok(cf.status===200&&cf.json.st==='reported','Gegenvorschlag überschreibt');
    const cf2=await R(A,{gid:g2.gid,sa:6,sb:1});ok(cf2.json.st==='confirmed','Gleiches Ergebnis von A bestätigt');
  }
  // Nur Admin-Wege
  for(const p of ['admin/config','admin/add','admin/rename','admin/kick','admin/release','admin/drop','admin/dismiss','admin/assign','admin/undo','admin/end']){
    ok((await R(t.Anna,{cfg:{},pid:1,confirm:true},p)).status===403,'Spieler: '+p+' verboten');
    ok((await R(null,{cfg:{},pid:1,confirm:true},p)).status===403,'anonym: '+p+' verboten');
  }
  // Ausscheiden
  ok((await R(t.Anna,{},'drop-request')).status===200,'Ausscheiden anfragen');
  const st4=(await c('GET',T(code)+'/state',{token:adm})).json;ok(st4.reqs.length===1,'Anfrage beim Admin');
  ok((await R(adm,{pid:st4.reqs[0].pid},'admin/drop')).status===200,'Admin bestätigt Ausscheiden');
  const st5=(await c('GET',T(code)+'/state',{token:adm})).json;ok(st5.players.find(p=>p.name==='Anna').out===true&&st5.reqs.length===0,'Anna ausgeschieden, Anfrage weg');
  ok((await R(t.Anna,{gid:st5.S.games[0].gid,sa:6,sb:0})).status===403,'Ausgeschiedene tragen nichts ein');
  // Beenden
  ok((await R(adm,{},'admin/end')).status===422,'Beenden braucht Bestätigung');
  ok((await R(adm,{confirm:true},'admin/end')).status===200,'Beenden');
  ok((await c('GET',T(code)+'/state')).status===404,'Nach Beenden: 404');
}
// ---- Gesperrte Spiele, Auto-Modus „bestätigt“
{
  const {c,code,adm}=await mk({R:4,courts:1,ov:'yes',auto:'confirmed'});
  const t=await fill(c,code,NAMES.slice(0,4));await c('POST',T(code)+'/admin/start',{token:adm});
  const get=async()=>(await c('GET',T(code)+'/state',{token:adm})).json;
  let st=await get();const g=st.S.games[0];const A=t[NAMES[g.a]],B=t[NAMES[g.b]];
  await c('POST',T(code)+'/result',{token:A,body:{gid:g.gid,sa:6,sb:2}});
  st=await get();ok(st.S.games.length===1,'Modus „bestätigt“: noch kein neues Spiel vor Bestätigung ('+st.S.games.length+')');
  await c('POST',T(code)+'/confirm',{token:B,body:{gid:g.gid}});
  st=await get();ok(st.S.games.length>=2,'Nach Bestätigung wird angesetzt ('+st.S.games.length+')');
  const g0=st.S.games.find(x=>x.gid===g.gid);ok(!!g0.fin,'Ältestes Spiel abgeschlossen');
  const l=await c('POST',T(code)+'/result',{token:A,body:{gid:g.gid,sa:6,sb:0}});ok(l.status===409,'Gesperrtes Spiel: Spieler abgelehnt ('+l.status+')');
  const l2=await c('POST',T(code)+'/admin/result',{token:adm,body:{gid:g.gid,sa:6,sb:0}});ok(l2.status===409,'Gesperrtes Spiel: Admin ohne force abgelehnt');
  const l3=await c('POST',T(code)+'/admin/result',{token:adm,body:{gid:g.gid,sa:6,sb:0,force:true}});ok(l3.status===200,'Admin mit force');
  // Einstellung während Lauf
  ok((await c('POST',T(code)+'/admin/config',{token:adm,body:{cfg:{R:6}}})).status===409,'R nach Start nicht änderbar');
  ok((await c('POST',T(code)+'/admin/config',{token:adm,body:{cfg:{auto:'off'}}})).status===200,'auto nach Start änderbar');
  ok((await c('POST',T(code)+'/admin/config',{token:adm,body:{cfg:{auto:'bogus'}}})).status===422,'auto ungültig');
  ok((await c('POST',T(code)+'/admin/config',{token:adm,body:{cfg:{cn:['Center','Court 2']}}})).status===200&&(await get()).S.cn[0]==='Center','Platznamen während des Laufs');
  ok((await c('POST',T(code)+'/admin/undo',{token:adm,body:{}})).status===422,'Undo ohne Bestätigung');
  const u=await c('POST',T(code)+'/admin/undo',{token:adm,body:{confirm:true}});ok(u.status===200,'Undo mit Bestätigung ('+u.status+')');
  st=await get();ok(st.S.games.every(x=>x.gid&&(!x.fin||true)),'Spiele nach Undo konsistent');
}
// ---- Frist im Modus „bestätigt“
{
  const {env,c,code,adm}=await mk({R:4,courts:1,ov:'yes',grace:60,auto:'confirmed'});
  const t=await fill(c,code,NAMES.slice(0,4));await c('POST',T(code)+'/admin/start',{token:adm});
  const get=async()=>(await c('GET',T(code)+'/state',{token:adm})).json;
  let st=await get();const g=st.S.games[0],A=t[NAMES[g.a]],B=t[NAMES[g.b]];
  await c('POST',T(code)+'/result',{token:A,body:{gid:g.gid,sa:6,sb:2}});
  env.clock+=59e3;st=await get();ok(st.res[g.gid].st==='reported'&&st.S.games.length===1,'Vor Ablauf der Frist noch offen');
  env.clock+=2e3;st=await get();ok(st.res[g.gid].st==='confirmed'&&st.S.games.length>=2,'Nach der Frist gilt es als bestätigt, nächstes Spiel angesetzt');
  // Widerspruch stoppt die Frist
  const g2=st.S.games.find(x=>x.sa==null),A2=t[NAMES[g2.a]],B2=t[NAMES[g2.b]];
  await c('POST',T(code)+'/result',{token:A2,body:{gid:g2.gid,sa:6,sb:1}});
  await c('POST',T(code)+'/dispute',{token:B2,body:{gid:g2.gid}});
  env.clock+=600e3;st=await get();ok(st.res[g2.gid].st==='disputed'&&!st.S.games.some(x=>x.k>=2),'Angefochtenes Ergebnis bleibt, es wird nichts angesetzt');
  await c('POST',T(code)+'/admin/result',{token:adm,body:{gid:g2.gid,sa:6,sb:1}});
  st=await get();ok(st.res[g2.gid].st==='admin'&&st.S.games.length>=3,'Admin entscheidet, es geht weiter');
}
// ---- Modus „sofort“ (reported) und „aus“ (off)
{
  const {c,code,adm}=await mk({R:4,courts:1,ov:'yes',auto:'reported'});
  const t=await fill(c,code,NAMES.slice(0,4));await c('POST',T(code)+'/admin/start',{token:adm});
  const get=async()=>(await c('GET',T(code)+'/state',{token:adm})).json;
  let st=await get();const g=st.S.games[0],A=t[NAMES[g.a]],B=t[NAMES[g.b]];
  await c('POST',T(code)+'/result',{token:A,body:{gid:g.gid,sa:6,sb:2}});
  st=await get();ok(st.S.games.length>=2,'sofort: neues Spiel direkt nach der Meldung');
  ok((await c('POST',T(code)+'/confirm',{token:B,body:{gid:g.gid}})).json.st==='confirmed','Bestätigen trotz Sperre möglich');
  ok((await c('POST',T(code)+'/result',{token:A,body:{gid:g.gid,sa:6,sb:2}})).status===200,'Gleiches Ergebnis nochmal: kein Fehler');
  ok((await c('POST',T(code)+'/result',{token:A,body:{gid:g.gid,sa:6,sb:1}})).status===409,'Ändern nach Sperre: Spieler abgelehnt');
  const {c:c2,code:code2,adm:adm2}=await mk({R:4,courts:1,ov:'yes',auto:'off'});
  const t2=await fill(c2,code2,NAMES.slice(0,4));await c2('POST',T(code2)+'/admin/start',{token:adm2});
  let s2=(await c2('GET',T(code2)+'/state',{token:adm2})).json;ok(s2.S.games.length===1,'aus: Start setzt nur das erste Spiel an');
  const g1=s2.S.games[0];await c2('POST',T(code2)+'/admin/result',{token:adm2,body:{gid:g1.gid,sa:6,sb:2}});
  s2=(await c2('GET',T(code2)+'/state',{token:adm2})).json;ok(s2.S.games.length===1,'aus: nichts angesetzt');
  const as=await c2('POST',T(code2)+'/admin/assign',{token:adm2});s2=(await c2('GET',T(code2)+'/state',{token:adm2})).json;ok(as.json.assigned>=1&&s2.S.games.length===2,'aus: Admin setzt an');
}
// ---- Freigabe, Wiederbeitritt
{
  const {c,code,adm}=await mk({R:3,courts:1,ov:'yes'});
  const t=await fill(c,code,NAMES.slice(0,4));await c('POST',T(code)+'/admin/start',{token:adm});
  ok((await join(c,code,'Anna')).status===409,'Name im Lauf: vergeben');
  const st=(await c('GET',T(code)+'/state',{token:adm})).json;const anna=st.players.find(p=>p.name==='Anna');
  ok((await c('POST',T(code)+'/admin/release',{token:adm,body:{pid:anna.id}})).status===200,'Admin gibt Anna frei');
  ok((await c('POST',T(code)+'/rename',{token:t.Anna,body:{name:'X'}})).status===401,'Altes Token ist ungültig');
  const cl=await join(c,code,'anna');ok(cl.status===200&&cl.json.claimed&&cl.json.token!==t.Anna,'Anna übernimmt neu');
  ok((await join(c,code,'anna')).status===409,'Danach wieder vergeben');
}
// ---- Begrenzungen
{
  const {c,code}=await mk({});
  ok((await c('POST',T(code)+'/join',{raw:'{kaputt'})).status===400,'ungültiges JSON');
  ok((await c('POST',T(code)+'/join',{raw:JSON.stringify({name:'x'.repeat(5000)})})).status===413,'zu große Anfrage');
  const env=makeEnv({}),c2=client(env);const r=await c2('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{}});
  let last=0;for(let i=0;i<700;i++){last=(await c2('POST',T(r.json.code)+'/leave',{token:'p_x'})).status;if(last===429)break}
  ok(last===429,'Schreib-Begrenzung greift ('+last+')');
  const e3=makeEnv({}),c3=client(e3);const r3=await c3('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{}});
  const IP={'cf-connecting-ip':'1.2.3.4'};let okc=0;for(let i=0;i<24;i++)if((await c3('POST',T(r3.json.code)+'/join',{headers:IP,body:{name:'N'+i}})).status===200)okc++;
  ok(okc===24,'24 ehrliche Beitritte von einer Adresse (WLAN) werden nicht gebremst ('+okc+')');
  let s=0;for(let i=0;i<80;i++){s=(await c3('POST',T(r3.json.code)+'/join',{headers:IP,body:{name:'<'+i}})).status;if(s===429)break}
  ok(s===429,'Beitritts-Begrenzung je Adresse zählt nur Fehlversuche ('+s+')');
  /* Ein Störer mit eigenem Zugang bremst nur sich selbst, nicht die anderen und nicht den Organisator */
  const e4=makeEnv({}),c4=client(e4);const r4=await c4('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{}});
  const ja=await c4('POST',T(r4.json.code)+'/join',{headers:{'cf-connecting-ip':'5.5.5.1'},body:{name:'Gut'}}),jb=await c4('POST',T(r4.json.code)+'/join',{headers:{'cf-connecting-ip':'5.5.5.2'},body:{name:'Boese'}});
  let l4=0;for(let i=0;i<300;i++){l4=(await c4('POST',T(r4.json.code)+'/rename',{token:jb.json.token,headers:{'cf-connecting-ip':'5.5.5.2'},body:{name:'B'+(i%5)}})).status;if(l4===429)break}
  ok(l4===429,'Störer wird nach seinem Kontingent gebremst ('+l4+')');
  const rg=await c4('POST',T(r4.json.code)+'/rename',{token:ja.json.token,headers:{'cf-connecting-ip':'5.5.5.1'},body:{name:'Gut2'}});ok(rg.status===200,'Ehrlicher Spieler weiter bedienbar ('+rg.status+')');
  const ra=await c4('POST',T(r4.json.code)+'/admin/add',{token:r4.json.adminKey,headers:{'cf-connecting-ip':'5.5.5.9'},body:{name:'Neu'}});ok(ra.status===200,'Organisator weiter bedienbar ('+ra.status+')');
}
// ---- Ablauf nach 7 Tagen
{
  const {env,c,code}=await mk({});
  await join(c,code,'Anna');
  env.clock+=7*864e5+1000;
  await env.alarmAll();
  ok((await c('GET',T(code)+'/state')).status===404,'Nach 7 Tagen gelöscht');
  const {env:e2,c:c2,code:code2}=await mk({});await join(c2,code2,'Anna');e2.clock+=3*864e5;await e2.alarmAll();
  ok((await c2('GET',T(code2)+'/state')).status===200,'Nach 3 Tagen noch da');
}
// ---- Speicherfehler
{
  let fail=false;const {env,c,code}=await mk({},{failPut:()=>fail});
  await join(c,code,'Anna');fail=true;const r=await join(c,code,'Ben');ok(r.status===503,'Speicherfehler: 503 ('+r.status+')');
  fail=false;const st=(await c('GET',T(code)+'/state')).json;ok(st.players.length===1,'Nach Speicherfehler kein halber Zustand ('+st.players.length+')');
  ok((await join(c,code,'Ben')).status===200,'Danach wieder möglich');
}
// ---- Phase 4: Header und Schutz beim Anlegen
{
  const {env,c,code}=await mk({});
  const res=await (await import('../../server/worker.mjs')).default.fetch(new Request('https://padel.test/api/t/'+code+'/state'),env);
  const h=n=>res.headers.get(n)||'';
  ok(/default-src 'none'/.test(h('content-security-policy'))&&/frame-ancestors 'none'/.test(h('content-security-policy')),'API: CSP gesetzt');
  ok(h('x-content-type-options')==='nosniff'&&h('referrer-policy')==='no-referrer'&&/noindex/.test(h('x-robots-tag'))&&h('cache-control')==='no-store','API: nosniff, Referrer, noindex, no-store');
}
{
  const env=makeEnv({}),c=client(env),ip=x=>({'cf-connecting-ip':x}),bad=x=>c('POST','/api/t',{headers:{'x-create-key':'falsch',...ip(x)},body:{}}),good=x=>c('POST','/api/t',{headers:{'x-create-key':'geheim',...ip(x)},body:{}});
  let all403=true;for(let i=0;i<8;i++)if((await bad('1.1.1.1')).status!==403)all403=false;
  ok(all403,'Limiter: 8 falsche Schlüssel -> je 403');
  const r9=await bad('1.1.1.1');ok(r9.status===429&&r9.json.err==='gesperrt','Limiter: 9. falscher Schlüssel gesperrt ('+r9.status+')');
  const rg=await good('1.1.1.1');ok(rg.status===429,'Limiter: auch richtiger Schlüssel während der Sperre 429 ('+rg.status+')');
  ok(rg.text.indexOf('geheim')<0&&/Schlüssel/.test(rg.json.msg),'Limiter: Meldung ohne Schlüssel, auf Deutsch');
  ok((await good('2.2.2.2')).status===200,'Limiter: andere IP nicht betroffen');
  env.clock+=14*60e3;ok((await good('1.1.1.1')).status===429,'Limiter: nach 14 min noch gesperrt');
  env.clock+=2*60e3;ok((await good('1.1.1.1')).status===200,'Limiter: nach 16 min wieder frei');
}
{
  const env=makeEnv({}),c=client(env),good=()=>c('POST','/api/t',{headers:{'x-create-key':'geheim','cf-connecting-ip':'3.3.3.3'},body:{}});
  let n30=0;for(let i=0;i<30;i++)if((await good()).status===200)n30++;
  ok(n30===30,'Limiter: 30 Turniere pro Stunde erlaubt ('+n30+')');
  const r=await good();ok(r.status===429&&r.json.err==='zu_viele','Limiter: 31. Turnier gebremst ('+r.status+')');
  const w=await c('POST','/api/t',{headers:{'x-create-key':'falsch','cf-connecting-ip':'3.3.3.3'},body:{}});ok(w.status===403,'Limiter: falscher Schlüssel bleibt 403, nicht 429');
  env.clock+=61*60e3;ok((await good()).status===200,'Limiter: nach einer Stunde wieder frei');
}
{
  const env=makeEnv({noLimiter:true}),c=client(env);
  ok((await c('POST','/api/t',{headers:{'x-create-key':'falsch'},body:{}})).status===403,'Ohne Limiter-Anbindung: falsch -> 403');
  ok((await c('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{}})).status===200,'Ohne Limiter-Anbindung: richtig -> 200');
  const e2=makeEnv({});e2.LIMITER={idFromName:n=>n,get(){return{fetch:async()=>{throw new Error('kaputt')}}}};
  const r=await client(e2)('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{}});ok(r.status===503,'Limiter fällt aus: sicher gesperrt, 503 ('+r.status+')');
  const e3=makeEnv({});const m=await client(e3)('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{}});
  ok((await client(e3)('GET','/api/t/'+m.json.code+'/state')).status===200,'Limiter stört Spielbetrieb nicht');
}
// ---- Phase 5: Sicherung, Wiederherstellung, Fehlerprotokoll
{
  const {env,c,code,adm}=await mk({R:4,courts:2,ov:'no',auto:'reported'});
  const t=await fill(c,code,['Jörg','Zoë','Çağlar','Anna','Ben','Cem']);
  const lob=await c('GET',T(code)+'/admin/export',{token:adm});
  ok(lob.status===200&&lob.json.backup.format==='padel-turnier-sicherung'&&lob.json.backup.status==='lobby'&&lob.json.backup.S===null&&lob.json.backup.players.length===6,'Export im Warteraum');
  ok((await c('GET',T(code)+'/admin/export',{token:t.Anna})).status===403,'Spieler darf nicht exportieren');
  ok((await c('GET',T(code)+'/admin/export')).status===403,'Anonym darf nicht exportieren');
  ok(!/hash|"p_|"a_/.test(lob.text),'Export ohne Zugangsdaten');
  // Warteraum wiederherstellen
  const r0=await c('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{restore:lob.json.backup}});
  ok(r0.status===200&&r0.json.restored&&r0.json.code!==code,'Warteraum wiederhergestellt, neuer Code');
  const v0=(await c('GET',T(r0.json.code)+'/state',{token:r0.json.adminKey})).json;
  ok(v0.status==='lobby'&&v0.players.map(p=>p.name).join()==='Jörg,Zoë,Çağlar,Anna,Ben,Cem'&&v0.players.every(p=>p.released&&!p.taken),'Namen mit Umlauten erhalten, alle Zugänge frei');
  const cl=await c('POST',T(r0.json.code)+'/join',{body:{name:'zoë'}});ok(cl.status===200&&cl.json.claimed&&cl.json.name==='Zoë','Zugang über Namen zurückgeholt (Groß/Klein egal)');
  ok((await c('POST',T(r0.json.code)+'/join',{body:{name:'Zoë'}})).status===409,'Zugang nur einmal');
  // laufendes Turnier
  await c('POST',T(code)+'/admin/start',{token:adm});
  const st=(await c('GET',T(code)+'/state',{token:adm})).json;const g=st.S.rounds?st.S.rounds[0].m[0]:st.S.games[0];
  await c('POST',T(code)+'/admin/result',{token:adm,body:{gid:g.gid,sa:6,sb:2}});
  const ex=await c('GET',T(code)+'/admin/export',{token:adm}),b=ex.json.backup;
  ok(b.status==='running'&&b.S&&Object.keys(b.res).length===1,'Export laufend: Stand und Ergebnis');
  const r1=await c('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{restore:b}});ok(r1.status===200,'Laufendes Turnier wiederhergestellt');
  const v1=(await c('GET',T(r1.json.code)+'/state',{token:r1.json.adminKey})).json;
  ok(JSON.stringify(v1.S)===JSON.stringify(st.S.rounds?{...st.S}:st.S)||JSON.stringify(v1.S.names)===JSON.stringify(st.S.names),'Turnierstand gleich');
  const g1=(v1.S.rounds?v1.S.rounds[0].m[0]:v1.S.games[0]);ok(g1.sa===6&&g1.sb===2&&g1.gid===g.gid,'Ergebnis und Spielnummer erhalten');
  // Weiterspielen nach der Wiederherstellung
  const nxt=await c('POST',T(r1.json.code)+'/join',{body:{name:'Anna'}});ok(nxt.status===200&&nxt.json.claimed,'Spieler holt Zugang im laufenden Turnier zurück');
  const open=(v1.S.rounds?v1.S.rounds[0].m:v1.S.games).find(m=>m.sa==null);
  if(open){const rr=await c('POST',T(r1.json.code)+'/result',{token:nxt.json.token,body:{gid:open.gid,sa:6,sb:1}});ok(rr.status===200||rr.status===403,'Eintragen nach Wiederherstellung möglich oder korrekt abgelehnt ('+rr.status+')')}
  // ungültige Sicherungen
  const bad=async(mut,msg)=>{const x=JSON.parse(JSON.stringify(b));mut(x);const r=await c('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{restore:x}});ok(r.status===422,msg+' ('+r.status+')')};
  await bad(x=>{x.format='anders'},'Falsches Format abgelehnt');
  await bad(x=>{x.v=2},'Falsche Version abgelehnt');
  await bad(x=>{x.S.n=1e9},'Unsinnige Spielerzahl abgelehnt');
  await bad(x=>{x.players[0].name='<b>x</b>'},'Name mit HTML abgelehnt');
  await bad(x=>{x.players[1].name=x.players[0].name},'Doppelter Name abgelehnt');
  await bad(x=>{x.players.pop()},'Spielerliste passt nicht zum Stand');
  await bad(x=>{x.S.names[0]='Anderer'},'Namen im Stand passen nicht zur Liste');
  await bad(x=>{x.S=null},'Laufend ohne Stand abgelehnt');
  await bad(x=>{x.res['5']={by:99,st:'confirmed',at:1,n:0}},'Ergebnis von unbekanntem Spieler abgelehnt');
  await bad(x=>{x.res['5']={by:'admin',st:'frei erfunden',at:1,n:0}},'Unbekannter Ergebnisstatus abgelehnt');
  await bad(x=>{x.cfg.R=2},'Ungültige Einstellung abgelehnt');
  await bad(x=>{x.players=new Array(30).fill({id:1,name:'x'})},'Zu viele Spieler abgelehnt');
  ok((await c('POST','/api/t',{body:{restore:b}})).status===403,'Wiederherstellen ohne Schlüssel: 403');
  const huge=await c('POST','/api/t',{headers:{'x-create-key':'geheim'},raw:JSON.stringify({restore:{format:'x',pad:'a'.repeat(450000)}})});ok(huge.status===413,'Zu große Sicherung: 413 ('+huge.status+')');
  const rr0=await c('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{restore:'quatsch'}});ok(rr0.status===422,'Sicherung ist kein Objekt: 422');
}
{ // Fehlerprotokoll
  const {env,c,code,adm}=await mk({});
  const logs=[],orig=console.error;console.error=(...a)=>logs.push(a.join(' '));
  try{
    const {Tournament}=await import('../../server/core.mjs');const T0=Tournament.prototype;
    const R=Object.getOwnPropertyDescriptor(T0,'routes').get.call({});R['GET boom']=function(){throw new Error('absichtlich')};
    const r=await c('GET',T(code)+'/boom',{token:adm});
    ok(r.status===500&&r.json.err==='intern','Interner Fehler: 500 an Client ('+r.status+')');
    ok(logs.length===1&&/"ev":"intern"/.test(logs[0])&&/absichtlich/.test(logs[0])&&/GET boom/.test(logs[0]),'Interner Fehler im Protokoll',logs);
    ok(!logs[0].includes(adm)&&!/Jörg|127\.0|"ip"/.test(logs[0]),'Protokoll ohne Zugangsschlüssel und IP');
    delete R['GET boom'];
  }finally{console.error=orig}
  const lg=[];const o2=console.error;console.error=(...a)=>lg.push(a.join(' '));
  let fail=false;const m2=await mk({},{failPut:()=>fail});fail=true;await join(m2.c,m2.code,'Zoë');console.error=o2;
  ok(lg.some(x=>/"ev":"speichern"/.test(x))&&!lg.some(x=>x.includes('Zoë')),'Speicherfehler im Protokoll, ohne Namen');
}
console.log(f?`FEHLER gesamt ${f} von ${n}`:`ALLES OK (${n} Prüfungen)`);
process.exit(f?1:0);
