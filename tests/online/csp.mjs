// CSP im echten Browser: eigene Seite darf nichts verletzen, fremde Skripte müssen blockiert werden. PADEL_URL=http://localhost:8787 PADEL_KEY=geheim
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const B=process.env.PADEL_URL||'http://localhost:8787',KEY=process.env.PADEL_KEY||'geheim';let f=0,n=0;const ok=(c,m,x)=>{n++;if(!c){f++;console.log('FEHLER',m,x===undefined?'':JSON.stringify(x))}};
const br=await chromium.launch(),ctx=await br.newContext({viewport:{width:390,height:844}}),p=await ctx.newPage(),msgs=[],errs=[];
p.on('console',m=>msgs.push(m.text()));p.on('pageerror',e=>errs.push(String(e)));
await p.goto(B+'/');await p.waitForSelector('#codeIn');
await p.click('#newT summary');await p.fill('#ckey',KEY);await p.click('[data-act=create]');await p.waitForSelector('text=Warteraum');
await p.fill('#nameIn','Zoë Müller');await p.click('[data-act=join]');await p.waitForSelector('text=Du bist dabei');
const viol=()=>msgs.filter(t=>/Content Security Policy|Refused to/i.test(t)&&!/fonts\.(googleapis|gstatic)/.test(t));
ok(viol().length===0,'Keine CSP-Verstöße der eigenen Seite',viol());ok(errs.length===0,'Keine JS-Fehler',errs);
const blocked=await p.evaluate(()=>new Promise(res=>{const s=document.createElement('script');s.src='https://example.com/x.js';s.onload=()=>res('geladen');s.onerror=()=>res('blockiert');document.head.appendChild(s);setTimeout(()=>res('timeout'),4000)}));
ok(blocked==='blockiert','Fremdes Skript wird blockiert ('+blocked+')');
const fr=await p.evaluate(()=>fetch('https://example.com/').then(()=>'offen').catch(()=>'blockiert'));ok(fr==='blockiert','Fremde Verbindung (connect-src) blockiert ('+fr+')');
const r=await fetch(B+'/'),h=n=>r.headers.get(n)||'';ok(/frame-ancestors 'none'/.test(h('content-security-policy'))&&h('x-frame-options')==='DENY','Einbetten verboten');
const rb=await fetch(B+'/robots.txt');ok(/Disallow: \//.test(await rb.text()),'robots.txt sperrt');
await br.close();console.log(f?`FEHLER gesamt ${f} von ${n}`:`ALLES OK (${n} Prüfungen)`);process.exit(f?1:0);
