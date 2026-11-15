const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const page=await b.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.goto('file://'+require('./paths').HTML);
const cfgs=[[9,4,3,'yes'],[7,6,3,'yes'],[9,6,3,'yes'],[11,6,4,'wait'],[9,4,2,'yes']];
for(const [n,R,c,mode] of cfgs){
 const res=await page.evaluate(([n,R,c,mode,T])=>{
  let ex2=[],labBad=0,beyond=0,bad=0,shown=0,steps=0,maxMs=0,sumMs=0,nonempty=0,examples=[];
  for(let t=0;t<T;t++){
   const rk=Array.from({length:n},Math.random);
   S={n,R,names:[...Array(n).keys()].map(i=>'S'+(i+1)),lim:true,courts:c,dur:20,brk:5,draw:Math.random()<.3,ov:true,wait:mode==='wait',games:[],rk};
   justDone.clear();
   const G=totalGames(n,R);const rec=[];let guard=0;
   rollAdd();
   while(guard++<400){
     const t0=performance.now();const sure=rollSure();const ms=performance.now()-t0;maxMs=Math.max(maxMs,ms);sumMs+=ms;steps++;
     const pk=(()=>{const st=rollState(),fr=S.courts-st.courts.size;return fr&&G-S.games.length?rollPick(st,fr).length:0})();if(sure.length>pk)beyond++;if(sure.length){nonempty++;rec.push({rows:sure.map(g=>({k:key(g.a,g.b),r:g.r,t:g.t})),g0:S.games.length,keys:sure.map(g=>key(g.a,g.b)).sort().join(','),r:sure.map(g=>g.r)})}
     const live=S.games.filter(m=>!m.fin&&!done(m));
     if(!live.length&&S.games.length>=G)break;
     if(live.length){const k=Math.random()<.35?2:1;for(let q=0;q<k&&live.length;q++){const m=live.splice(Math.floor(Math.random()*live.length),1)[0];{const r=Math.random();if(r<.2){m.sa=40;m.sb=0}else if(r<.4){m.sa=0;m.sb=40}else if(r<.6){m.sa=7;m.sb=6}else if(r<.7&&S.draw){m.sa=m.sb=3}else{m.sa=Math.floor(Math.random()*13);m.sb=Math.floor(Math.random()*13);if(m.sa===m.sb&&!S.draw)m.sb++}}}}
     rollAdd();
     if(!S.games.some(m=>!m.fin&&!done(m))&&S.games.length<G){rollAdd();if(!S.games.some(m=>!m.fin&&!done(m)))break}
   }
   rec.forEach(r=>{shown++;const m=r.keys.split(',').length;const rest=S.games.slice(r.g0).map(x=>key(x.a,x.b));const cnt=a=>a.reduce((o,k)=>(o[k]=(o[k]||0)+1,o),{});const need=cnt(r.keys.split(',')),have=cnt(rest);const act=JSON.stringify(have);const IIf=rollInfo(S.games,n);let lab=false;const usedI=new Set();r.rows.forEach(w=>{let f=-1;for(let q=r.g0;q<S.games.length;q++){if(!usedI.has(q)&&key(S.games[q].a,S.games[q].b)===w.k&&IIf[q].r===w.r){f=q;break}}if(f<0){lab=true;if(ex2.length<3)ex2.push({n,why:'r/pair',w,g0:r.g0,have:S.games.slice(r.g0).map((q,z)=>key(q.a,q.b)+'@r'+IIf[r.g0+z].r+(IIf[r.g0+z].x?'x':'j'+IIf[r.g0+z].j)).join(' ')});return}usedI.add(f);if(w.t==='Zusatzspiel'?!IIf[f].x:(w.t&&('Spiel '+IIf[f].j)!==w.t)){lab=true;if(ex2.length<3)ex2.push({n,why:'label',w,got:IIf[f]})}});if(lab)labBad++;if(Object.keys(need).some(k=>(have[k]||0)<need[k])){bad++;if(examples.length<2)examples.push({g0:r.g0,sure:r.keys,actual:act})}});
  }
  return{ex2,labBad,beyond,bad,shown,steps,nonempty,avgMs:+(sumMs/steps).toFixed(1),maxMs:Math.round(maxMs),examples};
 },[n,R,c,mode,250]);
 console.log(`n=${n} R=${R} c=${c} ${mode}:`,JSON.stringify(res));
}
console.log('Fehler',errs);await b.close()})();
