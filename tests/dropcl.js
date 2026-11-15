const load=require('./harness5.js');const A=load(require('./paths').HTML);
const rnd=n=>Math.floor(Math.random()*n);
let T=0,bad={},hist={},extras={};
for(let t=0;t<3000;t++){
  const n=5+rnd(12),R=A.validR(n,3+rnd(4));
  A.S={n,R,names:[...Array(n).keys()].map(i=>'P'+i),lim:true,courts:2,dur:20,brk:5,draw:true,rounds:[],out:[]};
  const first=A.makeRound(true);if(!first)continue;A.S.rounds.push(first);
  let ok=true,drops=rnd(3);
  for(let r=0;r<R&&ok;r++){
    const rd=A.S.rounds[r];
    // evtl. Ausscheiden mitten in der Runde (vor Ergebnissen)
    if(drops&&rnd(3)===0&&n-A.S.out.length>4){const act=[...Array(n).keys()].filter(i=>!A.isOut(i));A.doDrop(act[rnd(act.length)]);drops--}
    rd.m.concat(rd.x?[rd.x]:[]).forEach(m=>{if(!A.done(m)){m.sa=rnd(7);m.sb=rnd(7)}});
    if(r<R-1){const nx=A.makeRound(false);if(!nx){ok=false;bad['makeRound null']=(bad['makeRound null']||0)+1;break}A.S.rounds.push(nx)}
  }
  if(!ok)continue;
  let g=0,ne=0;for(let x;(x=A.extraRound())&&g++<10;){A.S.rounds.push(x);ne++;x.m.forEach(m=>{m.sa=rnd(7);m.sb=rnd(7)})}
  if(A.extraRound())bad['Extra endet nicht']=(bad['Extra endet nicht']||0)+1;
  T++;extras[ne]=(extras[ne]||0)+1;
  const cnt=Array(n).fill(0);A.S.rounds.forEach(rd=>rd.m.concat(rd.x?[rd.x]:[]).forEach(m=>{cnt[m.a]++;if(!m.h)cnt[m.b]++}));
  const act=[...Array(n).keys()].filter(i=>!A.isOut(i));
  const d=Math.max(...act.map(i=>cnt[i]))-Math.min(...act.map(i=>cnt[i]));
  if(act.some(i=>cnt[i]!==A.S.R))bad['Ungleich nach Extra']=(bad['Ungleich nach Extra']||0)+1;const ss=A.stats();if(act.some(i=>ss[i].g!==cnt[i]))bad['Sp-Spalte']=(bad['Sp-Spalte']||0)+1;hist[d]=(hist[d]||0)+1;
}
console.log({extrarunden:extras,turniere:T,spreizungAktive:hist,bad});
