// Prüfung gegen einen laufenden Server: Regeln (Runden, Spielerzahl), Namen mit Umlauten und Sonderzeichen, Darstellung auf dem Handy.
// PADEL_URL=http://localhost:8787 PADEL_KEY=geheim node tests/online/audit.mjs
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const B=process.env.PADEL_URL||'http://localhost:8787',KEY=process.env.PADEL_KEY||'geheim';let f=0,n=0;const ok=(c,m,x)=>{n++;if(!c){f++;console.log('FEHLER',m,x===undefined?'':JSON.stringify(x))}};
const J=async(m,p,b,t)=>{const r=await fetch(B+p,{method:m,headers:{...(t?{authorization:'Bearer '+t}:{}),'x-create-key':KEY,'content-type':'application/json'},body:m==='POST'?JSON.stringify(b||{}):undefined});return{s:r.status,ct:r.headers.get('content-type'),j:await r.json()}};
/* E: Regeln */
const c0=await J('POST','/api/t',{cfg:{R:2}});console.log('R=2 ->',c0.s,JSON.stringify(c0.j).slice(0,100));let c=await J('POST','/api/t',{cfg:{R:3,courts:12}});
let c2=await J('POST','/api/t',{cfg:{R:99,courts:99}});console.log('R=99,courts=99 ->',c2.s);
const P=`/api/t/${c.j.code}`;const toks=[];
for(let i=0;i<24;i++){const r=await J('POST',P+'/join',{name:'S'+i});toks.push(r.j.token);if(r.s!==200)ok(false,'Beitritt '+i,r.j)}
const r25=await J('POST',P+'/join',{name:'S24'});ok(r25.s>=400,'25. Spieler abgelehnt',r25.s);console.log('25. Spieler:',r25.s,r25.j.msg);
const st=await J('POST',P+'/admin/start',{},c.j.adminKey);ok(st.s===200,'Start mit 24',st.j);
const S=(await J('GET',P+'/state',null,c.j.adminKey)).j.S;console.log('R bei 24 Spielern:',S.R,'Plätze:',S.courts);ok(S.R>=3,'Mindestens 3 Runden');
/* B/C: Namen */
const c3=await J('POST','/api/t',{});const P3=`/api/t/${c3.j.code}`;
const names=['Jürgen Müller','Zoë','Søren Åkesson','Chloé','Weiß-Groß','Ñandú','Łukasz','İpek','Ömer Çelik','李雷','🎾 Tom','a'.repeat(23)+'🎾','ä'.repeat(24),'ä'.repeat(25),'Müller','Müller','  Anna   Lena  ','O\'Neil "B" & Co'];
const got=[];for(const nm of names){const r=await J('POST',P3+'/join',{name:nm});got.push([nm,r.s,r.j.ok?(await J('GET',P3+'/state',null,c3.j.adminKey)).j.players.slice(-1)[0].name:r.j.msg]);}
for(const [a,s,b] of got)console.log(JSON.stringify(a).padEnd(34),s,JSON.stringify(b));
const nm2=got.filter(g=>g[1]===200).map(g=>g[2]);
ok(nm2.every(x=>x===x.normalize('NFC')),'Namen sind NFC-normalisiert',nm2.filter(x=>x!==x.normalize('NFC')));
ok(!nm2.some(x=>/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(x)),'Keine halben Zeichen (Surrogate)');
/* Browser: Darstellung */
const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.goto(B+'/#'+c3.j.code+'/'+c3.j.adminKey);await p.waitForSelector('.plist li');
const m=await p.evaluate(()=>({inner:innerWidth,sw:document.documentElement.scrollWidth,cs:document.characterSet,lis:[...document.querySelectorAll('.plist input[data-d^=pn]')].map(e=>e.value)}));
console.log('Mobil Warteraum:',m.inner,m.sw,m.cs);ok(m.inner===390&&m.sw<=390,'Warteraum: kein seitliches Scrollen',m);
ok(m.lis.some(x=>x.includes('Jürgen Müller'))&&m.lis.some(x=>x.includes('Zoë'))&&m.lis.some(x=>x.includes('李雷')),'Umlaute und Sonderzeichen im Browser korrekt');
ok(!m.lis.some(x=>/Ã|Â|�/.test(x)),'Kein Zeichensalat');
await p.click('details.cfg summary');await p.waitForSelector('#sum table');
const m2=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,t:document.querySelector('#sum').innerText.slice(0,200)}));ok(m2.sw<=390,'Einstellungen: kein seitliches Scrollen',m2);
if(process.env.SHOTS)await p.screenshot({path:process.env.SHOTS+'/a-lobby-mobile.png',fullPage:true});
for(const w of [320,360,412]){await p.setViewportSize({width:w,height:800});await p.waitForTimeout(150);const sw=await p.evaluate(()=>document.documentElement.scrollWidth);ok(sw<=w,'Breite '+w+': kein seitliches Scrollen',sw)}
/* Umlaute in den fest eingebauten Texten: zufällig Seitentexte prüfen */
const txt=await p.evaluate(()=>document.body.innerText);ok(!/Ã|Â|â€|�/.test(txt),'Seitentext ohne Zeichensalat');
ok(errs.length===0,'Keine JS-Fehler',errs);
await br.close();console.log(f?`FEHLER ${f}/${n}`:`ALLES OK (${n} Prüfungen)`);process.exit(f?1:0);
