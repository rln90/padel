// Hilfen: Online-Seite in jsdom gegen den echten Server-Kern (ohne Netzwerk).
import {createRequire} from 'node:module';
import fs from 'node:fs';
import worker from '../../server/worker.mjs';
const require=createRequire(import.meta.url);
const {JSDOM,VirtualConsole}=require('jsdom');
export const HTML=()=>fs.readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function mkPage(env,url,{store,errors=[],html}={}){
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push('jsdom: '+(e.detail&&e.detail.message||e.message)));vc.on('error',m=>errors.push('console.error: '+m));
  const dom=new JSDOM(html||HTML(),{url,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.fetch=async(u,init={})=>worker.fetch(new Request('https://padel.test'+u,{method:init.method||'GET',headers:init.headers,body:init.body}),env);
    w.addEventListener('error',e=>errors.push('onerror: '+e.message));
    w.navigator.clipboard={writeText:async t=>{w.__clip=t}};
    if(store)for(const k in store)try{w.localStorage.setItem(k,store[k])}catch(e){}
  }});
  const w=dom.window,d=w.document;
  const P={w,d,errors,
    $:s=>d.querySelector(s),$$:s=>[...d.querySelectorAll(s)],
    text:s=>(d.querySelector(s||'body')||{}).textContent||'',
    async settle(n=3){for(let i=0;i<n;i++)await sleep(8)},
    async poll(){await w.__online.poll();await P.settle()},
    async click(sel){const e=typeof sel==='string'?d.querySelector(sel):sel;if(!e)throw new Error('Nicht gefunden: '+sel);e.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await P.settle(6)},
    type(sel,v){const e=typeof sel==='string'?d.querySelector(sel):sel;if(!e)throw new Error('Nicht gefunden: '+sel);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}));e.dispatchEvent(new w.Event('change',{bubbles:true}))},
    st:()=>w.__online.state(),
    tok:()=>{try{return JSON.parse(w.localStorage.getItem('padel-online-'+P.st().CODE)||'null')}catch(e){return null}},
    close(){w.close()}};
  return P;
}
