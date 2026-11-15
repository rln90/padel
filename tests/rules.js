const load=require('./harness5.js');const A=load(require('./paths').HTML);
const key=(a,b)=>a<b?a+"-"+b:b+"-"+a;const rnd=n=>Math.floor(Math.random()*n);
let byeChecks=0,byeBad=0,adj=0,tot=0,xr=0,xBad=0,rematch=0,games=0,noBye=0;
for(let t=0;t<1500;t++){
  const n=5+rnd(12),R=A.validR(n,3+rnd(4));
  A.S={n,R,names:[...Array(n).keys()].map(i=>'P'+i),lim:true,courts:2,dur:20,brk:5,draw:true,rounds:[],out:[]};
  for(let r=0;r<R;r++){
    const st=A.stats();const pv=r?A.S.rounds[r-1].bye:null;
    const rd=A.makeRound(r===0);if(!rd)break;
    if(n%2){byeChecks++;const second=r%2===1;const elig=[...Array(n).keys()].filter(i=>!(second&&i===pv));const mn=Math.min(...elig.map(i=>st[i].b));if(st[rd.bye].b!==mn)byeBad++;
      if(second&&rd.x)xr++;else if(second&&pv!=null&&!rd.x)xBad++}
    if(!(n%2)&&rd.bye!=null)noBye++;
    if(r>0){const order=st.slice().sort(A.cmp||((a,b)=>b.p-a.p||(b.gf-b.ga)-(a.gf-a.ga))).map(s=>s.i);rd.m.forEach(m=>{tot++;if(Math.abs(order.indexOf(m.a)-order.indexOf(m.b))===1)adj++})}
    const seen=new Set(A.S.rounds.flatMap(x=>x.m).map(m=>key(m.a,m.b)));rd.m.forEach(m=>{games++;if(seen.has(key(m.a,m.b)))rematch++});
    A.S.rounds.push(rd);rd.m.concat(rd.x?[rd.x]:[]).forEach(m=>{m.sa=rnd(7);m.sb=rnd(7)});
  }
}
console.log({pausiertWenigstePausen:byeChecks-byeBad+'/'+byeChecks,zusatzspielInGeraderRunde:xr,zusatzFehlt:xBad,ungeradePausierendBeiGeraderZahl:noBye,benachbarteTabellenplaetze:(100*adj/tot).toFixed(1)+'%',wiederholungenAnteil:(100*rematch/games).toFixed(2)+'%'});
