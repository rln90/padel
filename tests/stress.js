const load=require('./harness2.js');
const A=load(require('./paths').HTML);
const rnd=n=>Math.floor(Math.random()*n),pick=a=>a[rnd(a.length)];
const cases=+process.argv[2]||1000;
const st={cases:0,steps:0,adds:0,overlapStarts:0,undo:0,edit:0,clear:0,peekChecks:0,rematch:0,viol:{},ex:{},finishedOk:0};
let curCat='';
const bad=(k,info)=>{k=curCat+k;st.viol[k]=(st.viol[k]||0)+1;if(!st.ex[k])st.ex[k]=info};
const key=(a,b)=>a<b?a+'-'+b:b+'-'+a;
function score(draw){let a=rnd(8),b=rnd(8);if(!draw&&a===b)b=a+1+rnd(3);return[a,b]}
for(let t=0;t<cases;t++){
  const r0=Math.random();
  const n=r0<.5?5+rnd(8):r0<.85?4+rnd(21):4+rnd(21);
  const Rraw=Math.random()<.12?10+rnd(11):3+rnd(7),R=A.validR(n,Rraw),c=1+rnd(Math.floor(n/2)),draw=Math.random()<.5;
  const tag=`n=${n} R=${R} c=${c}`;curCat=R<=n-1?'[R<=n-1] ':'[R>n-1] ';st.catCount=st.catCount||{};st.catCount[curCat]=(st.catCount[curCat]||0)+1;
  A.S={n,R,names:[...Array(n).keys()].map(i=>'P'+i),lim:true,courts:c,dur:20,brk:5,draw,ov:true,games:[],rk:Array.from({length:n},Math.random)};
  A.justDone.clear();
  const style=pick(['fifo','random','laggard','bursty']),G=A.totalGames(n,R);
  let held=null,guard=0,seen=new Set();
  while(guard++<30000){
    st.steps++;
    const S=A.S,L=S.games;
    const live=L.filter(m=>!m.fin&&!A.done(m)),left=G-L.length;
    // Invarianten
    const ps=live.flatMap(m=>[m.a,m.b]);if(new Set(ps).size!==ps.length)bad('Spieler in zwei laufenden Spielen',tag);
    const cs=live.map(m=>m.c);if(new Set(cs).size!==cs.length)bad('Platz doppelt belegt',tag);
    if(live.some(m=>m.c<0||m.c>=c))bad('Platz außerhalb',tag);
    const g=Array(n).fill(0);L.forEach(m=>{g[m.a]++;g[m.b]++;if(m.a===m.b)bad('Spieler gegen sich selbst',tag)});
    if(g.some(x=>x>R))bad('mehr als R Spiele',tag);
    const I=A.rollInfo(L,n);
    if(I.some(f=>f.r>R))bad('Runde über R',tag);
    const per=Array.from({length:n},()=>[]);L.forEach((m,i)=>{per[m.a].push(I[i]);per[m.b].push(I[i])});
    per.forEach(a=>{for(let i=1;i<a.length;i++){if(a[i].r<a[i-1].r)bad('Runde eines Spielers sinkt',tag);if(i>=2&&a[i].r===a[i-1].r&&a[i-1].r===a[i-2].r)bad('drei Spiele in einer Runde',tag)}});
    I.forEach(f=>{if(f.x&&!(n%2&&f.r%2===0))bad('Zusatzspiel in falscher Runde',tag)});
    // Fortschritt / Ende
    const pend=L.filter(m=>!A.done(m));
    if(left===0&&pend.length===0)break;
    const free=c-live.length;
    // Paarung hängt nur von beendeten Ergebnissen ab: Teilergebnisse laufender Spiele ändern nichts
    if(free>0&&left>0&&Math.random()<.25){
      const s0=A.rollState(),p1=JSON.stringify(A.rollPick(s0,free));
      const saved=live.map(m=>[m.sa,m.sb]);live.forEach(m=>{m.sa=rnd(7);m.sb=null});
      const p2=JSON.stringify(A.rollPick(A.rollState(),free));
      live.forEach((m,i)=>{m.sa=saved[i][0];m.sb=saved[i][1]});
      st.peekChecks++;if(p1!==p2)bad('Paarung hängt von laufenden Ergebnissen ab',tag);
    }
    let did=false;
    const canAdd=free>0&&left>0;
    const r=Math.random();
    if(canAdd&&r<.45){
      const before=L.length,lv=live.map(m=>I[L.indexOf(m)].r);
      const k=A.rollAdd();
      if(k>0){
        st.adds++;did=true;
        const I2=A.rollInfo(S.games,n);
        for(let i=before;i<S.games.length;i++){
          const m=S.games[i],r2=I2[i].r;
          if(seen.has(key(m.a,m.b)))st.rematch++;seen.add(key(m.a,m.b));
          if(lv.some(x=>x<r2))st.overlapStarts++;
        }
        A.justDone.clear();
      }
    }
    if(!did&&live.length&&r>=.45&&r<.93){
      const cand=live.filter(m=>m!==held);
      if(style==='laggard'&&!held)held=live[0];
      const pool=style==='fifo'?[live[0]]:style==='bursty'?live.slice(0,1+rnd(live.length)):cand.length?cand:[];
      const m=style==='fifo'?live[0]:pick(pool.length?pool:[]);
      if(m&&!(style==='laggard'&&m===held&&cand.length)){const [a,b]=score(draw);m.sa=a;m.sb=b;A.justDone.add(L.indexOf(m));did=true}
    }
    if(!did&&r>=.93&&r<.96){ // Undo der jüngsten Runde wie in der App
      const mx=Math.max(...I.map(f=>f.r));
      if(mx>=2){S.games=L.filter((m,i)=>I[i].r!==mx);A.justDone.clear();held=null;st.undo++;did=true}
    }
    if(!did&&r>=.96){ // Ergebnis in der jüngsten Runde korrigieren oder löschen
      const rows=A.rollView().rows.filter(([m])=>A.done(m));
      if(rows.length){const [m]=pick(rows);
        if(Math.random()<.3){m.sa=null;st.clear++}else{const [a,b]=score(draw);m.sa=a;m.sb=b;st.edit++}
        did=true}
    }
    if(!did){
      const live2=L.filter(m=>!m.fin&&!A.done(m));
      if(live2.length){const m=live2[0];const [a,b]=score(draw);m.sa=a;m.sb=b;held=null}
      else if(left>0){
        const k=A.rollAdd();
        if(k===0){bad('Stillstand: nichts ansetzbar',tag+' games '+L.length+'/'+G);break}
        st.adds++;
      }else{ // nur noch gelöschte Ergebnisse
        const m=pend[0];const [a,b]=score(draw);m.sa=a;m.sb=b;
      }
    }
  }
  if(guard>=30000)bad('Endlosschleife',tag);
  // Endprüfung
  const L=A.S.games,g=Array(n).fill(0);L.forEach(m=>{g[m.a]++;g[m.b]++});
  const fin=L.length===G&&g.every(x=>x===R)&&L.every(m=>A.done(m));
  if(!fin)bad('Turnier unvollständig',tag+' '+g.join(','));else st.finishedOk++;
  const I=A.rollInfo(L,n),m=Math.floor(n/2);
  for(let r=1;r<=R&&fin;r++){
    const reg=I.filter(f=>f.r===r&&!f.x).length,ex=I.filter(f=>f.r===r&&f.x).length;
    if(reg!==m)bad('Runde mit falscher Spielzahl',tag+' R'+r+' reg '+reg);
    if(ex!==(n%2&&r%2===0?1:0))bad('Zusatzspiel-Anzahl falsch',tag+' R'+r+' ex '+ex);
  }
  st.cases++;
}
console.log(JSON.stringify({...st,viol:undefined,ex:undefined}));
console.log('Verstöße:',Object.keys(st.viol).length?JSON.stringify(st.viol,null,1):'keine');
if(Object.keys(st.ex).length)console.log('Beispiele:',JSON.stringify(st.ex,null,1));
