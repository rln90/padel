// Generalprobe: 9 Spieler mit Umlauten und Sonderzeichen auf Handy-Bildschirmen, Organisator spielt mit,
// Neuladen mitten im Turnier, Ausscheiden mit Bestätigung, Korrektur durch den Organisator, Endtabelle.
// PADEL_URL=http://localhost:8787 PADEL_KEY=geheim node tests/online/generalprobe.mjs
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const BASE=process.env.PADEL_URL||'http://localhost:8787',KEY=process.env.PADEL_KEY||'geheim';
let f=0,n=0;const ok=(c,m,x)=>{n++;if(!c){f++;console.log('FEHLER',m,x===undefined?'':JSON.stringify(x))}};
const br=await chromium.launch(),errs=[],B404=[];
const mk=async()=>{const c=await br.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'de-CH'});const p=await c.newPage();p.on('response',async r=>{if(r.status()===404){try{B404.push((await r.text()).slice(0,200))}catch(e){}}});
  p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|status of 4(04|09|22|29)/.test(m.text()))errs.push(m.text())});return p};
const A=await mk();await A.goto(BASE+'/');await A.waitForSelector('#codeIn');
await A.click('#newT summary');await A.fill('#ckey',KEY);await A.click('[data-act=create]');await A.waitForSelector('text=Warteraum');
const code=(await A.textContent('h2')).trim().replace(/^.*Turnier\s+/,'').slice(0,6);
const names=['Jörg','Zoë','Çağlar','Müller-Lüdenscheidt','Åsa','Björn','Łukasz','Sven'],pl={};
for(const nm of names){const p=await mk();await p.goto(BASE+'/#'+code);await p.waitForSelector('#nameIn');await p.fill('#nameIn',nm);await p.click('[data-act=join]');await p.waitForSelector('text=Du bist dabei');pl[nm]=p}
await A.fill('#nameIn','Robin');await A.click('[data-act=join]');await A.waitForSelector('text=Du bist dabei');
await A.waitForFunction(()=>document.querySelectorAll('.plist li').length===9,null,{timeout:15000});
const SEE=()=>[...document.querySelectorAll('#onl,#app,#onl2')].map(e=>e.textContent+' '+[...e.querySelectorAll('input')].map(i=>i.value).join(' ')).join(' ');
const txt=await A.evaluate(SEE);
for(const nm of names)ok(txt.includes(nm),'Name unverändert sichtbar: '+nm);
ok(!/Ã|Â|�|&amp;|&lt;/.test(txt),'Keine kaputten Zeichen im Warteraum');
await A.click('details.cfg summary');await A.selectOption('#r','4');await A.selectOption('#c','2');await A.click('[data-act=config]');await A.waitForSelector('text=gespeichert');
await A.click('[data-act=arm][data-key=start]');await A.click('[data-act=start]');await A.waitForSelector('#tab table');
let entered=0,guard=0,reloaded=false,dropped=false,corrected=false;
const state=()=>A.evaluate(()=>{const D=window.__online.state().D;return{st:D.status,reqs:(D.reqs||[]).length}});
const enter=async(p)=>{const rows=await p.$$('.mygame .mw');for(const r of rows){const ins=await r.$$('input'),btn=await r.$('[data-act=save]');if(!btn||ins.length<2)continue;
  const t=await r.textContent();if(/Eintragen/.test(t)&&!/Gemeldet|Bestätigt|Vom Organisator/.test(t)&&(await ins[0].inputValue())===''){
    const a=6,b=entered%6;try{await ins[0].fill(String(a));await ins[1].fill(String(b));await btn.click({timeout:3000});entered++;return true}catch(e){}return false}}return false};
while(guard++<400){
  const s=await state();if(s.st==='finished')break;
  if(s.reqs){const b=await A.$('[data-act=dropok]');if(b){try{await b.click({timeout:3000})}catch(e){}}}
  let did=false;
  for(const nm of [...names,'Robin']){const p=nm==='Robin'?A:pl[nm];if(await enter(p)){did=true;break}}
  if(!did){ // Organisator: offene Ergebnisse eintragen, sonst ansetzen
    const rows=await A.$$('.adm .matches .mw');let any=false;
    for(const r of rows){const ins=await r.$$('input'),btn=await r.$('[data-act=asave]');if(!btn||ins.length<2)continue;if((await ins[0].inputValue())===''){try{await ins[0].fill('6',{timeout:3000});await ins[1].fill('3',{timeout:3000});await btn.click({timeout:3000});entered++;any=true}catch(e){}break}}
    if(!any){const b=await A.$('[data-act=assign]');if(b)try{await b.click({timeout:3000})}catch(e){}}
  }
  if(!reloaded&&entered>=3){reloaded=true;await pl['Zoë'].reload();await pl['Zoë'].waitForSelector('#tab table',{timeout:15000});const t=await pl['Zoë'].evaluate(()=>document.body.innerText);ok(/Zoë/.test(t)&&!/beitreten|Dein Name/i.test(t),'Nach Neuladen weiterhin angemeldet (Zoë)')}
  if(!dropped&&entered>=5){dropped=true;const p=pl['Sven'];
    try{await p.click('[data-act=arm][data-key=dropreq]',{timeout:5000});await p.click('[data-act=dropreq]',{timeout:5000});
      await A.waitForSelector('[data-act=dropok]',{timeout:15000});ok(true,'Ausscheiden: Anfrage beim Organisator sichtbar')}catch(e){ok(false,'Ausscheiden-Anfrage',String(e).slice(0,120))}}
  if(!corrected&&entered>=8){corrected=true;
    const r=await A.evaluateHandle(()=>[...document.querySelectorAll('.adm .matches .mw')].find(r=>{const i=r.querySelectorAll('input');return i.length>=2&&i[0].value!==''&&r.querySelector('[data-act=asave]')}));
    const el=r.asElement();if(el){try{const ins=await el.$$('input');await ins[0].fill('4',{timeout:3000});await ins[1].fill('6',{timeout:3000});await (await el.$('[data-act=asave]')).click({timeout:3000});ok(true,'Organisator korrigiert ein Ergebnis')}catch(e){corrected=false}}}
  await A.waitForTimeout(150);
}
await A.waitForFunction(()=>window.__online.state().D.status==='finished',null,{timeout:30000});
ok(true,`Turnier beendet (${entered} Eingaben), Neuladen ${reloaded}, Ausscheiden ${dropped}, Korrektur ${corrected}`);
const eq=await A.evaluate(()=>{const S=window.__online.state().D.S,cnt=Array(S.n).fill(0);const G=(S.ov?S.games:S.rounds.flatMap(r=>r.m.concat(r.x?[r.x]:[])));
  for(const m of G)if(m.sa!=null&&m.sb!=null){cnt[m.a]++;if(!m.h)cnt[m.b]++}
  const out=new Set(S.out||[]);return{act:cnt.filter((c,i)=>!out.has(i)),out:[...out]}});
ok(new Set(eq.act).size===1,'Alle aktiven Spieler gleich viele Spiele',eq);ok(eq.out.length===1,'Genau ein Spieler ausgeschieden',eq.out);
await pl['Björn'].waitForSelector('#champ >> text=/./',{timeout:15000});
const fin=await pl['Björn'].evaluate(SEE);
for(const nm of names)ok(fin.includes(nm),'Endtabelle zeigt '+nm);
ok(!/Ã|Â|�|undefined|NaN|\[object/.test(fin),'Endtabelle ohne kaputte Zeichen oder undefined/NaN');
ok(errs.length===0,'Keine Browserfehler',errs.slice(0,3));
ok(B404.every(t=>/"err":"spiel"/.test(t)),'Einzige 404: Spiel nach Ausscheiden nicht mehr vorhanden ('+B404.length+')',B404.slice(0,2));
await br.close();console.log(f?`FEHLER gesamt ${f} von ${n}`:`ALLES OK (${n} Prüfungen)`);process.exit(f?1:0);
