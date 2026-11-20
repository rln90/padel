// Reihenuntersuchung: viele Spielerzahlen, Modi und Platzzahlen; Bildschirme zur Hälfte und am Ende prüfen.
// PADEL_URL=http://localhost:8787 PADEL_KEY=geheim node tests/online/reihe.mjs
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const BASE=process.env.PADEL_URL||'http://localhost:8787',KEY=process.env.PADEL_KEY||'geheim';
let f=0,n=0;const ok=(c,m,x)=>{n++;if(!c){f++;console.log('FEHLER',m,x===undefined?'':JSON.stringify(x).slice(0,300))}};
const T00=Date.now(),step=s=>console.error('['+((Date.now()-T00)/1000).toFixed(0)+'s] '+s);
let ipn=300;const ip=()=>'40.0.'+((ipn>>8)&255)+'.'+(ipn++&255);
async function api(method,path,o={}){const h={'cf-connecting-ip':ip()};if(o.token)h.authorization='Bearer '+o.token;if(o.key)h['x-create-key']=o.key;
  const body=o.body!==undefined?JSON.stringify(o.body):undefined;if(body!==undefined)h['content-type']='application/json';
  const r=await fetch(BASE+path,{method,headers:h,body});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch(e){}return{s:r.status,j,len:t.length}}
const games=S=>{const out=[],seen=new Set();(function w(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(w);return}
  if(Number.isInteger(x.gid)&&Number.isInteger(x.a)&&Number.isInteger(x.b)&&!seen.has(x.gid)){seen.add(x.gid);out.push(x)}for(const k in x)w(x[k])})(S);return out};
const BAD=/undefined|NaN|\[object|Invalid Date|Infinity/;
const names=['Anna','Ben','Cem','Dora','Emil','Fritz','Gerda','Hanna','Ida','Jonas','Kim','Lena','Max','Nora','Otto','Pia','Quentin','Rosa','Sven','Tina','Uli','Vera','Willi','Xenia'];
const br=await chromium.launch(),errs=[];
async function setup(N,cfg,drops){const c=(await api('POST','/api/t',{key:KEY,body:{cfg}})).j;const C=c.code,A=c.adminKey,pl=[];
  for(let i=0;i<N;i++){const r=await api('POST','/api/t/'+C+'/join',{body:{name:names[i]}});pl.push(r.j)}
  const s=await api('POST','/api/t/'+C+'/admin/start',{token:A,body:{}});if(s.s!==200)throw new Error('Start '+s.s+' '+JSON.stringify(s.j));
  return{C,A,pl,drops}}
async function play(T,frac){let guard=0,doneDrops=false;
  while(guard++<600){const sv=(await api('GET','/api/t/'+T.C+'/state',{token:T.A})).j;if(sv.over||sv.status==='finished')return sv;
    const all=games(sv.S),open=all.filter(g=>g.sa==null);
    if(frac<1&&all.length&&(all.length-open.length)/Math.max(all.length,1)>=frac&&all.length-open.length>=2)return sv;
    if(!doneDrops&&T.drops&&all.length-open.length>=Math.min(3,all.length)){doneDrops=true;for(const i of T.drops)await api('POST','/api/t/'+T.C+'/admin/drop',{token:T.A,body:{pid:T.pl[i].pid}});continue}
    if(!open.length){await api('POST','/api/t/'+T.C+'/admin/assign',{token:T.A,body:{}});continue}
    let k=0;for(const g of open){const w=(g.gid+k++)%2;await api('POST','/api/t/'+T.C+'/admin/result',{token:T.A,body:{gid:g.gid,sa:w?6:(g.gid%5),sb:w?(g.gid%5):6}})}}
  return null}
async function look(T,who,w,label){const ctx=await br.newContext({viewport:{width:w,height:800},isMobile:w<700,hasTouch:w<700,deviceScaleFactor:1,locale:'de-CH'});
  const p=await ctx.newPage();p.on('pageerror',e=>errs.push(label+' '+String(e)));p.on('dialog',d=>{errs.push('DIALOG '+label);d.dismiss()});
  if(who==='admin')await p.goto(BASE+'/#'+T.C+'/'+T.A);else{await p.addInitScript(([k,v])=>{try{localStorage.setItem(k,v)}catch(e){}},['padel-online-'+T.C,JSON.stringify({p:T.pl[who].token,a:null,pid:T.pl[who].pid})]);await p.goto(BASE+'/#'+T.C)}
  await p.waitForSelector('#tab table',{timeout:20000}).catch(()=>{});await p.waitForTimeout(400);
  const r=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,txt:document.querySelector('#app,#onl')?document.body.innerText:'',rows:document.querySelectorAll('#tab tbody tr').length,
    rv:(document.querySelector('.rankc .rv')||{}).textContent||'',hero:!!document.querySelector('.hero,.rankc'),tab:(()=>{const t=document.querySelector('#tab');return t?t.scrollWidth-t.clientWidth:0})(),
    wide:[...document.querySelectorAll('.hero,.hero *,.rankc,.rankc *,.panel')].filter(e=>{if(e.closest('.wrap,.plan,input,select'))return false;const b=e.getBoundingClientRect();return b.width&&b.right>innerWidth+1}).length}));
  await ctx.close();return r}

const fälle=[ // [Spieler, Modus, Plätze, Runden, Ausfälle (Index)]
  [4,'wait',1,3,[]],[4,'no',2,4,[]],[5,'yes',1,3,[]],[5,'wait',2,5,[]],[6,'no',3,3,[]],[7,'wait',3,4,[2]],[7,'yes',1,6,[]],[8,'no',4,5,[7]],
  [9,'wait',2,5,[1]],[10,'yes',12,4,[]],[11,'no',2,3,[3,4]],[13,'wait',3,6,[]],[15,'no',1,3,[]],[16,'yes',4,7,[5]],[17,'wait',5,4,[0,16]],
  [19,'no',9,3,[]],[21,'yes',6,5,[]],[22,'wait',2,3,[]],[23,'no',11,6,[22]],[24,'wait',12,8,[]],[24,'yes',3,3,[]]];
let idx=0;
for(const [N,ov,courts,R,dr] of fälle){idx++;const tag=`N=${N} ${ov} P${courts} R${R}${dr.length?' -'+dr.length:''}`;step(tag);
  let T;try{T=await setup(N,{R,courts,ov,draw:true,lim:true,auto:'confirmed',dur:20,brk:5,t0:idx%3===0?1425:null},dr)}catch(e){ok(false,tag+': Anlegen/Start',String(e));continue}
  const mid=await play(T,.5);ok(!!mid,tag+': Halbzeit erreicht');
  const act=[...Array(N).keys()].filter(i=>!dr.includes(i)||!(mid&&mid.players&&mid.players[i]&&mid.players[i].out));
  for(const [lab,who,w] of [['Admin',  'admin',360],['Spieler',act[0],360],['Spieler breit',act[act.length-1],1100]]){
    const r=await look(T,who,w,tag+' '+lab+' Halbzeit');
    ok(r.sw<=r.iw+1&&r.tab<=1&&r.wide===0,tag+' '+lab+' Halbzeit: kein Überlauf',{sw:r.sw,iw:r.iw,tab:r.tab,wide:r.wide});
    ok(!BAD.test(r.txt),tag+' '+lab+' Halbzeit: keine kaputten Texte',(r.txt.match(BAD)||[])[0]);ok(r.rows===N||r.rows===0,tag+' '+lab+' Halbzeit: Tabelle mit allen '+N+' Spielern',r.rows)}
  const fin=await play(T,1);ok(!!fin&&(fin.over||fin.status==='finished'),tag+': Turnier endet',fin&&{over:fin.over,st:fin.status});if(!fin)continue;
  const final=(await api('GET','/api/t/'+T.C+'/state',{token:T.A})).j;const activeN=final.players.filter(p=>!p.out).length;
  for(const [lab,who,w] of [['Admin','admin',360],['Spieler',act[0],360],['Ausgeschieden',dr.length?dr[0]:act[1],390]]){
    const r=await look(T,who,w,tag+' '+lab+' Ende');
    ok(r.sw<=r.iw+1&&r.tab<=1&&r.wide===0,tag+' '+lab+' Ende: kein Überlauf',{sw:r.sw,iw:r.iw,tab:r.tab,wide:r.wide});
    ok(!BAD.test(r.txt),tag+' '+lab+' Ende: keine kaputten Texte',(r.txt.match(BAD)||[])[0]);ok(r.rows===N,tag+' '+lab+' Ende: Tabelle mit allen '+N+' Spielern',r.rows);
    if(r.rv)ok(r.rv.trim()==='von '+activeN,tag+' '+lab+' Ende: "von '+activeN+'" (aktive Spieler)',r.rv)}
}
ok(errs.length===0,'Keine JS-Fehler',errs.slice(0,4));
await br.close();console.log(f?'FEHLER: '+f+' von '+n:'ALLES OK ('+n+' Prüfungen)');process.exit(f?1:0);
