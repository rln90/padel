const load=require('./harness2.js');const A=load(process.argv[2]||require('./paths').HTML);
const rnd=n=>Math.floor(Math.random()*n);const T=+process.argv[3]||800;
function sc(){const k=rnd(10);if(k<3)return[6,rnd(2)?0:5];if(k<5)return[rnd(2)?0:5,6];const a=rnd(7);return[a,a]}
let tot=0,viol=0,checks=0,ex=0;const key=(a,b)=>a<b?a+'-'+b:b+'-'+a;
for(let t=0;t<T;t++){
  const n=4+rnd(15),R=A.validR(n,3+rnd(5)),c=1+rnd(Math.floor(n/2));
  A.S={n,R,names:[...Array(n).keys()].map(i=>'P'+i),lim:true,courts:c,dur:20,brk:5,draw:true,ov:true,wait:true,games:[],rk:Array.from({length:n},Math.random)};A.justDone.clear();
  const G=A.totalGames(n,R);let guard=0;
  const add=()=>{const st=A.rollState(),b=A.S.games.length;A.rollAdd();const st2=A.rollState();
    for(let i=b;i<A.S.games.length;i++){const m=A.S.games[i];const lvl=Math.min(st.g[m.a],st.g[m.b]);if(Math.max(st.g[m.a],st.g[m.b])!==lvl)continue;
      checks++;
      // Gibt es nach dem Ansetzen zwei freie Spieler niedrigerer Stufe mit gleicher Spielzahl, die noch nicht gegeneinander gespielt haben?
      const fr=[...Array(n).keys()].filter(p=>!st2.busy.has(p)&&st2.g[p]<lvl&&st2.g[p]<R);
      let bad=false;for(const p of fr)for(const q of fr)if(p<q&&st2.g[p]===st2.g[q]&&!st2.played.has(key(p,q)))bad=true;
      if(bad){viol++;if(ex++<2)console.log('Beispiel n',n,'c',c,'Stufe',lvl+1,'frei:',fr.map(p=>p+'(g='+st2.g[p]+')').join(' '))}}};
  add();
  while(guard++<3000){const l=A.S.games.filter(m=>!m.fin&&!A.done(m));
    if(!l.length){if(A.S.games.length>=G)break;add();if(!A.S.games.some(m=>!m.fin&&!A.done(m)))break;continue}
    const m=l[rnd(l.length)];const s=sc();m.sa=s[0];m.sb=s[1];add()}
  tot++;
}
console.log({turniere:tot,geprueftAnsetzungen:checks,verstoesse:viol});
