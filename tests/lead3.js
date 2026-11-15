const load=require('./harness2.js');const A=load(require('./paths').HTML);
const rnd=n=>Math.floor(Math.random()*n);
function sc(){const k=rnd(10);if(k<3)return[6,rnd(2)?0:5];if(k<5)return[rnd(2)?0:5,6];const a=rnd(7);return[a,a]}
for(const lead of [0,1,2]){const h={};let tot=0,sum=0;
for(let t=0;t<500;t++){
  const n=4+rnd(15),R=A.validR(n,3+rnd(5)),c=1+rnd(Math.floor(n/2));
  A.S={n,R,names:[...Array(n).keys()].map(i=>'P'+i),lim:true,courts:c,dur:20,brk:5,draw:true,ov:true,wait:false,lead,games:[],rk:Array.from({length:n},Math.random)};A.justDone.clear();
  const G=A.totalGames(n,R);let guard=0;
  const chk=()=>{const g=A.rollState().g;const act=g.filter(x=>x<R);if(!act.length)return;const d=Math.max(...act)-Math.min(...act);h[Math.min(d,4)]=(h[Math.min(d,4)]||0)+1;tot++;sum+=d};
  A.rollAdd();chk();
  while(guard++<3000){const l=A.S.games.filter(m=>!m.fin&&!A.done(m));
    if(!l.length){if(A.S.games.length>=G)break;A.rollAdd();chk();if(!A.S.games.some(m=>!m.fin&&!A.done(m)))break;continue}
    const m=l[rnd(l.length)];const s=sc();m.sa=s[0];m.sb=s[1];A.rollAdd();chk()}
}
console.log('Grenze',lead||'keine','Ø Abstand',(sum/tot).toFixed(2),'Anteil Abstand 0-1:',((100*((h[0]||0)+(h[1]||0))/tot).toFixed(0))+'%','2:',(100*(h[2]||0)/tot).toFixed(0)+'%','>=3:',(100*((h[3]||0)+(h[4]||0))/tot).toFixed(0)+'%');}
