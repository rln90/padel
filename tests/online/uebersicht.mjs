// Übersicht der offenen Turniere auf der Startseite (Schlüssel des Organisators) und Löschen.
// PADEL_URL=http://localhost:8787 PADEL_KEY=geheim node tests/online/uebersicht.mjs
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const BASE=process.env.PADEL_URL||'http://localhost:8787',KEY=process.env.PADEL_KEY||'geheim';
let f=0,n=0;const ok=(c,m,x)=>{n++;if(!c){f++;console.log('FEHLER',m,x===undefined?'':JSON.stringify(x).slice(0,300))}};
let ipn=1200;const ip=()=>'61.0.'+((ipn>>8)&255)+'.'+(ipn++&255);
async function api(method,path,o={}){const h={'cf-connecting-ip':o.ip||ip()};if(o.token)h.authorization='Bearer '+o.token;if(o.key)h['x-create-key']=o.key;
  const body=o.body!==undefined?JSON.stringify(o.body):undefined;if(body!==undefined)h['content-type']='application/json';
  const r=await fetch(BASE+path,{method,headers:h,body});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch(e){}return{s:r.status,j}}
const mk=async(players,start)=>{const c=(await api('POST','/api/t',{key:KEY,body:{}})).j;for(let i=0;i<players;i++)await api('POST','/api/t/'+c.code+'/join',{body:{name:'Spieler '+(i+1)}});
  if(start)await api('POST','/api/t/'+c.code+'/admin/start',{token:c.adminKey,body:{}});return c};
const A=await mk(3,false),B=await mk(6,true);
const br=await chromium.launch(),errs=[];
const ctx=await br.newContext({viewport:{width:360,height:780},isMobile:true,hasTouch:true,locale:'de-CH'});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(String(e)));p.on('dialog',d=>{errs.push('DIALOG');d.dismiss()});
await p.goto(BASE+'/');await p.waitForSelector('#newT');
const msg=async()=>(await p.textContent('#onlmsg').catch(()=>''))||'';
await p.click('#newT summary');
ok(await p.isVisible('[data-act=overview]'),'Knopf "Offene Turniere anzeigen" vorhanden');
await p.click('[data-act=overview]');await p.waitForTimeout(300);ok(/Schlüssel/.test(await msg()),'Ohne Schlüssel: Hinweis',await msg());
await p.fill('#ckey','falsch');await p.click('[data-act=overview]');await p.waitForTimeout(500);ok(/Falscher Schlüssel/.test(await msg()),'Falscher Schlüssel: Fehlermeldung',await msg());
ok(await p.locator('.ovl').count()===0,'Falscher Schlüssel: keine Liste');
await p.fill('#ckey',KEY);await p.click('[data-act=overview]');await p.waitForSelector('.ovl li');
const items=await p.$$eval('.ovl li',a=>a.map(x=>({code:x.querySelector('b').textContent,txt:x.innerText.replace(/\s+/g,' ')})));
const ia=items.find(x=>x.code===A.code),ib=items.find(x=>x.code===B.code);
ok(!!ia&&/Warteraum/.test(ia.txt)&&/3 Spieler/.test(ia.txt),'Warteraum-Turnier mit 3 Spielern in der Liste',ia);
ok(!!ib&&/Läuft/.test(ib.txt)&&/6 Spieler/.test(ib.txt),'Laufendes Turnier mit 6 Spielern in der Liste',ib);
ok(/zuletzt geändert/.test(ia.txt)&&/automatisch gelöscht am (Mo|Di|Mi|Do|Fr|Sa|So), \d+\.\d+\./.test(ia.txt),'Zeit der letzten Änderung und Tag der automatischen Löschung sichtbar',ia.txt);
ok(!/undefined|NaN|\[object|Invalid/.test(await p.evaluate(()=>document.body.innerText)),'Keine kaputten Texte');
ok(await p.evaluate(()=>document.querySelector('#newT').open),'Bereich bleibt nach dem Laden geöffnet');
ok(await p.inputValue('#ckey')===KEY,'Schlüssel bleibt im Feld (zweite Aktion ohne erneutes Tippen)');
ok(!/geheim/.test(await p.evaluate(()=>JSON.stringify(localStorage)+location.href+document.cookie)),'Schlüssel wird nirgends gespeichert');
const lay=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth}));ok(lay.sw<=lay.iw+1,'Kein Überlauf bei 360 px',lay);
await p.screenshot({path:process.env.PADEL_SHOT||'/tmp/uebersicht.png',fullPage:true});
/* Öffnen */
await p.click(`.ovl li:has(b:text-is("${A.code}")) [data-act=view]`);await p.waitForSelector('text=Warteraum');ok(p.url().endsWith('#'+A.code),'Öffnen führt zum Turnier',p.url());
await p.goto(BASE+'/');await p.waitForSelector('#newT');ok(await p.locator('.ovl').count()===0,'Nach Neuaufruf keine alte Liste im Speicher');
/* Löschen: erst nachfragen, dann löschen */
await p.click('#newT summary');await p.fill('#ckey',KEY);await p.click('[data-act=overview]');await p.waitForSelector('.ovl li');
const row=`.ovl li:has(b:text-is("${A.code}"))`;
await p.click(row+' [data-act=arm]');ok(/Wirklich löschen\?/.test(await p.textContent(row)),'Löschen fragt nach');
ok((await api('GET','/api/t/'+A.code+'/state')).s===200,'Nach der ersten Berührung noch nicht gelöscht');
await p.click(row+' [data-act=delt]');await p.waitForFunction(c=>!document.body.innerText.includes(c)||!document.querySelector('.ovl li b')||![...document.querySelectorAll('.ovl li b')].some(b=>b.textContent===c),A.code,{timeout:8000});
ok((await api('GET','/api/t/'+A.code+'/state')).s===404,'Gelöschtes Turnier ist auf dem Server weg');
ok(/gelöscht/.test(await msg()),'Bestätigung "gelöscht" sichtbar',await msg());
ok([...await p.$$eval('.ovl li b',a=>a.map(x=>x.textContent))].includes(B.code),'Das andere Turnier bleibt in der Liste');
ok((await api('GET','/api/t/'+B.code+'/state')).s===200,'Das andere Turnier läuft weiter');
/* Arm verfällt */
await p.click(`.ovl li:has(b:text-is("${B.code}")) [data-act=arm]`);await p.waitForTimeout(6600);
ok(!/Wirklich löschen\?/.test(await p.evaluate(()=>document.body.innerText)),'Nachfrage verschwindet nach wenigen Sekunden von selbst');
ok((await api('GET','/api/t/'+B.code+'/state')).s===200,'Ohne Bestätigung bleibt das Turnier');
/* Leere Liste */
await p.click(`.ovl li:has(b:text-is("${B.code}")) [data-act=arm]`);await p.click(`.ovl li:has(b:text-is("${B.code}")) [data-act=delt]`);await p.waitForTimeout(1200);
const rest=await p.$$eval('.ovl li b',a=>a.map(x=>x.textContent));ok(!rest.includes(B.code),'Zweites Turnier gelöscht',rest);
/* Viele Einträge: Layout */
const many=[];for(let i=0;i<12;i++)many.push(await mk(i%3?2:0,false));
await p.click('[data-act=overview]');await p.waitForSelector('.ovl li');
const lay2=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,n:document.querySelectorAll('.ovl li').length}));ok(lay2.sw<=lay2.iw+1&&lay2.n>=12,'12 Einträge ohne Überlauf',lay2);
for(const m of many)await api('POST','/api/overview/delete',{key:KEY,body:{code:m.code}});
/* Falscher Schlüssel beim Löschen */
const C=await mk(1,false);await p.fill('#ckey',KEY);await p.click('[data-act=overview]');await p.waitForSelector(`.ovl li:has(b:text-is("${C.code}"))`);
await p.fill('#ckey','falsch');await p.click(`.ovl li:has(b:text-is("${C.code}")) [data-act=arm]`);await p.click(`.ovl li:has(b:text-is("${C.code}")) [data-act=delt]`);await p.waitForTimeout(600);
ok((await api('GET','/api/t/'+C.code+'/state')).s===200&&/Falscher Schlüssel/.test(await msg()),'Löschen mit falschem Schlüssel wird abgelehnt',await msg());
await api('POST','/api/overview/delete',{key:KEY,body:{code:C.code}});
ok(errs.length===0,'Keine JS-Fehler',errs.slice(0,3));
await br.close();console.log(f?'FEHLER: '+f+' von '+n:'ALLES OK ('+n+' Prüfungen)');process.exit(f?1:0);
