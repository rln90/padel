// Simulation: viele Spieler, ein Organisator, zufällige Reihenfolge von Eingaben, Bestätigungen, Widersprüchen, Ausfällen.
import {makeEnv,client,seeded} from './harness.mjs';
const T0=+process.argv[2]||60,EV=process.argv[3]?+process.argv[3]:0.35;
const names=i=>'Spieler '+(i+1);
const viol={},ex={};const bad=(k,i)=>{viol[k]=(viol[k]||0)+1;if(!ex[k])ex[k]=i};
const stat={runs:0,steps:0,finished:0,stuck:0,drops:0,disputes:0,undos:0,autoconf:0,calls:0,s4xx:0,evictions:0};

async function sim(seed,evict){
  const rng=seeded(seed*101+3),ri=n=>Math.floor(rng()*n),pick=a=>a[ri(a.length)];
  Math.random=seeded(seed*7+1);
  const env=makeEnv({evict,evictRng:seeded(seed*13+5)}),call0=client(env);
  const secrets=new Set();let leaked=false;
  const call=async(...a)=>{const r=await call0(...a);stat.calls++;if(r.status>=500)bad('5xx '+r.status,{a:a.slice(0,2),t:r.text.slice(0,120)});if(r.status>=400&&r.status<500)stat.s4xx++;
    if(/adminHash|"hash"|"token"/.test(r.text)&&!/\/join$/.test(a[1]))bad('Geheimfeld in Antwort',a[1]);
    for(const s of secrets)if(s&&r.text.includes(s)&&!/\/join$/.test(a[1])&&!/^\/api\/t$/.test(a[1]))bad('Token in Antwort',a[1]);
    return r};
  const n=4+ri(10),ov=pick(['no','yes','wait','wait']),R=3+ri(4),c=1+ri(Math.max(1,Math.floor(n/2))),draw=rng()<.5;
  const auto=pick(['confirmed','confirmed','reported','off']);
  const cr=await call('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{cfg:{R,courts:c,ov,draw,lim:true,auto,grace:60,dur:20,brk:5}}});
  if(cr.status!==200){bad('Anlegen',cr.text);return null}
  const code=cr.json.code,adm=cr.json.adminKey;secrets.add(adm);
  const P=`/api/t/${code}`,tok=[];
  for(let i=0;i<n;i++){const r=await call('POST',P+'/join',{body:{name:names(i)}});tok.push(r.json.token);secrets.add(r.json.token)}
  const st0=await call('POST',P+'/admin/start',{token:adm});if(st0.status!==200){bad('Start',st0.text);return null}
  const get=async(t=adm)=>(await call('GET',P+'/state',{token:t})).json;
  const sc=()=>{const k=ri(10);if(k<3)return[6,ri(2)?0:5];if(k<5)return[ri(2)?0:5,6];const a=ri(7);return draw?[a,a]:[a,(a+1+ri(6))%8]};
  const games=S=>S.ov?S.games:S.rounds.flatMap(r=>r.m.concat(r.x?[r.x]:[]));
  let steps=0,idle=0,lastVer=-1,V=null;
  while(steps++<2500){
    V=await get();
    if(V.status==='finished')break;
    if(V.ver===lastVer)idle++;else{idle=0;lastVer=V.ver}
    env.clock+=(5+ri(80))*1e3;
    const S=V.S,G=games(S).concat(S.so||[]),open=G.filter(m=>m.sa==null||m.sb==null),act=[...Array(S.n).keys()].filter(i=>!V.players[i].out);
    if(steps%25===0)check(V,bad,S);
    const k=rng();
    if(idle>12){ // festgefahren: Organisator räumt auf
      stat.stuck++;
      for(const m of open)await call('POST',P+'/admin/result',{token:adm,body:{gid:m.gid,sa:6,sb:draw?6:3,force:true}});
      for(const m of G.filter(m=>V.res[m.gid]&&['reported','disputed'].includes(V.res[m.gid].st)))await call('POST',P+'/admin/result',{token:adm,body:{gid:m.gid,sa:m.sa,sb:m.sb,force:true}});
      await call('POST',P+'/admin/assign',{token:adm});idle=0;continue}
    if(k<.42&&open.length){ // Spieler meldet
      const m=pick(open),who=rng()<.5?m.a:m.b,[a,b]=sc();
      const r=await call('POST',P+'/result',{token:tok[who],body:{gid:m.gid,sa:a,sb:b}});
      if(r.status===409&&!/gesperrt|bestätigt/.test(r.json.msg))bad('409 unerwartet',r.text);
    }else if(k<.62){ // bestätigen
      const cand=G.filter(m=>V.res[m.gid]&&V.res[m.gid].st==='reported');
      if(cand.length){const m=pick(cand),r0=V.res[m.gid],other=[m.a,m.b].find(x=>V.players[x].id!==r0.by);
        const r=await call('POST',P+'/confirm',{token:tok[other],body:{gid:m.gid}});if(r.status!==200&&r.status!==409)bad('Bestätigen '+r.status,r.text)}
    }else if(k<.67){ // Gegenvorschlag
      const cand=G.filter(m=>V.res[m.gid]&&V.res[m.gid].st==='reported');
      if(cand.length){const m=pick(cand),r0=V.res[m.gid],other=[m.a,m.b].find(x=>V.players[x].id!==r0.by),[a,b]=sc();
        await call('POST',P+'/result',{token:tok[other],body:{gid:m.gid,sa:a,sb:b}})}
    }else if(k<.70){ // Widerspruch
      const cand=G.filter(m=>V.res[m.gid]&&V.res[m.gid].st==='reported');
      if(cand.length){const m=pick(cand),r0=V.res[m.gid],other=[m.a,m.b].find(x=>V.players[x].id!==r0.by);
        const r=await call('POST',P+'/dispute',{token:tok[other],body:{gid:m.gid}});if(r.status===200)stat.disputes++}
    }else if(k<.73&&act.length>4){ // Ausscheiden
      const i=pick(act);await call('POST',P+'/drop-request',{token:tok[i],body:{}});
      const V2=await get();if(V2.reqs&&V2.reqs.length&&rng()<.7){const r=await call('POST',P+'/admin/drop',{token:adm,body:{pid:V2.reqs[0].pid}});if(r.status===200)stat.drops++}
    }else if(k<.76){ // Organisator überschreibt
      const m=pick(G);if(m){await call('POST',P+'/admin/result',{token:adm,body:{gid:m.gid,sa:6,sb:draw?6:ri(5),force:rng()<.5}})}
    }else if(k<.84&&(auto==='off'||open.length===0)){await call('POST',P+'/admin/assign',{token:adm})}
    else if(k<.845){const r=await call('POST',P+'/admin/undo',{token:adm,body:{confirm:true}});if(r.status===200)stat.undos++}
    else if(k<.92){ // Abfrage mit since
      const r=await call('GET',P+'/state?since='+V.ver,{token:pick(tok)});if(!r.json.same&&r.json.ver===V.ver)bad('since liefert Vollantwort bei gleicher Version',{});
    }else{ // Zuschauer
      const r=await call('GET',P+'/state');if(r.json.role!=='none'||r.json.reqs||r.json.log)bad('Zuschauer sieht mehr als erlaubt',{})}
  }
  stat.steps+=steps;
  V=await get();
  if(V.status!=='finished'){bad('nicht beendet',{seed,steps,auto,ov,n,R,c});return{V,env}}
  stat.finished++;
  check(V,bad,V.S,true);
  stat.evictions+=env.stats.evictions;
  return{V,env};
}
function check(V,bad,S,fin){
  const gs=(S.ov?S.games:S.rounds.flatMap(r=>r.m.concat(r.x?[r.x]:[]))).concat(S.so||[]);
  const ids=gs.map(m=>m.gid);
  if(ids.some(x=>!Number.isInteger(x)))bad('Spiel ohne Nummer',{});
  if(new Set(ids).size!==ids.length)bad('Spielnummer doppelt',{});
  for(const k in V.res)if(!ids.includes(+k))bad('Verwaister Ergebnis-Eintrag',{k});
  if(S.ov){
    const run=S.games.filter(m=>!m.fin&&!(Number.isInteger(m.sa)&&Number.isInteger(m.sb)&&m.sa>=0&&m.sb>=0&&(S.draw||m.sa!==m.sb)));
    if(run.length>S.courts)bad('mehr laufende Spiele als Plätze',{});
    const seen=new Set();for(const m of run)for(const p of [m.a,m.b]){if(seen.has(p))bad('Spieler in zwei laufenden Spielen',{p});seen.add(p)}
  }
  if(fin){
    const cnt=Array(S.n).fill(0);
    for(const m of (S.ov?S.games:S.rounds.flatMap(r=>r.m.concat(r.x?[r.x]:[]))))if(Number.isInteger(m.sa)&&Number.isInteger(m.sb)){cnt[m.a]++;if(!m.h)cnt[m.b]++}
    const act=[...Array(S.n).keys()].filter(i=>!V.players[i].out);
    if(new Set(act.map(i=>cnt[i])).size!==1)bad('Spielzahl am Ende ungleich',{cnt,out:(S.out||[])});
    if(!V.over)bad('finished ohne over',{});
  }
}
let diff=0;
for(let seed=1;seed<=T0;seed++){
  stat.runs++;
  const a=await sim(seed,0);
  if(!a)continue;
  const b=EV>0?await sim(seed,EV):null;
  if(b&&JSON.stringify(a.V.S)!==JSON.stringify(b.V.S)){diff++;bad('Neustart-Test: Endstand weicht ab',{seed})}
}
console.log(JSON.stringify({...stat,abweichendNachNeustart:diff,verstoesse:viol,beispiele:ex}));
process.exit(Object.keys(viol).length?1:0);
