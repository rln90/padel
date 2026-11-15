const load=require('./harness5.js');const A=load(require('./paths').HTML);
const rnd=n=>Math.floor(Math.random()*n);const key=(a,b)=>a<b?a+'-'+b:b+'-'+a;
function sc(draw){const k=rnd(10);if(k<3)return[6,rnd(2)?0:5];if(k<5)return[rnd(2)?0:5,6];const a=rnd(7);return draw?[a,a]:[a,(a+1+rnd(6))%8]}
const res={};const bad=(k,m)=>{res[k]=res[k]||{n:0,ex:m};res[k].n++};
let T=0,withDrop=0,states=0,short1=0;
for(const mode of ['yes','wait','yes1']){for(let t=0;t<500;t++){
  const n=5+rnd(14),R=A.validR(n,3+rnd(4)),c=1+rnd(Math.floor(n/2)),draw=rnd(2)===0;
  A.S={n,R,names:[...Array(n).keys()].map(i=>'P'+i),lim:true,courts:c,dur:20,brk:5,draw,ov:true,wait:mode==='wait',lead:mode==='yes1'?1:0,games:[],rk:Array.from({length:n},Math.random),out:[]};A.justDone.clear();
  let guard=0;const dropAt=1+rnd(Math.max(2,n*R/4|0));let steps=0,dropped=0;
  const maxDrops=rnd(3);
  const inv=()=>{states++;
    const run=A.S.games.filter(m=>!m.fin&&!A.done(m));
    if(run.length>c)bad('1 mehr laufende Spiele als Plätze',{n,c});
    const seen=new Set();for(const m of run)for(const p of [m.a,m.b]){if(seen.has(p))bad('2 Spieler doppelt',{n});seen.add(p);if(A.isOut(p))bad('3 Ausgeschiedener spielt',{n,p})}
    const cs=run.map(m=>m.c);if(new Set(cs).size!==cs.length)bad('4 Platz doppelt',{n});
    const cnt=Array(n).fill(0);A.S.games.forEach(m=>{cnt[m.a]++;if(!m.h)cnt[m.b]++});
    if(cnt.some((x,i)=>x>R))bad('5 mehr als R Spiele',{n,R});
    // Ausgeschiedene: keine neuen Spiele nach dem Ausscheiden (kein offenes Spiel)
  };
  A.rollAdd();inv();
  while(guard++<3000){steps++;
    if(dropped<maxDrops&&steps===dropAt+dropped*3&&n-A.S.out.length>4){const act=[...Array(n).keys()].filter(i=>!A.isOut(i));A.doDrop(act[rnd(act.length)]);dropped++;A.rollAdd();inv()}
    const l=A.S.games.filter(m=>!m.fin&&!A.done(m));
    if(!l.length){if(A.rollLeft()===0&&A.helpLeft()===0)break;A.rollAdd();inv();if(!A.S.games.some(m=>!m.fin&&!A.done(m)))break;continue}
    const m=l[rnd(l.length)];const s=sc(draw);m.sa=s[0];m.sb=s[1];A.rollAdd();inv()}
  T++;if(dropped)withDrop++;
  if(!(A.rollLeft()===0&&A.helpLeft()===0&&A.S.games.every(A.done)))bad('6 Turnier endet nicht ('+mode+')',{n,R,c,out:A.S.out.length,left:A.rollLeft()});
  else{ // am Ende: jeder aktive Spieler hat R Spiele oder höchstens eins weniger (zwei Spieler in Summe höchstens)
    const cnt=Array(n).fill(0);A.S.games.forEach(m=>{cnt[m.a]++;if(!m.h)cnt[m.b]++});
    const act=[...Array(n).keys()].filter(i=>!A.isOut(i));const lo=act.filter(i=>cnt[i]<R);
    if(lo.length>0)bad('7 Spieler mit weniger als R Spielen am Ende',{n,R,lo:lo.map(i=>cnt[i])});
    if(A.S.games.some(m=>m.h))short1++;
    const stt=A.stats(),ex=Array(n).fill(0);A.S.games.forEach(m=>{ex[m.a]++;if(!m.h)ex[m.b]++});
    if(stt.some((x,i)=>x.g!==ex[i]))bad('9 Tabellen-Spiele passen nicht',{n});
    A.S.games.filter(m=>m.h).forEach(m=>{ if(A.isOut(m.a)||A.isOut(m.b))bad('10 Zusatzspiel mit Ausgeschiedenem',{n}); if(m.a===m.b)bad('11 Selbstspiel',{n}) });
    const r=A.ranking();if(r.slice(0,act.length).some(s=>s.out)||r.slice(act.length).some(s=>!s.out))bad('8 Ausgeschiedene nicht am Tabellenende',{n});
  }
}}
console.log({turniere:T,mitAusscheiden:withDrop,zustaende:states,mitZusatzspiel:short1,verstoesse:JSON.stringify(res)});
