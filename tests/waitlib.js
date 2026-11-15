const load=require('./harness2.js');const A=load(require('./paths').HTML);
const rnd=n=>Math.floor(Math.random()*n);
function run(n,R,c,wait,jit){
  A.S={n,R,names:[...Array(n).keys()].map(i=>'P'+i),lim:true,courts:c,dur:20,brk:5,draw:false,ov:true,wait,games:[],rk:Array.from({length:n},Math.random)};A.justDone.clear();
  const G=A.totalGames(n,R);let t=0,guard=0;const end=new Map();
  const start=()=>{const before=A.S.games.length;A.rollAdd();for(let i=before;i<A.S.games.length;i++)end.set(A.S.games[i],t+1+(jit?(Math.random()-.5)*jit:0))};
  start();
  while(guard++<5000){
    const live=A.S.games.filter(m=>!m.fin&&!A.done(m));
    if(!live.length){ if(A.S.games.length>=G)break; start(); if(!A.S.games.some(m=>!m.fin&&!A.done(m)))return null; continue}
    const m=live.reduce((x,y)=>end.get(x)<=end.get(y)?x:y);t=end.get(m);
    m.sa=rnd(7);m.sb=m.sa===6?rnd(6):6;if(Math.random()<.5){const q=m.sa;m.sa=m.sb;m.sb=q}
    // alle gleichzeitig endenden mit abwarten: nur dieses Ergebnis, dann ansetzen
    start();
  }
  const L=A.S.games;if(L.length<G)return null;
  const I=A.rollInfo(L,n),gaps=[];let mm=0,tot=0;
  for(let r=2;r<=R;r++){
    const tb=Array.from({length:n},(_,i)=>({i,p:0,gf:0,ga:0,w:0}));
    L.forEach((m,k)=>{if(I[k].r>=r)return;const a=tb[m.a],b=tb[m.b];a.gf+=m.sa;a.ga+=m.sb;b.gf+=m.sb;b.ga+=m.sa;if(m.sa>m.sb){a.p+=3;a.w++}else{b.p+=3;b.w++}});
    const o=tb.slice().sort((x,y)=>y.p-x.p||(y.gf-y.ga)-(x.gf-x.ga)||y.w-x.w||y.gf-x.gf||x.i-y.i).map(s=>s.i);
    L.forEach((m,k)=>{if(I[k].r===r&&!I[k].x){tot++;const gp=Math.abs(o.indexOf(m.a)-o.indexOf(m.b));gaps.push(gp);if(gp>2)mm++}});
  }
  let rem=0;const seen=new Set();L.forEach(m=>{const k=m.a<m.b?m.a+'-'+m.b:m.b+'-'+m.a;if(seen.has(k))rem++;seen.add(k)});
  return{time:Math.max(...L.map(m=>end.get(m))),gaps,mm,tot,rem};
}

module.exports={A,run};
