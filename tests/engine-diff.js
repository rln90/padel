// Differenztest: Die Engine (src/engine.js, ohne Browser geladen) muss bei gleicher Zufallsfolge
// und gleichen Aktionen exakt dasselbe Turnier liefern wie die eingefrorene Version V37.
const vm=require('vm'),fs=require('fs'),path=require('path');
const legacyLoad=require('./harness5.js');
const root=path.join(__dirname,'..');
function seeded(seed){return()=>{seed=(seed+0x6D2B79F5)>>>0;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
// neue Engine in leerem Kontext (kein document, window, localStorage)
const engSrc=fs.readFileSync(path.join(root,'src','engine.js'),'utf8');
function loadEngine(){
  const ctx=vm.createContext({});
  vm.runInContext(engSrc+'\n;this.E={get S(){return S},set S(v){S=v},createTournament,scoreClassic,scoreRoll,scoreSO,advanceRound,canAdvance,undoClassic,undoRoll,assignGames,doDrop,isOver,isOut,done,ranking,soBlocks,syncSOcore,rollLeft,helpLeft,extraRound,makeRound,rollAdd,validR,totalGames,MINN};',ctx);
  return ctx;
}
const legacy=legacyLoad(path.join(root,'legacy','padel-turnier_V37.html'));
const rndI=(r,n)=>Math.floor(r()*n);
function plan(seed){const r=seeded(seed*7919+1);const n=4+rndI(r,13),mode=['no','yes','wait'][rndI(r,3)],c=1+rndI(r,Math.floor(n/2));
  return{n,R:3+rndI(r,4),c,mode,draw:r()<.5,lead:rndI(r,3),dropAt:r()<.5?1+rndI(r,Math.max(2,n*3)):-1,scoreSeed:seed*31+5}}
function run(seed,adapter){
  const P=plan(seed),rs=seeded(P.scoreSeed);
  adapter.reset(seeded(seed+(process.env.MUTATE&&adapter.mut?1:0)));
  const names=[...Array(P.n).keys()].map(i=>'P'+i);
  adapter.create({n:P.n,R:P.R,names,lim:true,courts:P.c,dur:20,brk:5,draw:P.draw,cn:[],wu:0,t0:null,ov:P.mode,lead:P.lead});
  const sc=()=>{const k=rndI(rs,10);if(k<3)return[6,rndI(rs,2)?0:5];if(k<5)return[rndI(rs,2)?0:5,6];const a=rndI(rs,7);return P.draw?[a,a]:[a,(a+1+rndI(rs,6))%8]};
  let steps=0,dropped=false;const log=[];
  while(steps++<4000&&!adapter.over()){
    const S=adapter.S(),ov=!!S.ov;
    const open=ov?S.games.map((m,i)=>[m,i]).filter(([m])=>!adapter.done(m)):S.rounds[S.rounds.length-1].m.concat(S.rounds[S.rounds.length-1].x?[S.rounds[S.rounds.length-1].x]:[]).map((m,i)=>[m,i]).filter(([m])=>!adapter.done(m));
    if(!dropped&&P.dropAt>=0&&steps>=P.dropAt&&adapter.active()>4){dropped=true;const act=[...Array(S.n).keys()].filter(i=>!adapter.isOut(i));adapter.drop(act[rndI(rs,act.length)]);log.push('drop');continue}
    if(open.length){
      const [m,i]=open[rndI(rs,open.length)];const [a,b]=sc();
      if(ov){adapter.scoreRoll(S.games.indexOf(m),'a',a);adapter.scoreRoll(S.games.indexOf(m),'b',b)}
      else{const ri=S.rounds.length-1,rd=S.rounds[ri],mi=m===rd.x?-1:rd.m.indexOf(m);adapter.scoreClassic(ri,mi,'a',a);adapter.scoreClassic(ri,mi,'b',b)}
    }else{
      if(ov){const n=adapter.assign();if(!n&&!adapter.over())log.push('stuck')}
      else{if(!adapter.advance())log.push('noadv')}
    }
    if(log.length>3)break;
  }
  adapter.sync();
  return JSON.stringify({S:adapter.S(),rank:adapter.rank(),log,steps});
}
const L={ // V37
  reset(rnd){Math.random=rnd},
  create(c){ // so wie start() in V37
    const n=c.n,R=legacy.validR(n,c.R);legacy.S={n,R,names:c.names,lim:c.lim,courts:Math.min(Math.floor(n/2),c.courts||1),dur:c.dur,brk:c.brk,draw:c.draw};
    const S=legacy.S;S.wu=0;
    if(c.ov!=='no'){S.ov=true;if(c.ov==='yes')S.lead=c.lead||0;S.wait=c.ov==='wait';S.games=[];S.rk=Array.from({length:n},Math.random);legacy.justDone.clear();legacy.rollAdd()}
    else{S.rounds=[];S.rounds.push(legacy.makeRound(true))}},
  S:()=>legacy.S,done:m=>legacy.done(m),over:()=>legacy.isOver(),isOut:i=>legacy.isOut(i),active:()=>legacy.S.n-(legacy.S.out||[]).length,
  drop:i=>legacy.doDrop(i),assign:()=>legacy.rollAdd(),
  scoreRoll:(gi,s,v)=>{legacy.S.games[gi]['s'+s]=Math.min(99,Math.max(0,parseInt(v,10)))},
  scoreClassic:(ri,mi,s,v)=>{const m=mi<0?legacy.S.rounds[ri].x:legacy.S.rounds[ri].m[mi];m['s'+s]=Math.min(99,Math.max(0,parseInt(v,10)))},
  advance:()=>{const S=legacy.S,rd=S.rounds[S.rounds.length-1];if(rd.m.concat(rd.x?[rd.x]:[]).some(m=>!legacy.done(m)))return false;
    if(S.rounds.length>=S.R){const x=legacy.extraRound();if(!x)return false;S.rounds.push(x)}else S.rounds.push(legacy.makeRound(false));return true},
  sync:()=>{},rank:()=>legacy.ranking()};
function N(){const ctx=loadEngine(),E=()=>ctx.E;return{mut:1,
  reset(rnd){ctx.__r=rnd;vm.runInContext('Math.random=()=>__r()',ctx);},
  create:c=>E().createTournament({...c,t0:null}),
  S:()=>E().S,done:m=>E().done(m),over:()=>E().isOver(),isOut:i=>E().isOut(i),active:()=>E().S.n-(E().S.out||[]).length,
  drop:i=>E().doDrop(i),assign:()=>E().assignGames(),
  scoreRoll:(gi,s,v)=>E().scoreRoll(gi,s,v),scoreClassic:(ri,mi,s,v)=>E().scoreClassic(ri,mi,s,v),advance:()=>E().advanceRound(),
  sync:()=>{},rank:()=>E().ranking()}}
const T=+process.argv[2]||400;let diff=0,same=0,fin=0,ex=null;const adN=N();
for(let seed=1;seed<=T;seed++){
  let a,b;
  try{a=run(seed,L)}catch(e){a='ERR '+e.message}
  try{b=run(seed,adN)}catch(e){b='ERR '+e.message}
  if(a===b){same++;if(!/ERR/.test(a)&&!JSON.parse(a).log.some(x=>x!=='drop'))fin++}else{diff++;if(!ex)ex={seed,a:a.slice(0,200),b:b.slice(0,200)}}
}
console.log(JSON.stringify({turniere:T,identisch:same,abweichend:diff,ohneHaenger:fin,beispiel:ex}));
process.exit(diff?1:0);
