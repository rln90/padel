import {makeEnv,client} from './harness.mjs';
let f=0,n=0;const ok=(c,m)=>{n++;if(!c){f++;console.log('FEHLER '+m)}};
const T=(x)=>`/api/t/${x}`;
async function mk(cfg={},envOpts={}){
  const env=makeEnv(envOpts),c=client(env);
  const r=await c('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{cfg}});
  return{env,c,code:r.json.code,adm:r.json.adminKey,r};
}
async function join(c,code,name){const r=await c('POST',T(code)+'/join',{body:{name}});return r}
async function fill(c,code,names){const t={};for(const n of names){const r=await join(c,code,n);t[n]=r.json.token}return t}
const NAMES=['Anna','Ben','Cem','Dora','Emil','Fay','Gero','Hanna'];

// Spiel von Hand ansetzen (admin/pair): Live-Lage 21.11. nachgestellt, dann bis zum Ende gespielt
for(let run=0;run<30;run++){
  const {c,code,adm}=await mk({R:5,courts:3,ov:run%2?'wait':'yes',auto:'reported',draw:true});
  const NM=['Chef','Oger','Alge','Papa','Peter','Invalide','Robin'];const tok=await fill(c,code,NM);
  await c('POST',T(code)+'/admin/start',{token:adm});
  const get=async()=>(await c('GET',T(code)+'/state',{token:adm})).json;
  let s=await get();
  // Spieler darf nicht, Unsinn wird abgelehnt
  ok((await c('POST',T(code)+'/admin/pair',{token:tok.Chef,body:{a:0,b:1,c:0}})).status===403,'Spieler darf nicht');
  ok((await c('POST',T(code)+'/admin/pair',{token:adm,body:{a:0,b:0,c:0}})).status===409,'gleicher Spieler abgelehnt');
  ok((await c('POST',T(code)+'/admin/pair',{token:adm,body:{a:'x',b:1,c:0}})).status===409,'Unsinn abgelehnt');
  const live=s.S.games.filter(g=>g.sa==null);
  if(live.length){const g=live[0];ok((await c('POST',T(code)+'/admin/pair',{token:adm,body:{a:g.a,b:(g.b+1)%7,c:(g.c+1)%3}})).status===409,'beschäftigter Spieler abgelehnt')}
  let guard=0,manual=0;
  while(guard++<200){
    s=await get();const G=s.S.games,open=G.filter(g=>g.sa==null);
    if(s.over||(!open.length&&G.length&&s.S.games.length>0&&(await c('POST',T(code)+'/admin/assign',{token:adm})).json.assigned===0&&!(await get()).S.games.some(g=>g.sa==null)))break;
    // gelegentlich von Hand ansetzen, wenn ein Platz frei ist
    const busy=new Set(open.flatMap(g=>[g.a,g.b])),cs=new Set(open.map(g=>g.c));
    const gcount=Array(7).fill(0);G.forEach(g=>{gcount[g.a]++;if(!g.h)gcount[g.b]++});
    const free=[...Array(7).keys()].filter(i=>!busy.has(i)&&gcount[i]<s.S.R),fc=[0,1,2].filter(x=>!cs.has(x));
    if(free.length>=2&&fc.length&&Math.random()<.4){
      const a=free[Math.floor(Math.random()*free.length)],b=free.filter(x=>x!==a)[0];
      const r=await c('POST',T(code)+'/admin/pair',{token:adm,body:{a,b,c:fc[0]}});ok(r.status===200,'von Hand: '+r.status+' '+JSON.stringify(r.json));if(r.status===200)manual++;
      // Spieler trägt das Ergebnis selbst ein, Gegner bestätigt
      const s2=await get(),g=s2.S.games.find(x=>x.sa==null&&x.a===a&&x.b===b);ok(!!g,'Spiel angelegt');
      if(g){const ra=await c('POST',T(code)+'/result',{token:tok[NM[a]],body:{gid:g.gid,sa:6,sb:3}});ok(ra.status===200,'Spieler meldet: '+ra.status+' '+JSON.stringify(ra.json))}
      continue}
    if(open.length){const g=open[0];await c('POST',T(code)+'/admin/result',{token:adm,body:{gid:g.gid,sa:g.gid%2?6:3,sb:g.gid%2?2:6,force:true}})}
  }
  s=await get();const gc=Array(7).fill(0);s.S.games.forEach(g=>{if(g.sa!=null){gc[g.a]++;if(!g.h)gc[g.b]++}});
  ok(gc.every(x=>x===s.S.R),'alle R='+s.S.R+' Spiele: '+gc.join()+' (von Hand '+manual+')');
  const dbl=s.S.games.filter(g=>g.sa==null);ok(dbl.length===0,'nichts offen');
}
console.log(f?`FEHLER ${f} von ${n}`:`ALLES OK (${n} Prüfungen)`);process.exit(f?1:0);
