// Echter Browser (Chromium) gegen einen laufenden Server (wrangler dev oder Cloudflare): PADEL_URL=http://localhost:8787 PADEL_KEY=geheim
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const BASE=process.env.PADEL_URL||'http://localhost:8787',KEY=process.env.PADEL_KEY||'geheim',SHOT=process.env.SHOTS||'';
let f=0,n=0;const ok=(c,m)=>{n++;if(!c){f++;console.log('FEHLER '+m)}};
const br=await chromium.launch(),errs=[];
const mk=async(mobile)=>{const c=await br.newContext(mobile?{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}:{viewport:{width:1100,height:900}});const p=await c.newPage();
  p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|status of 4(09|22)/.test(m.text()))errs.push(m.text())});return p};
const shot=async(p,name,full)=>{if(SHOT)await p.screenshot({path:`${SHOT}/${name}.png`,fullPage:!!full})};
const A=await mk(false);
await A.goto(BASE+'/');await A.waitForSelector('#codeIn');
await shot(A,'1-start');
await A.click('#newT summary');await A.fill('#ckey',KEY);await A.click('[data-act=create]');
await A.waitForSelector('text=Warteraum');
const code=(await A.textContent('h2')).trim().replace(/^.*Turnier\s+/,'').slice(0,6);
ok(/^[A-Z2-9]{6}$/.test(code),'Code '+code);
await shot(A,'2-lobby-admin',true);
const names=['Anna','Ben','Cem','Dora','Emil','Fritz','Gina'],pl={};
for(const [i,nm] of names.entries()){
  const p=await mk(true);await p.goto(BASE+'/#'+code);await p.waitForSelector('#nameIn');
  if(i===0)await shot(p,'3-join-mobile');
  await p.fill('#nameIn',nm);await p.click('[data-act=join]');await p.waitForSelector('text=Du bist dabei');pl[nm]=p;
}
await A.fill('#nameIn','Robin');await A.click('[data-act=join]');await A.waitForSelector('text=Du bist dabei');
await A.waitForFunction(()=>document.querySelectorAll('.plist li').length===8,null,{timeout:15000});
ok(true,'8 Spieler im Warteraum');
await A.click('details.cfg summary');await A.selectOption('#R','4');await A.selectOption('#ov','yes');await A.selectOption('#courts','3');await A.fill('#t0','18:30');
await A.click('[data-act=config]');await A.waitForSelector('text=gespeichert');
await shot(A,'4-config',true);
await A.click('[data-act=arm][data-key=start]');await A.click('[data-act=start]');
await A.waitForSelector('#tab table');await pl.Anna.waitForSelector('#tab table',{timeout:15000});
await shot(pl.Anna,'5-player-running',true);await shot(A,'6-admin-running',true);
// spielen
const rnd=(()=>{let s=5;return()=>{s=(s*16807)%2147483647;return s/2147483647}})();
let guard=0,entered=0;
while(guard++<300){
  const fin=await A.evaluate(()=>window.__online.state().D&&window.__online.state().D.status);
  if(fin==='finished')break;
  let did=false;
  for(const nm of Object.keys(pl)){
    const p=pl[nm],rows=await p.$$('.mygame .mw');
    for(const r of rows){const ins=await r.$$('input'),btn=await r.$('[data-act=save]');
      if(!btn||ins.length<2)continue;const st=await r.$('.status');
      const txt=(await r.textContent());if(/Eintragen/.test(txt)&&!/Gemeldet|Bestätigt|Vom Organisator/.test(txt)&&(await ins[0].inputValue())===''){
        if(rnd()<.5)continue; // ab und zu trägt der Gegner ein
        let a=6,b=Math.floor(rnd()*6);if(rnd()<.5)[a,b]=[b,a];
        await ins[0].fill(String(a));await ins[1].fill(String(b));await btn.click();entered++;did=true;break}}
  }
  if(!did){ // Organisator trägt ein, was offen ist
    const rows=await A.$$('.adm .matches .mw');let any=false;
    for(const r of rows){const ins=await r.$$('input'),btn=await r.$('[data-act=asave]');if(!btn||ins.length<2)continue;
      if((await ins[0].inputValue())===''){await ins[0].fill('6');await ins[1].fill(String(Math.floor(rnd()*6)));await btn.click();entered++;any=true;break}}
    if(!any){const b=await A.$('[data-act=assign]');if(b)await b.click()}
  }
  await A.waitForTimeout(150);
  if(entered===6)await shot(pl.Anna,'7-player-mid',true);
}
await A.waitForFunction(()=>window.__online.state().D.status==='finished',null,{timeout:30000});
ok(true,`Turnier beendet (${entered} Eingaben)`);
await pl.Ben.waitForSelector('#champ >> text=/./',{timeout:15000});
await shot(pl.Ben,'8-finished-player',true);await shot(A,'9-finished-admin',true);
ok(errs.length===0,'Keine Browserfehler: '+errs.slice(0,3).join(' | '));
await br.close();
console.log(f?`FEHLER gesamt ${f} von ${n}`:`ALLES OK (${n} Prüfungen)`);process.exit(f?1:0);
