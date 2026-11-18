// Einheitlichkeit: Standardmodus mit Sprache, einheitliche Schriftgrößen/Knopfhöhen, gleiche Abstände zwischen
// Feld und Knopf (auch in aufklappbaren Karten), eigene Optik der Eingabefelder (iOS/Android), keine Eingabe unter 16 px.
// PADEL_URL=http://localhost:8787 PADEL_KEY=geheim node tests/online/konsistenz.mjs
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const BASE=process.env.PADEL_URL||'http://localhost:8787',KEY=process.env.PADEL_KEY||'geheim';
let f=0,n=0;const ok=(c,m,x)=>{n++;if(!c){f++;console.log('FEHLER',m,x===undefined?'':JSON.stringify(x))}};
const SIZES=new Set([12,14,16,20,22,26,29,30,32,34,54,64]);
const br=await chromium.launch(),errs=[];
const A=await(await br.newContext({viewport:{width:390,height:900},locale:'de-CH'})).newPage();
A.on('pageerror',e=>errs.push(String(e)));
const probe=()=>A.evaluate(()=>{
  const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
  const o={sizes:{},btn:{},gaps:[],small:[],appear:[]};
  for(const e of document.querySelectorAll('body *')){if(!vis(e)||![...e.childNodes].some(x=>x.nodeType===3&&x.textContent.trim()))continue;
    const cs=getComputedStyle(e),fs=Math.round(parseFloat(cs.fontSize)*10)/10;(o.sizes[fs]??=[]).push(e.tagName.toLowerCase()+'.'+(e.className||''))}
  for(const b of document.querySelectorAll('button')){if(!vis(b))continue;const r=b.getBoundingClientRect();o.btn[Math.round(r.height)+'/'+getComputedStyle(b).fontSize]=(o.btn[Math.round(r.height)+'/'+getComputedStyle(b).fontSize]||0)+1}
  for(const i of document.querySelectorAll('input:not([type=file]):not([type=checkbox]):not([type=radio]),select,textarea')){if(!vis(i))continue;
    const cs=getComputedStyle(i);if(parseFloat(cs.fontSize)<16)o.small.push(i.id||i.dataset.d||i.tagName);if(!['none','textfield'].includes(cs.appearance))o.appear.push(i.id||i.dataset.d||i.tagName)}
  /* Abstand zwischen einem Feld (samt Beschriftung) und dem Knopf darunter */
  for(const b of document.querySelectorAll('.actions')){const p=b.previousElementSibling;if(!p||!vis(p)||!vis(b))continue;if(!p.matches('.field,input,select'))continue;
    o.gaps.push(Math.round(b.getBoundingClientRect().top-p.getBoundingClientRect().bottom))}
  return{...o,compat:document.compatMode,lang:document.documentElement.lang,vp:document.querySelector('meta[name=viewport]').content}});
const check=async(label)=>{const o=await probe();
  const bad=Object.entries(o.sizes).filter(([s])=>!SIZES.has(+s)).map(([s,l])=>s+'px: '+[...new Set(l)].slice(0,3).join(' '));
  ok(bad.length===0,label+': nur Schriftgrößen der Skala',bad);
  ok(Object.keys(o.btn).every(k=>k==='44/16px'||k.endsWith('/16px')&&+k.split('/')[0]>=44),label+': Knöpfe einheitlich (mind. 44 px, 16 px Schrift)',o.btn);
  ok(o.small.length===0,label+': Eingaben mind. 16 px (kein Zoom auf iOS)',o.small);
  ok(o.appear.length===0,label+': Eingaben ohne Systemstil (appearance none)',o.appear);
  ok(o.gaps.every(g=>g===16||g===12||g===8),label+': Abstand Feld zu Knopf aus dem Raster (8/12/16)',o.gaps);
  return o};
await A.goto(BASE+'/');await A.waitForSelector('#codeIn');
const o0=await check('Start');
ok(o0.compat==='CSS1Compat','Standardmodus (Doctype)',o0.compat);ok(o0.lang==='de','Sprache de',o0.lang);ok(/viewport-fit=cover/.test(o0.vp),'Viewport mit Randbereichen (iPhone)',o0.vp);
const g=async s=>A.evaluate(s=>{const a=document.querySelector(s),b=a&&a.closest('.panel,details');return a?Math.round(document.querySelector('#newT .actions').getBoundingClientRect().top-document.querySelector('#newT .field').getBoundingClientRect().bottom):-1},'#ckey');
await A.click('#newT summary');
const gp=await A.evaluate(()=>{const w=document.querySelector('#codeIn').closest('.panel'),n=document.querySelector('#newT');
  const d=e=>Math.round(e.querySelector('.actions').getBoundingClientRect().top-e.querySelector('.field').getBoundingClientRect().bottom);return[d(w),d(n)]});
ok(gp[0]===gp[1]&&gp[0]>=12,'Landing: Abstand Feld zu Knopf in beiden Karten gleich',gp);
await check('Start, Anlegen offen');
await A.fill('#ckey',KEY);await A.click('[data-act=create]');await A.waitForSelector('text=Warteraum');
for(const nm of ['Anna','Ben','Cem','Dóra','Emil','Fritz','Gerda']){await A.fill('[data-d=add]',nm);await A.click('[data-act=add]');await A.waitForFunction(x=>document.querySelectorAll('.plist li').length>=x,['Anna','Ben','Cem','Dóra','Emil','Fritz','Gerda'].indexOf(nm)+1,{timeout:8000})}
await A.fill('#nameIn','Robin');await A.click('[data-act=join]');await A.waitForSelector('text=Du bist dabei');
await A.click('details.cfg summary');await check('Warteraum Organisator');
await A.click('[data-act=config]');await A.waitForSelector('text=gespeichert');
await A.click('[data-act=arm][data-key=start]');await A.click('[data-act=start]');await A.waitForSelector('.hero');
await check('Laufend');
for(const s of await A.$$('summary'))try{await s.click({timeout:500})}catch(e){}
await check('Laufend, alles aufgeklappt');
ok(errs.length===0,'Keine JS-Fehler',errs.slice(0,3));
await br.close();console.log(f?'FEHLER: '+f+' von '+n:'ALLES OK ('+n+' Prüfungen)');process.exit(f?1:0);
