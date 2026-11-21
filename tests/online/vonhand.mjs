// Browser: „Spiel von Hand ansetzen“ – Organisator legt Spiel an, Spieler trägt Ergebnis ein
import {createRequire} from 'node:module';const require=createRequire(new URL('../../package.json',import.meta.url));const {chromium}=require('playwright');
const BASE=process.env.BASE||'http://localhost:8787';let n=Math.floor(Math.random()*30000)+10000;const ip=()=>'92.0.'+((n>>8)&255)+'.'+(n++&255);
async function api(m,p,o={}){const h={'cf-connecting-ip':ip()};if(o.t)h.authorization='Bearer '+o.t;if(o.key)h['x-create-key']=o.key;if(o.b!==undefined)h['content-type']='application/json';
  const r=await fetch(BASE+p,{method:m,headers:h,body:o.b!==undefined?JSON.stringify(o.b):undefined});return {s:r.status,j:await r.json()}}
let f=0,k=0;const ok=(c,m)=>{k++;if(!c){f++;console.log('FEHLER',m)}};
const c=(await api('POST','/api/t',{key:'geheim',b:{cfg:{R:5,courts:3,ov:'wait',draw:true,auto:'reported'}}})).j;
const NM=['Chef','Oger','Alge','Papa','Peter','<b>Inv</b>','Robin'],tok={};
for(const nm of NM)tok[nm]=(await api('POST','/api/t/'+c.code+'/join',{b:{name:nm}})).j.token;
await api('POST','/api/t/'+c.code+'/admin/start',{t:c.adminKey,b:{}});
// ein Spiel beenden, damit ein Platz frei ist
let st=(await api('GET','/api/t/'+c.code+'/state',{t:c.adminKey})).j;const g0=st.S.games.find(g=>g.sa==null);
await api('POST','/api/t/'+c.code+'/admin/result',{t:c.adminKey,b:{gid:g0.gid,sa:6,sb:2,force:true}});
// Spiel des Platzes nicht automatisch neu: wir nehmen das wieder angesetzte zurück, falls vorhanden – einfach prüfen ob Platz frei
const br=await chromium.launch(),ctx=await br.newContext({viewport:{width:390,height:844}}),p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.goto(BASE+'/#'+c.code+'/'+c.adminKey);await p.waitForSelector('.panel.adm',{timeout:15000});
await p.click('details[data-k="manual"] summary');await p.waitForTimeout(200);
const hasSel=await p.locator('select[data-d="mana"]').count();
if(!hasSel){const txt=await p.locator('details[data-k="manual"]').innerText();ok(/belegt|keine zwei/.test(txt),'Hinweis statt Auswahl: '+txt);console.log('Hinweis:',txt.trim())}
else{
  const opts=await p.locator('select[data-d="mana"] option').allTextContents();ok(opts.every(o=>/\(\d+ Sp\.\)/.test(o)),'Optionen mit Spielzahl');
  ok(!(await p.content()).includes('<b>Inv</b> ('),'Name escaped');
  const va=await p.locator('select[data-d="mana"] option').nth(0).getAttribute('value'),vb=await p.locator('select[data-d="manb"] option').nth(1).getAttribute('value');
  await p.selectOption('select[data-d="mana"]',va);await p.selectOption('select[data-d="manb"]',vb);
  const before=(await api('GET','/api/t/'+c.code+'/state',{t:c.adminKey})).j.S.games.length;
  await p.click('details[data-k="manual"] button:has-text("Spiel ansetzen")');await p.waitForTimeout(150);
  await p.click('details[data-k="manual"] button:has-text("Wirklich ansetzen?")');await p.waitForTimeout(1500);
  const s2=(await api('GET','/api/t/'+c.code+'/state',{t:c.adminKey})).j,ng=s2.S.games.find(g=>g.sa==null&&g.a===+va&&g.b===+vb);
  ok(s2.S.games.length===before+1&&!!ng,'Spiel angelegt');
  // gleiche Spieler erneut: Fehler, wird angezeigt
  const r=await api('POST','/api/t/'+c.code+'/admin/pair',{t:c.adminKey,b:{a:+va,b:+vb,c:0}});ok(r.s===409,'erneut: abgelehnt');
  // Spieler sieht und meldet Ergebnis

  const r2=await api('POST','/api/t/'+c.code+'/result',{t:tok[NM[+va]],b:{gid:ng.gid,sa:6,sb:4}});ok(r2.s===200,'Spieler meldet');
  const r3=await api('POST','/api/t/'+c.code+'/confirm',{t:tok[NM[+vb]],b:{gid:ng.gid}});ok(r3.s===200||r3.s===404,'Gegner bestätigt ('+r3.s+')');
}
ok(errs.length===0,'keine JS-Fehler '+errs.join('|'));
await br.close();console.log(f?`FEHLER ${f} von ${k}`:`ALLES OK (${k} Prüfungen)`);process.exit(f?1:0);
