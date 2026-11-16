// Sicherung herunterladen und wiederherstellen im echten Browser. PADEL_URL=http://localhost:8787 PADEL_KEY=geheim node tests/online/backup.mjs
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('playwright');
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const B=process.env.PADEL_URL||'http://localhost:8787',KEY=process.env.PADEL_KEY||'geheim';let f=0,n=0;const ok=(c,m,x)=>{n++;if(!c){f++;console.log('FEHLER',m,x===undefined?'':JSON.stringify(x))}};
const J=async(m,p,b,t)=>{const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json','x-create-key':KEY,...(t?{authorization:'Bearer '+t}:{})},body:m==='POST'?JSON.stringify(b||{}):undefined});return{s:r.status,j:await r.json()}};
// Turnier per Schnittstelle vorbereiten
const c=await J('POST','/api/t',{cfg:{R:4,courts:2,ov:'no',auto:'reported'}}),code=c.j.code,adm=c.j.adminKey,names=['Jörg','Zoë','Çağlar','Anna','Ben','Cem'];
for(const nm of names)await J('POST',`/api/t/${code}/join`,{name:nm});
await J('POST',`/api/t/${code}/admin/start`,{},adm);
const st=(await J('GET',`/api/t/${code}/state`,null,adm)).j,g0=(st.S.rounds?st.S.rounds[0].m:st.S.games).slice(0,2);
for(const [i,g] of g0.entries())await J('POST',`/api/t/${code}/admin/result`,{gid:g.gid,sa:6,sb:i+1},adm);
const br=await chromium.launch(),errs=[];
const mk=async(o={})=>{const ctx=await br.newContext({viewport:{width:390,height:844},acceptDownloads:true,...o});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|status of 4(03|09|22)/.test(m.text()))errs.push(m.text())});return p};
// Download
const A=await mk();await A.goto(`${B}/#${code}/${adm}`);await A.waitForSelector('#tab table');
const [dl]=await Promise.all([A.waitForEvent('download'),A.click('[data-act=export]')]);
const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'sich-')),'sicherung.json');await dl.saveAs(file);
ok(/^padel-sicherung-[A-Z0-9]{6}-\d{8}-\d{4}\.json$/.test(dl.suggestedFilename()),'Dateiname sinnvoll: '+dl.suggestedFilename());
const txt=fs.readFileSync(file,'utf8'),bk=JSON.parse(txt);
ok(bk.format==='padel-turnier-sicherung'&&bk.players.map(p=>p.name).join()===names.join(),'Datei enthält Spieler mit Umlauten');
ok(!/hash|"p_|"a_/.test(txt),'Datei ohne Zugangsdaten');
await A.waitForSelector('text=Sicherung heruntergeladen');ok(true,'Meldung nach dem Download');
// Wiederherstellen auf der Startseite
const R=await mk();await R.goto(B+'/');await R.waitForSelector('#codeIn');
await R.click('#newT summary');await R.fill('#ckey','falsch');await R.click('details.restore summary');await R.setInputFiles('#rfile',file);await R.click('[data-act=restore]');
await R.waitForSelector('.onlmsg:has-text("Falscher Schlüssel")');ok(true,'Falscher Schlüssel wird abgelehnt');
await R.fill('#ckey',KEY);await R.click('[data-act=restore]');await R.waitForSelector('#tab table',{timeout:15000});
const code2=(await R.evaluate(()=>window.__online.state().D.code));ok(code2&&code2!==code,'Neuer Turniercode '+code2);
await R.waitForSelector('text=Wiederhergestellt als Turnier');ok(true,'Hinweis nach der Wiederherstellung');
const D2=await R.evaluate(()=>{const D=window.__online.state().D;return{names:D.S.names,status:D.status,res:Object.keys(D.res).length,rel:D.players.every(p=>p.released&&!p.taken)}});
ok(D2.status==='running'&&D2.names.join()===names.join()&&D2.res===2&&D2.rel,'Stand wiederhergestellt',D2);
ok((await R.evaluate(()=>location.hash)).startsWith('#'+code2)&&!/a_/.test(await R.evaluate(()=>location.hash)),'Organisator-Schlüssel nicht in der Adresszeile');
// Spieler holt Zugang zurück
const P=await mk();await P.goto(`${B}/#${code2}`);await P.waitForSelector('#nameIn');await P.fill('#nameIn','Zoë');await P.click('[data-act=join]');
await P.waitForSelector('text=/Dein Spiel|Du bist|Zoë/',{timeout:10000});
const me=await P.evaluate(()=>{const D=window.__online.state().D;return D.me&&D.me.name});ok(me==='Zoë','Spieler Zoë hat seinen Zugang zurück ('+me+')');
// kaputte Datei
const bad=path.join(path.dirname(file),'kaputt.json');fs.writeFileSync(bad,'{"nein":');
const R2=await mk();await R2.goto(B+'/');await R2.click('#newT summary');await R2.fill('#ckey',KEY);await R2.click('details.restore summary');await R2.setInputFiles('#rfile',bad);await R2.click('[data-act=restore]');
await R2.waitForSelector('.onlmsg:has-text("keine gültige Sicherung")');ok(true,'Kaputte Datei: verständliche Meldung');
const alien=path.join(path.dirname(file),'fremd.json');fs.writeFileSync(alien,JSON.stringify({format:'x'}));await R2.setInputFiles('#rfile',alien);await R2.click('[data-act=restore]');
await R2.waitForSelector('.onlmsg:has-text("keine Sicherungsdatei")');ok(true,'Fremde Datei: abgelehnt');
ok(errs.length===0,'Keine Browserfehler',errs.slice(0,3));
await br.close();console.log(f?`FEHLER gesamt ${f} von ${n}`:`ALLES OK (${n} Prüfungen)`);process.exit(f?1:0);
