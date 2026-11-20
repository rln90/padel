/* Phase 15: „Trotzdem jetzt ansetzen“ bei Abwarten, Zeilen im Spielplan nach Ansetz-Block */
const load=require('./harness15.js');const A=load(require('./paths').HTML);
let bad=0;const ok=(c,m)=>{if(!c){bad++;console.log('FEHLER',m)}};
const N=['Benji','Horst','Gert','Detlef','7','Robin','Eduard','8','9'],id=n=>N.indexOf(n);
const G=[['Benji','Horst',3,3],['Gert','Detlef',3,3],['7','Robin',2,2],['Eduard','8',2,2],['9','Benji',2,2],['Horst','Gert',2,2],['Detlef','7',2,1],['Robin','Eduard',2,3],['9','8',2,2,1],['Detlef','Eduard',3,4],['Benji','Gert',4,4],['Horst','8',4,4],['9','Robin',3,4],['Detlef','Robin',3,2],['Benji','8',3,3],['7','Eduard',null,null]];
function setup(wait){A.S={n:9,R:4,names:N,lim:true,courts:3,dur:20,brk:5,draw:true,ov:true,wait,games:[],rk:[.1,.2,.3,.4,.5,.6,.7,.8,.9]};A.justDone.clear();
  G.forEach((g,i)=>{const m={a:id(g[0]),b:id(g[1]),sa:g[2],sb:g[3],c:i%3,k:Math.floor(i/3)};if(g[4])m.h=1;if(g[2]!=null)m.fin=m.k+1;A.S.games.push(m)})}
/* 1. Lage aus der Praxis: 2 Plätze frei, Abwarten setzt nichts an */
setup(true);let st=A.rollState();
ok(A.rollPick(st,2).length===0,'abwarten: nichts angesetzt');
const pk=A.rollPeekNow(st,2);ok(pk.length===2,'Vorschau ohne Abwarten: 2 Spiele ('+pk.length+')');
ok(A.S.wait===true,'Modus nach Vorschau unverändert');
const n0=A.S.games.length,k=A.rollAddNow();
ok(k===2&&A.S.games.length===n0+2,'2 Spiele angesetzt');ok(A.S.wait===true,'Modus nach Ansetzen unverändert');
const live=A.S.games.filter(m=>!m.fin&&!A.done(m)),ps=live.flatMap(m=>[m.a,m.b]);
ok(new Set(ps).size===ps.length,'kein Spieler doppelt');ok(new Set(live.map(m=>m.c)).size===live.length,'Plätze verschieden');
ok(A.rollAddNow()===0,'zweites Ansetzen: nichts mehr (alle Plätze belegt)');
/* 2. ohne Wirkung, wenn Abwarten ohnehin ansetzen würde oder nichts frei ist */
setup(false);st=A.rollState();ok(A.rollPick(st,2).length===2,'ohne Abwarten setzt an');
/* 3. Zeilen: gleicher Block = gleiche Zeile, kein Platz doppelt */
setup(true);const R=A.rollRows(A.S.games,3);
for(let i=0;i<G.length;i++)for(let j=i+1;j<G.length;j++){const a=A.S.games[i],b=A.S.games[j];
  if(a.c===b.c)ok(R[i]!==R[j],'Platz '+a.c+' Zeile doppelt');
  if(a.k===b.k)ok(R[i]===R[j],'Block '+a.k+' in einer Zeile');
  if(a.c===b.c&&a.k<b.k)ok(R[i]<R[j],'Reihenfolge je Platz')}
/* 4. Zufallsläufe im Abwarten-Modus mit gelegentlichem Override: Turnier endet, alle gleich viele Spiele, nie Doppelbelegung */
const rnd=n=>Math.floor(Math.random()*n);let runs=0,stuck=0,forced=0;
for(let t=0;t<400;t++){
  const n=4+rnd(13),Rr=A.validR(n,3+rnd(3)),c=1+rnd(Math.max(1,Math.floor(n/2))),draw=Math.random()<.5;
  A.S={n,R:Rr,names:[...Array(n).keys()].map(i=>'P'+i),lim:true,courts:c,dur:20,brk:5,draw,ov:true,wait:true,games:[],rk:Array.from({length:n},Math.random)};A.justDone.clear();
  const Gt=A.totalGames(n,Rr);let guard=0;A.rollAdd();
  while(guard++<4000){
    const lv=A.S.games.filter(m=>!m.fin&&!A.done(m));
    const pl=lv.flatMap(m=>[m.a,m.b]);if(new Set(pl).size!==pl.length){ok(0,'Doppelbelegung '+n+'/'+Rr+'/'+c);break}
    if(new Set(lv.map(m=>m.c)).size!==lv.length){ok(0,'Platz doppelt');break}
    if(A.S.games.length>=Gt&&!lv.length)break;
    if(lv.length&&Math.random()<.8){const m=lv[rnd(lv.length)];m.sa=rnd(7);m.sb=m.sa===6?rnd(6):6;if(Math.random()<.5){const q=m.sa;m.sa=m.sb;m.sb=q}}
    const before=A.S.games.length;
    if(Math.random()<.3){const f=A.rollAddNow();if(f)forced++}else A.rollAdd();
    if(!lv.length&&A.S.games.length===before&&before<Gt){A.rollAddNow()}
    if(!lv.length&&A.S.games.length===before&&before<Gt){stuck++;break}
  }
  runs++;
  if(A.S.wait!==true)ok(0,'Modus verändert');
  if(A.S.games.length===Gt){const g=Array(n).fill(0);A.S.games.forEach(m=>{g[m.a]++;if(!m.h)g[m.b]++});if(g.some(x=>x!==Rr))ok(0,'Spielzahl ungleich '+g.join()+' R='+Rr)}
}
ok(stuck===0,'festgefahren: '+stuck);
console.log(`Läufe ${runs}, erzwungene Ansetzungen ${forced}, hängen geblieben ${stuck}`);
console.log(bad?'FEHLER gesamt '+bad:'ALLES OK');
