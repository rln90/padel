// Prüft die Zusage von "Abwarten": Jedes angesetzte Paar muss auch entstehen, wenn man alle laufenden Spiele
// mit beliebigen Ergebnissen beendet und dann OHNE Warten (echte Engine) paart.
const file=process.argv[3]||require('./paths').HTML;
const load=require('./harness2.js');const A=load(file);
const rnd=n=>Math.floor(Math.random()*n);const key2=(a,b)=>a<b?a+'-'+b:b+'-'+a;
const T=+process.argv[2]||600,K=+process.argv[4]||60;
let checked=0,viol=0,withPend=0,assigned=0,ex=0;
const rndScore=draw=>{const k=rnd(10);if(k<3)return[6,rnd(2)?0:5];if(k<6)return[rnd(2)?0:5,6];const a=rnd(7),b=rnd(7);return(a===b&&!draw)?[a,(b+1)%7]:[a,b]};
for(let t=0;t<T;t++){
  const n=4+rnd(15),R=A.validR(n,3+rnd(5)),c=1+rnd(Math.floor(n/2)),draw=Math.random()<.6;
  A.S={n,R,names:[...Array(n).keys()].map(i=>'P'+i),lim:true,courts:c,dur:20,brk:5,draw,ov:true,wait:true,games:[],rk:Array.from({length:n},Math.random)};A.justDone.clear();
  const G=A.totalGames(n,R);let guard=0;
  while(guard++<3000){
    const L=A.S.games;
    L.forEach(m=>{if(!A.done(m)&&!m.fin&&Math.random()<.35){const s=rndScore(draw);m.sa=s[0];m.sb=s[1]}});
    if(L.length>=G&&L.every(A.done))break;
    const st=A.rollState(),before=L.length,gB=st.g.slice();
    // Schnappschuss des Zustands vor dem Ansetzen
    const snap=JSON.stringify(A.S);
    A.rollAdd();
    const added=L.slice(before);assigned+=added.length;
    for(const m of added){
      const lv=gB[m.a];if(gB[m.b]!==lv)continue;
      const pendInGroup=[...st.busy].some(i=>gB[i]===lv);
      if(!pendInGroup)continue;
      withPend++;
      let bad=false;
      for(let k=0;k<K&&!bad;k++){
        const S0=JSON.parse(snap);A.S=S0;
        S0.games.forEach(q=>{if(!A.done(q)&&!q.fin){const s=rndScore(draw);q.sa=s[0];q.sb=s[1]}});
        S0.wait=false;
        const st2=A.rollState();
        const ps=A.rollPick(st2,99);
        if(!ps.some(([u,v])=>(u===m.a&&v===m.b)||(u===m.b&&v===m.a))){bad=true;if(ex<2){require('fs').writeFileSync('viol'+ex+'.json',JSON.stringify({snap,pair:[m.a,m.b],lv}));const sts=A.stats();const grp=[];for(let i=0;i<n;i++)if(st2.g[i]===lv)grp.push(i);console.log('DETAIL n',n,'lv',lv,'wait pair',m.a,m.b,'| gruppe',grp.join(','),'| pts',grp.map(i=>i+':'+sts[i].p).join(' '),'| g',st2.g.join(''),'| busy(vorher)',[...st.busy].join(','),'| nowait nach Abschluss:',ps.map(q=>q.join('-')).join(' '));}}
      }
      A.S=JSON.parse(JSON.stringify({}));
      // Zustand wiederherstellen
      A.S=JSON.parse(snap);A.S.games=L.map(q=>q);// placeholder
      checked++;if(bad){viol++;if(ex++<3)console.log('VERSTOSS',{n,R,c,draw,lv,pair:[m.a,m.b]})}
    }
    // wiederherstellen: wir arbeiten mit L weiter -> S neu aufbauen
    A.S=JSON.parse(snap);A.S.games=L;A.S.wait=true;
    if(L.length===before&&!L.some(q=>!q.fin&&!A.done(q)))break;
  }
}
console.log({angesetzt:assigned,mitLaufendenInGruppe:withPend,geprueft:checked,verstoesse:viol});
