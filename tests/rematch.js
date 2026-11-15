const load=require('./harness2.js');const A=load(process.argv[3]||require('./paths').HTML);
const rnd=n=>Math.floor(Math.random()*n);
const T=+process.argv[2]||300;
function sc(draw){const k=rnd(10);if(k<3)return[6,rnd(2)?0:5];if(k<6)return[rnd(2)?0:5,6];const a=rnd(7);let b=rnd(7);if(a===b&&!draw)b=(b+1)%7;return[a,b]}
function overlap(n,R,c,wait,draw){
  A.S={n,R,names:[...Array(n).keys()].map(i=>'P'+i),lim:true,courts:c,dur:20,brk:5,draw,ov:true,wait,games:[],rk:Array.from({length:n},Math.random)};A.justDone.clear();
  const G=A.totalGames(n,R);let guard=0;A.rollAdd();
  while(guard++<4000){const l=A.S.games.filter(m=>!m.fin&&!A.done(m));
    if(!l.length){if(A.S.games.length>=G)break;A.rollAdd();if(!A.S.games.some(m=>!m.fin&&!A.done(m)))return null;continue}
    const m=l[rnd(l.length)];const s=sc(draw);m.sa=s[0];m.sb=s[1];A.rollAdd()}
  if(A.S.games.length<G)return null;return A.S.games;
}
function classic(n,R,draw){
  A.S={n,R,names:[...Array(n).keys()].map(i=>'P'+i),lim:true,courts:1,dur:20,brk:5,draw,games:undefined,rounds:[]};
  A.S.rounds.push(A.makeRound(true));
  for(let r=0;r<R;r++){const rd=A.S.rounds[r];rd.m.concat(rd.x?[rd.x]:[]).forEach(m=>{const s=sc(draw);m.sa=s[0];m.sb=s[1]});if(r<R-1)A.S.rounds.push(A.makeRound(false))}
  return A.S.rounds.flatMap(rd=>rd.m.concat(rd.x?[rd.x]:[]));
}
const res={};
for(const mode of ['classic','yes','wait']){
 let tn=0,withRe=0,reGames=0,games=0,fail=0;
 for(let t=0;t<T;t++){
  const n=6+rnd(15),R=A.validR(n,3+rnd(Math.max(1,Math.min(6,n-1-3+1)))),c=1+rnd(Math.floor(n/2));
  if(R>n-1)continue;
  const L=mode==='classic'?classic(n,R,true):overlap(n,R,c,mode==='wait',true);
  if(!L){fail++;continue}
  const seen=new Set();let re=0;L.forEach(m=>{const k=m.a<m.b?m.a+'-'+m.b:m.b+'-'+m.a;if(seen.has(k))re++;seen.add(k)});
  tn++;if(re)withRe++;reGames+=re;games+=L.length;
 }
 console.log(mode.padEnd(8),'Turniere',tn,'| mit Wiederholungsspiel',(100*withRe/tn).toFixed(1)+'%','| Wiederholungen je 100 Spiele',(100*reGames/games).toFixed(2),fail?'| FEHLER '+fail:'');
}
