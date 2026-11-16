// Layout mit langen Namen: 8 Spieler mit 24 Zeichen, lange Platznamen; Handy bis Desktop, hell und dunkel.
// Prüft: kein Seitenüberlauf, Tabelle samt Punkten ohne Seitwärtsscrollen, Ergebnis zweizeilig auf dem Handy,
// farbige Karten (nächstes Spiel, Platzierung) oben in der Spieleransicht.
// PADEL_URL=http://localhost:8787 PADEL_KEY=geheim node tests/online/layout.mjs
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const BASE=process.env.PADEL_URL||'http://localhost:8787',KEY=process.env.PADEL_KEY||'geheim';
let f=0,n=0;const ok=(c,m,x)=>{n++;if(!c){f++;console.log('FEHLER',m,x===undefined?'':JSON.stringify(x))}};
const br=await chromium.launch(),errs=[];
const mk=async(w=390,h=844,scheme='light',st)=>{const c=await br.newContext({viewport:{width:w,height:h},colorScheme:scheme,locale:'de-CH',...(st?{storageState:st}:{})});const p=await c.newPage();
  p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|status of 4(04|09|22|29)/.test(m.text()))errs.push(m.text())});return p};
const names=['Maximilian-Alexander Frh','Alexandra von Hohenzolle','Çağlar Öztürkoğlu-Schmid','Wolfgang Amadeus M.','Jean-Baptiste Grenouille','Sebastian Müller-Lüdensc','Anna','Ben'];
const courts=['Center Court Hauptplatz','Panorama-Court am See','Nebenplatz hinten links','Platz Eins'];
const A=await mk();await A.goto(BASE+'/');await A.waitForSelector('#codeIn');
await A.click('#newT summary');await A.fill('#ckey',KEY);await A.click('[data-act=create]');await A.waitForSelector('text=Warteraum');
const code=(await A.textContent('h2')).trim().replace(/^.*Turnier\s+/,'').slice(0,6);
for(const nm of names.slice(1)){await A.fill('[data-d=add]',nm);await A.click('[data-act=add]');await A.waitForFunction(x=>document.querySelectorAll('.plist li').length>=x,names.indexOf(nm),{timeout:10000})}
await A.fill('#nameIn',names[0]);await A.click('[data-act=join]');await A.waitForSelector('text=Du bist dabei');
await A.click('details.cfg summary');await A.selectOption('#r','4');await A.selectOption('#c','4');
for(let i=0;i<4;i++)await A.fill('[data-d=cn'+i+']',courts[i]);
ok(await A.evaluate(()=>[...document.querySelectorAll('[data-d^=cn]')].filter(e=>!e.hidden).length)===4,'Platzfelder: genau vier sichtbar bei 4 Plätzen');
await A.click('[data-act=config]');await A.waitForSelector('text=gespeichert');
await A.click('[data-act=arm][data-key=start]');await A.click('[data-act=start]');await A.waitForSelector('#tab table');
const url=A.url(),ST=await A.context().storageState();
const check=async(p,label,w)=>{
  const r=await p.evaluate(()=>{const de=document.documentElement,tab=document.querySelector('#tab'),th=[...document.querySelectorAll('#tab th')].pop();
    const m=document.querySelector('.m .a'),mb=document.querySelector('.m .b');
    const wide=[...document.querySelectorAll('body *')].filter(e=>{if(e.closest('.wrap,.plan,input,select,textarea,svg,.qr'))return false;const b=e.getBoundingClientRect();return b.width&&b.right>innerWidth+1}).map(e=>e.tagName+'.'+e.className).slice(0,5);
    return{sw:de.scrollWidth,iw:innerWidth,tabOver:tab?tab.scrollWidth-tab.clientWidth:0,pkt:th?th.getBoundingClientRect().right:0,stacked:m&&mb?mb.getBoundingClientRect().top>m.getBoundingClientRect().top+4:null,wide}});
  ok(r.sw<=r.iw,label+': kein Seitenüberlauf',r);ok(r.wide.length===0,label+': nichts ragt aus dem Bild',r.wide);
  ok(r.tabOver<=1,label+': Tabelle ohne Seitwärtsscrollen',r);ok(r.pkt<=r.iw,label+': Spalte Punkte sichtbar',r);
  if(w<=560&&r.stacked!==null)ok(r.stacked,label+': Ergebnis zweizeilig',r);
  return r};
for(const scheme of ['light','dark'])for(const w of [360,390,768,1280]){
  const P=await mk(w,900,scheme,ST);await P.goto(url);await P.waitForSelector('#tab table');
  await check(P,'Organisator '+w+' '+scheme,w);await P.context().close();
}
/* Spielersicht: Anna meldet sich neu an (Organisator spielt mit Namen 0); ein zweiter Spieler tritt im Warteraum nicht mehr bei */
const mi=await A.evaluate(()=>window.__online.state().D.players.findIndex(p=>p.name==='Maximilian-Alexander Frh'));
ok(mi>=0,'Organisator spielt mit');
for(const scheme of ['light','dark'])for(const w of [360,390,768]){
  const P=await mk(w,900,scheme,ST);await P.goto(url);await P.waitForSelector('.hero');
  const r=await P.evaluate(()=>{const h=document.querySelector('.hero'),k=document.querySelector('.rankc'),t=document.querySelector('#tab');
    return{hero:!!h,rank:!!k,heroTop:h&&h.getBoundingClientRect().top,rankTop:k&&k.getBoundingClientRect().top,tabTop:t&&t.getBoundingClientRect().top,
      opp:(document.querySelector('.hero .ho')||{}).textContent,pill:(document.querySelector('.hero .pill')||{}).textContent,
      heroBg:h&&getComputedStyle(h).backgroundColor,rankBg:k&&getComputedStyle(k).backgroundColor,
      rnum:(document.querySelector('.rankc .rn b')||{}).textContent}});
  ok(r.hero&&r.rank,'Spieler '+w+' '+scheme+': Karten da',r);
  ok(r.heroTop<r.rankTop&&r.rankTop<r.tabTop,'Spieler '+w+' '+scheme+': Reihenfolge Spiel, Platz, Tabelle',r);
  ok(names.includes(r.opp)&&!r.opp.includes(names[0]),'Spieler '+w+' '+scheme+': Gegner groß genannt',r.opp);
  ok(courts.includes(r.pill),'Spieler '+w+' '+scheme+': Platz als Pille',r.pill);
  ok(r.heroBg!==r.rankBg&&r.heroBg!=='rgba(0, 0, 0, 0)','Spieler '+w+' '+scheme+': Karten farbig',r);
  await check(P,'Spieler '+w+' '+scheme,w);await P.context().close();
}
ok(errs.length===0,'Keine JS-Fehler',errs.slice(0,3));
await br.close();
console.log(f?'FEHLER: '+f+' von '+n:'ALLES OK ('+n+' Prüfungen)');process.exit(f?1:0);
