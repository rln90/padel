const load=require('./harness4.js');const A=load(require('./paths').HTML);
const rnd=n=>Math.floor(Math.random()*n);let bad=0,N=0,blocksSeen=0,pods={};
for(let t=0;t<1500;t++){
  const n=4+rnd(10),R=A.validR(n,3+rnd(4));const draw=rnd(2)===0;
  const games=[];const G=A.totalGames(n,R);
  // zufällige, vollständig gespielte Turnierdaten (nicht notwendig regelkonform, prüft nur die Wertung)
  for(let i=0;i<G;i++){let a=rnd(n),b=rnd(n);while(b===a)b=rnd(n);let sa=rnd(4),sb=rnd(4);if(!draw&&sa===sb)sb++;games.push({a,b,sa,sb,c:0,k:i,fin:i})}
  A.S={n,R,names:[...Array(n).keys()].map(i=>'P'+i),lim:true,courts:1,dur:20,brk:5,draw,ov:true,games,rk:Array(n).fill(0)};
  // unabhängige Referenz
  const P=Array(n).fill(0),W=Array(n).fill(0),GF=Array(n).fill(0),GA=Array(n).fill(0);
  games.forEach(m=>{GF[m.a]+=m.sa;GA[m.a]+=m.sb;GF[m.b]+=m.sb;GF[m.b]+=0;GA[m.b]+=m.sa;GF[m.b]+=0;if(m.sa>m.sb){P[m.a]+=3;W[m.a]++}else if(m.sa<m.sb){P[m.b]+=3;W[m.b]++}else{P[m.a]++;P[m.b]++}});
  // GF für b korrekt: oben doppelt vorsichtig neu
  GF.fill(0);GA.fill(0);games.forEach(m=>{GF[m.a]+=m.sa;GA[m.a]+=m.sb;GF[m.b]+=m.sb;GA[m.b]+=m.sa});
  const BH=Array(n).fill(0),DP=Array(n).fill(0);
  games.forEach(m=>{BH[m.a]+=P[m.b];BH[m.b]+=P[m.a];if(P[m.a]===P[m.b]){if(m.sa>m.sb)DP[m.a]+=3;else if(m.sa<m.sb)DP[m.b]+=3;else{DP[m.a]++;DP[m.b]++}}});
  A.syncSO();const so=A.S.so||[];
  const SP=Array(n).fill(0),SD=Array(n).fill(0);
  // Entscheidungsspiele zufällig füllen
  so.forEach(m=>{m.sa=rnd(4);m.sb=rnd(4);if(!draw&&m.sa===m.sb)m.sb++});
  so.forEach(m=>{SD[m.a]+=m.sa-m.sb;SD[m.b]+=m.sb-m.sa;if(m.sa>m.sb)SP[m.a]+=3;else if(m.sa<m.sb)SP[m.b]+=3;else{SP[m.a]++;SP[m.b]++}});
  blocksSeen+=so.length?1:0;
  const key=i=>[P[i],SP[i],SD[i],DP[i],GF[i]-GA[i],BH[i],W[i],GF[i]];
  const ref=[...Array(n).keys()].sort((x,y)=>{const a=key(x),b=key(y);for(let j=0;j<a.length;j++)if(a[j]!==b[j])return b[j]-a[j];return x-y});
  const got=A.ranking().map(s=>s.i);
  N++;if(ref.join()!==got.join()){bad++;if(bad<3)console.log('Abweichung',{n,ref:ref.join(),got:got.join()})}
  // Eigenschaft: Punkte nie steigend; Platz steigt nie rückwärts
  const rk=A.ranking();for(let j=1;j<rk.length;j++){if(rk[j].p>rk[j-1].p||rk[j].rk<rk[j-1].rk){bad++;console.log('Ordnungsfehler')}}
  // Entscheidungsspiele nur für Gruppen, die Platz 1-3 betreffen, 2 bis 4 Spieler
  A.soBlocks().forEach(b=>{if(b.length<2||b.length>4)bad++;if(new Set(b.map(i=>P[i])).size!==1)bad++});
}
console.log({geprueft:N,abweichungen:bad,mitEntscheidungsspielen:blocksSeen});
