/* ===== Engine: Regeln, Paarung, Wertung. Ohne Oberfläche, ohne Browser-Funktionen. =====
   Arbeitet auf dem globalen Turnierzustand S (siehe okState). Läuft im Browser und auf dem Server.
   Die Oberfläche (ui.js) liegt dahinter in derselben Datei. */
const MINN=4,MAXN=24,MINR=3,MAXR=20;
const DURS=[10,15,20,25,30,40,45,60,75,90],BRKS=[...Array(6).keys(),10,15,20];
let S=null;
/* Plausibilitätsprüfung eines Spielstands: Unsinnige Werte (z. B. Spielerzahl 1e9) würden die Seite einfrieren */
function okState(S){
  if(!S||typeof S!=="object")return false;
  if(!((S.ov?Array.isArray(S.games)&&Array.isArray(S.rk):Array.isArray(S.rounds)&&S.rounds.length)&&Array.isArray(S.names)&&S.n&&S.R))return false;
  const I=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
  return !!(I(S.n,MINN,MAXN)&&I(S.R,1,MAXR*2)&&S.names.length<=100&&(S.courts==null||I(S.courts,1,MAXN))&&(S.cn==null||(Array.isArray(S.cn)&&S.cn.length<=MAXN&&S.cn.every(x=>typeof x==="string"&&x.length<=24)))&&(S.lead==null||I(S.lead,0,2))&&(S.wu==null||I(S.wu,0,120))&&(S.t0==null||I(S.t0,0,1439))&&(S.dl==null||(typeof S.dl==="object"&&Object.keys(S.dl).length<=500&&Object.entries(S.dl).every(([k,v])=>I(+k,0,2000)&&I(v,-240,240))))&&(S.out==null||(Array.isArray(S.out)&&S.out.length<S.n&&S.out.every(x=>I(x,0,S.n-1))))&&(!S.ov||(S.games.length<=1000&&S.rk.length<=MAXN&&S.games.every(m=>m&&I(m.a,0,S.n-1)&&I(m.b,0,S.n-1))))&&(S.ov||S.rounds.length<=MAXR*2));
}
const letters=i=>String.fromCharCode(65+i%26)+(i>=26?Math.floor(i/26):"");
const key=(a,b)=>a<b?a+"-"+b:b+"-"+a;
const isOut=i=>!!(S&&S.out&&S.out.includes(i));
const done=m=>Number.isInteger(m.sa)&&Number.isInteger(m.sb)&&m.sa>=0&&m.sb>=0&&(S.draw||m.sa!==m.sb);
const eq=(x,y)=>x.p===y.p&&(x.gf-x.ga)===(y.gf-y.ga)&&x.w===y.w&&x.gf===y.gf;
const cmp0=(x,y)=>y.p-x.p||(y.gf-y.ga)-(x.gf-x.ga)||y.w-x.w||y.gf-x.gf;
const cmp=(x,y)=>cmp0(x,y)||x.i-y.i;
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const sgn=d=>d>0?"+"+d:d<0?"−"+(-d):"0";
const validR=(n,R)=>{R=Math.min(MAXR,Math.max(MINR,Math.round(R)||MINR));if(n%2&&R%2)R++;return R};
const roundOpts=n=>{const a=[];for(let r=MINR;r<=MAXR;r++)if(!(n%2&&r%2))a.push(r);return a};
const totalGames=(n,R)=>n%2?(n-1)/2*R+R/2:n/2*R;
/* Uhrzeit: Startzeit (Beginn der Platzbuchung), Aufwärmen davor, Verzögerungen ab einer Spielplanzeile */
const hhmm=t=>{t=((Math.round(t)%1440)+1440)%1440;return String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0")};
const tparse=v=>{const m=/^\s*(\d{1,2})(?:\s*[:.hH]\s*(\d{1,2})|(\d{2}))?\s*$/.exec(v||"");if(!m)return null;const h=+m[1],mi=+(m[2]||m[3]||0);return h<24&&mi<60?h*60+mi:null};
const dly=r=>{let t=0;const d=(S&&S.dl)||{};for(const k in d)if(+k<=r)t+=d[k];return t};
const fmt=t=>{const h=Math.floor(t/60),m=t%60;return h?h+" h"+(m?" "+m+" min":""):m+" min"};
/* Zeitblöcke: alle Spiele eines Blocks laufen gleichzeitig. Das Zusatzspiel einer geraden Runde braucht
   einen späteren Block als das reguläre Spiel des Spielers, der in der Vorrunde pausiert hat. */
function schedule(n,R,c){
  const m=Math.floor(n/2),bl=[];
  for(let r=0;r<R;r++){
    if(!(n%2&&r%2===1)){
      for(let i=0;i<m;i+=c)bl.push({r,items:Array.from({length:Math.min(c,m-i)},(_,k)=>({t:"m",j:i+k}))});
    }else{
      const w=Math.ceil((m+1)/c);
      for(let b=0;b<w;b++){
        const cnt=b<w-1?c:m-c*(w-1),items=Array.from({length:cnt},(_,k)=>({t:"m",j:b*c+k}));
        if(b===w-1)items.push({t:"x"});
        bl.push({r,items});
      }
    }
  }
  return bl;
}
const split=T=>{const a=Array(Math.floor(T/120)).fill(120),r=T%120;if(r===30){a.pop();a.push(90,60)}else if(r)a.push(r);return a};
const groups=need=>{const g=[];need.forEach((T,i)=>{const l=g[g.length-1];if(l&&l.T===T)l.to=i+1;else g.push({T,from:i+1,to:i+1})});return g};
/* Platznamen: frei wählbar, sonst „Platz 1“ … */
let cnFn=()=>null; /* vor dem Start liefert die Oberfläche die eingegebenen Platznamen */
const cname=k=>{const x=S?S.cn:cnFn();return x&&x[k]?x[k]:"Platz "+(k+1)};
const courtLbl=g=>g.from===g.to?"Platz "+g.from:"Platz "+g.from+" bis "+g.to;
const allM=()=>S.games?S.games:S.rounds.flatMap(rd=>rd.m.concat(rd.x?[rd.x]:[]));
function stats(){
  const st=S.names.map((nm,i)=>({i,nm,p:0,w:0,d:0,l:0,gf:0,ga:0,g:0,b:0}));
  if(S.rounds)for(const rd of S.rounds)if(rd.bye!=null)st[rd.bye].b++;
  for(const m of allM()){
    if(!done(m))continue;
    const A=st[m.a],B=m.h?{gf:0,ga:0,g:0,p:0,w:0,l:0,d:0}:st[m.b];   /* Zusatzspiel am Ende (m.h): zählt nur für Spieler a */
    A.gf+=m.sa;A.ga+=m.sb;B.gf+=m.sb;B.ga+=m.sa;A.g++;B.g++;
    if(m.sa>m.sb){A.p+=3;A.w++;B.l++}else if(m.sa<m.sb){B.p+=3;B.w++;A.l++}else{A.p++;B.p++;A.d++;B.d++}
  }
  return st;
}
/* Endwertung: Punkte, Entscheidungsspiele (falls nötig), Direktvergleich, Game-Differenz, Buchholz, Siege, erzielte Games.
   Gepaart wird davon unabhängig nach Punkten, Game-Differenz, Siegen und erzielten Games. */
const isOver=()=>{const a=allM();return S.games?rollLeft()===0&&helpLeft()===0&&a.every(done):S.rounds.length>=S.R&&a.every(done)&&!extraRound()};
/* Runde für Runde: Fehlt nach der letzten Runde einem Spieler ein Spiel (z. B. weil sein Gegner ausgeschieden ist), folgt eine Runde mit Zusatzspielen.
   Zwei Spieler mit fehlenden Spielen spielen gegeneinander. Sonst spielt der Spieler gegen einen tabellenähnlichen Gegner, der schon genug Spiele hat; das Spiel zählt nur für den fehlenden Spieler. */
function extraRound(){
  if(!S||S.games||S.rounds.length<S.R)return null;
  const cnt=Array(S.n).fill(0),played=new Set();
  allM().forEach(m=>{cnt[m.a]++;if(!m.h){cnt[m.b]++;played.add(key(m.a,m.b))}});
  const act=[...Array(S.n).keys()].filter(i=>!isOut(i)),need=act.filter(i=>cnt[i]<S.R).sort((x,y)=>cnt[x]-cnt[y]||x-y);
  if(!need.length)return null;
  const ss=stats(),used=new Set(),m=[];
  for(const a of need){
    if(used.has(a))continue;
    const b=need.find(x=>x!==a&&!used.has(x)&&!played.has(key(a,x)));
    if(b!=null){m.push({a,b,sa:null,sb:null,eq:1});used.add(a);used.add(b);continue}
    const sc=i=>[played.has(key(a,i))?1:0,Math.abs(ss[i].p-ss[a].p),Math.abs((ss[i].gf-ss[i].ga)-(ss[a].gf-ss[a].ga)),i];
    const c=act.filter(i=>i!==a&&!used.has(i)&&cnt[i]>=S.R).sort((x,y)=>{const u=sc(x),v=sc(y);for(let j=0;j<u.length;j++)if(u[j]!==v[j])return u[j]-v[j];return 0});
    if(c.length){m.push({a,b:c[0],sa:null,sb:null,h:1,eq:1});used.add(a);used.add(c[0])}
  }
  return m.length?{m,bye:null,fin:1}:null;
}
function ranking(){
  const st=stats();
  st.forEach(s=>{s.bh=0;s.dp=0;s.sp=0;s.sd=0;s.out=isOut(s.i)});
  allM().filter(done).forEach(m=>{const A=st[m.a],B=st[m.b];A.bh+=B.p;if(m.h)return;B.bh+=A.p;
    if(A.p===B.p){if(m.sa>m.sb)A.dp+=3;else if(m.sa<m.sb)B.dp+=3;else{A.dp++;B.dp++}}});
  (S.so||[]).filter(done).forEach(m=>{const A=st[m.a],B=st[m.b];A.sd+=m.sa-m.sb;B.sd+=m.sb-m.sa;
    if(m.sa>m.sb)A.sp+=3;else if(m.sa<m.sb)B.sp+=3;else{A.sp++;B.sp++}});
  const k=s=>[s.out?0:1,s.p,s.sp,s.sd,s.dp,s.gf-s.ga,s.bh,s.w,s.gf];
  const c=(x,y)=>{const a=k(x),b=k(y);for(let j=0;j<a.length;j++)if(a[j]!==b[j])return b[j]-a[j];return 0};
  st.sort((x,y)=>c(x,y)||x.i-y.i);
  let rk=0;st.forEach((s,j)=>{if(!j||c(s,st[j-1]))rk=j+1;s.rk=s.out?"–":rk});
  return st;
}
/* Punktgleiche Gruppen (2 bis 4 Spieler), die um die Plätze 1 bis 3 spielen. Größere Gruppen entscheiden Direktvergleich und Buchholz. */
function soBlocks(){
  if(!S||!isOver())return[];
  const st=stats().filter(s=>!isOut(s.i)).sort((x,y)=>y.p-x.p||x.i-y.i),out=[];
  for(let k=0;k<st.length&&k<3;){let e=k;while(e+1<st.length&&st[e+1].p===st[k].p)e++;
    if(e>k&&e-k<4)out.push(st.slice(k,e+1).map(s=>s.i));k=e+1}
  return out;
}
function syncSOcore(){
  const need=[];soBlocks().forEach(b=>{for(let i=0;i<b.length;i++)for(let j=i+1;j<b.length;j++)need.push([b[i],b[j]])});
  const old=S.so||[],nw=need.map(([a,b])=>old.find(m=>(m.a===a&&m.b===b)||(m.a===b&&m.b===a))||{a,b,sa:null,sb:null});
  if(JSON.stringify(nw)!==JSON.stringify(old)){S.so=nw;return true}
  return false;
}
function doDrop(i){
  S.out=(S.out||[]).concat(i);
  if(S.games)S.games=S.games.filter(m=>done(m)||(m.a!==i&&m.b!==i));
  else{
    const rd=S.rounds[S.rounds.length-1],lost=[];
    const keep=m=>{if(done(m)||(m.a!==i&&m.b!==i))return true;lost.push(m.a===i?m.b:m.a);return false};
    rd.m=rd.m.filter(keep);if(rd.x&&!keep(rd.x))delete rd.x;
    if(rd.bye===i)rd.bye=null;
    /* Gegner des Ausgeschiedenen: Pausiert jemand (und spielt nicht schon das Zusatzspiel), spielen beide ein Ausgleichsspiel, damit beiden kein Spiel fehlt */
    lost.forEach(o=>{
      const b=rd.bye;
      if(b!=null&&!isOut(b)&&!(rd.x&&(rd.x.a===b||rd.x.b===b))){rd.m.push({a:b,b:o,sa:null,sb:null,eq:1});rd.bye=null}
      else if(rd.bye==null)rd.bye=o;else(rd.free=rd.free||[]).push(o);
    });
  }
}
let nodes=0;
function pair(l,pl){
  if(!l.length)return[];
  if(++nodes>150000)return null;
  const a=l[0],r=l.slice(1);
  for(let k=0;k<r.length;k++){
    const b=r[k];
    if(pl&&pl.has(key(a,b)))continue;
    const p=pair(r.filter((_,j)=>j!==k),pl);
    if(p)return[[a,b],...p];
  }
  return null;
}
function makeRound(first){
  const st=stats();
  const act=[...Array(S.n).keys()].filter(i=>!isOut(i));
  const order=first?shuffle(act):st.slice().sort(cmp).map(s=>s.i).filter(i=>!isOut(i));
  const played=new Set();
  S.rounds.forEach(rd=>rd.m.concat(rd.x?[rd.x]:[]).forEach(m=>played.add(key(m.a,m.b))));
  const second=S.rounds.length%2===1;
  const pv=S.rounds.length?S.rounds[S.rounds.length-1].bye:null;
  let cands=[null];
  const rnd=st.map(()=>Math.random());
  if(act.length%2)cands=act.slice().sort((x,y)=>st[x].b-st[y].b||(eq(st[x],st[y])?rnd[x]-rnd[y]:order.indexOf(y)-order.indexOf(x))).filter(i=>!(second&&i===pv));
  for(const [relaxed,noRe] of [[false,true],[false,false],[true,false]]){
    for(const c of cands){
      if(noRe&&second&&c!=null&&played.has(key(pv,c)))continue;
      nodes=0;
      const p=pair(order.filter(i=>i!==c),relaxed?null:played);
      if(p){const rd={m:p.map(([a,b])=>({a,b,sa:null,sb:null})),bye:c};if(second&&c!=null&&pv!=null&&!isOut(pv))rd.x={a:pv,b:c,sa:null,sb:null};return rd}
    }
  }
  return null;
}
/* Überlappende Runden: Spiele werden einzeln angesetzt, sobald ein Platz und passende Spieler frei sind.
   g zählt auch laufende Spiele. Jede Runde bleibt sauber: gepaart werden bevorzugt Spieler mit gleich vielen Spielen,
   nach Tabelle. Bei ungerader Spielerzahl darf der Übrige eine Stufe höher spielen (er hat dann in der Vorrunde pausiert).
   Sonst wartet ein Platz lieber, statt ein Rematch oder eine ungleiche Paarung anzusetzen, solange noch Spiele laufen. */
function rollState(){
  const g=Array(S.n).fill(0),busy=new Set(),played=new Set(),hp=new Set(),courts=new Set();let open=0;
  S.games.forEach(m=>{g[m.a]++;if(!m.h){g[m.b]++;played.add(key(m.a,m.b))}else hp.add(key(m.a,m.b));if(!m.fin&&!done(m)){busy.add(m.a);busy.add(m.b);courts.add(m.c);open++}});
  (S.out||[]).forEach(i=>{g[i]=S.R}); /* Ausgeschiedene gelten als fertig: sie werden nicht mehr angesetzt und brauchen keine Spiele mehr */
  return{g,busy,played,hp,courts,open};
}
/* Noch anzusetzende Spiele: Jeder verbleibende Spieler braucht R Spiele, ein Spiel deckt zwei ab (bei ungerader Summe bleibt einer ein Spiel kürzer) */
function needSum(){
  const st=rollState();let t=0,mx=0;
  for(let i=0;i<S.n;i++)if(!isOut(i)){const d=Math.max(0,S.R-st.g[i]);t+=d;if(d>mx)mx=d}
  return[t,mx];
}
function rollLeft(){
  const[t,mx]=needSum();
  return Math.min(Math.floor(t/2),t-mx); /* ein Spieler, der mehr braucht als alle anderen zusammen, bleibt kürzer */
}
/* Zusatzspiele am Ende: Was nach allen regulären Spielen noch an Spielen fehlt, holt der betroffene Spieler gegen einen Gegner nach,
   der schon genug Spiele hat. Das Ergebnis zählt nur für den fehlenden Spieler. */
function helpLeft(){
  if(!S||!S.games)return 0;
  const[t]=needSum();
  return t-2*rollLeft();
}
function helpPick(st){
  if(helpLeft()<=0||st.open>0)return[];
  const act=[...Array(S.n).keys()].filter(i=>!isOut(i)),need=act.filter(i=>st.g[i]<S.R).sort((x,y)=>st.g[x]-st.g[y]||x-y);
  if(!need.length)return[];
  const a=need[0],ss=stats(),sa=ss[a],pos=new Map(rollOrder().map((p,i)=>[p,i]));
  const cand=act.filter(i=>i!==a&&st.g[i]>=S.R&&!st.busy.has(i));
  if(!cand.length)return[];
  const sc=i=>[st.played.has(key(a,i))||st.hp.has(key(a,i))?1:0,Math.abs(ss[i].p-sa.p),Math.abs((ss[i].gf-ss[i].ga)-(sa.gf-sa.ga)),pos.get(i)];
  cand.sort((x,y)=>{const u=sc(x),v=sc(y);for(let j=0;j<u.length;j++)if(u[j]!==v[j])return u[j]-v[j];return 0});
  return[[a,cand[0],1]];
}
function rollOrder(){
  const rk=S.rk;
  return stats().sort((x,y)=>cmp0(x,y)||rk[x.i]-rk[y.i]).map(s=>s.i);
}
function pairBT(l,pl){
  if(!l.length)return[];
  if(++nodes>20000)return[];
  const a=l[0],r=l.slice(1);
  for(let k=0;k<r.length;k++){
    const b=r[k];
    if(pl.has(key(a,b)))continue;
    const p=pairBT(r.filter((_,j)=>j!==k),pl);
    if(p)return[[a,b],...p];
  }
  return null;
}
/* Lässt sich der Rest des Turniers noch ohne Wiederholungsspiele spielen? d[i] = noch offene Spiele von Spieler i, pl = schon gespielte Paarungen.
   Gesucht ist ein Graph ohne gespielte Kanten, in dem jeder Spieler genau d[i] Gegner hat. Gibt es nach 3000 Schritten kein Urteil, gilt „ja“. */
let feasWork=0,simFast=false;
 /* simFast: nur für die Zeitschätzung in der Einrichtung, rechnet ohne die aufwendigen Prüfungen */
function feasible(d,pl){
  const n=d.length,rem=d.map(x=>Math.max(0,x));let cnt=0;
  let slack=rem.reduce((a,b)=>a+b,0)%2; /* ungerade Summe (nach Ausscheiden): ein Spieler darf ein Spiel kürzer bleiben */
  const rec=()=>{
    if(++cnt>1500){feasWork+=cnt;return true}
    let v=-1;for(let i=0;i<n;i++)if(rem[i]>0&&(v<0||rem[i]>rem[v]))v=i;
    if(v<0)return true;
    const c=[];for(let u=0;u<n;u++)if(u!==v&&rem[u]>0&&!pl.has(key(v,u)))c.push(u);
    const k=rem[v];
    if(c.length<k-slack)return false;
    c.sort((x,y)=>rem[y]-rem[x]);
    const pick=(start,left)=>{
      if(left===0){rem[v]=0;const ok=rec();rem[v]=k;return ok}
      for(let i=start;i<=c.length-left;i++){const u=c[i];rem[u]--;const ok=pick(i+1,left-1);rem[u]++;if(ok||cnt>1500)return true}
      return false;
    };
    if(c.length>=k&&pick(0,k))return true;
    if(slack>0&&c.length>=k-1){slack--;const ok=pick(0,k-1);slack++;return ok}
    return false;
  };
  const r=rec();feasWork+=cnt;return r;
}
const refMemo=new Map();
/* Notlösung: Findet die Prüfung keine vollständig aufgehende Ansetzung mehr (z. B. nach Ausscheiden und Vorsprung-Grenze), spielen die Spieler mit den meisten fehlenden Spielen gegeneinander, damit das Turnier nicht hängt. */
function rescuePick(st,free){
  const pool=[...Array(S.n).keys()].filter(i=>!isOut(i)&&!st.busy.has(i)&&st.g[i]<S.R).sort((x,y)=>st.g[x]-st.g[y]||x-y),out=[],used=new Set(),cap=Math.min(free,rollLeft());
  for(const a of pool){
    if(used.has(a)||out.length>=cap)continue;
    let b=pool.find(x=>x!==a&&!used.has(x)&&!st.played.has(key(a,x)));
    if(b==null)b=pool.find(x=>x!==a&&!used.has(x));
    if(b!=null){out.push([a,b]);used.add(a);used.add(b)}
  }
  return out;
}
function rollPick(st,free){
  if(S.games&&rollLeft()===0)return helpPick(st);
  const ps=rollPick0(st,free);
  return ps.length||st.open>0?ps:rescuePick(st,free);
}
function rollPick0(st,free){
  const g=st.g.slice(),n=S.n,R=S.R,order=rollOrder(),pos=new Map(order.map((p,i)=>[p,i]));
  const pool=order.filter(i=>!st.busy.has(i)&&g[i]<R).sort((x,y)=>g[x]-g[y]||pos.get(x)-pos.get(y));
  const lvl=L=>g.filter(x=>x===L).length;
  /* Warten auf feste Platzierung: Ein Paar wird nur angesetzt, wenn sich seine Platzierung in der Gruppe (gleich viele Spiele)
     durch noch laufende Spiele nicht mehr ändern kann. Laufende Spieler können 0 oder 3 Punkte (bzw. 1 bei Remis) dazugewinnen. */
  const wait=!!S.wait,sts=wait?stats():null;
  const pend=L=>wait&&[...st.busy].some(i=>g[i]===L);
  const settled=(a,x)=>{
    if(!wait||!pend(g[a]))return true;
    const grp=[];for(let i=0;i<n;i++)if(g[i]===g[a])grp.push(i);
    const upP=[],dnP=[];let aboveA=0,aboveB=0;
    for(const p of grp){
      if(p===a||p===x)continue;
      if(!st.busy.has(p)){const before=q=>pos.get(p)<pos.get(q);if(before(a))aboveA++;if(before(x))aboveB++;continue}
      const side=q=>sts[p].p>sts[q].p?1:sts[p].p+3<sts[q].p?-1:0;
      const sa=side(a),sb=side(x);
      if(!sa||sa!==sb)return false;
      if(sa===1){aboveA++;aboveB++;upP.push(p)}else dnP.push(p);
    }
    const pa=aboveA+(pos.get(a)<pos.get(x)?0:1)+1,pb=aboveB+(pos.get(x)<pos.get(a)?0:1)+1;
    if(Math.abs(pa-pb)!==1||Math.min(pa,pb)%2!==1)return false;
    /* Genaue Prüfung: Für jeden möglichen Ausgang der laufenden Spiele der Gruppe (und jede mögliche Reihenfolge bei Punktgleichstand)
       wird die Paarung so gebildet, wie sie ohne Warten gebildet würde. Das Paar muss in allen Fällen vorkommen. */
    if(simFast)return true;
    const refs=refSets(st.g[a]);
    return !!refs&&refs.every(r=>r.has(key(a,x)));
  };
  /* Alle Paarungen, die für die Gruppe mit st.g===L entstehen können, wenn die laufenden Spiele beendet sind (null: zu viele Fälle) */
  const refCache=new Map();
  const refSets=L=>{
    if(refCache.has(L))return refCache.get(L);
    /* Gleicher Spielstand (nur beendete Ergebnisse zählen) ergibt gleiche Mengen: merken, damit Tippen im Ergebnisfeld nicht neu rechnet */
    const sig=S.rk.join(",")+"|"+(S.out||[]).join(".")+"|"+S.draw+"|"+L+"|"+S.games.map(m=>m.a+","+m.b+","+(done(m)?m.sa+":"+m.sb:"o")+(m.fin?"f":"")).join(";");
    let res=refMemo.get(sig);
    if(res===undefined){
      try{res=buildRefs(L)}catch(e){res=null}
      if(refMemo.size>40)refMemo.clear();
      refMemo.set(sig,res);
    }
    refCache.set(L,res);return res;
  };
  const canFinish=rem=>{
    nodes=0;
    if(rem.length%2===0)return pairBT(rem,st.played)!==null;
    return rem.some((_,k)=>{nodes=0;return pairBT(rem.filter((_,j)=>j!==k),st.played)!==null});
  };
  const matchOf=order=>{
    const used=new Set(),out=new Set();
    /* ohne bereits gespielte Paare in der Gruppe: der Reihe nach 1–2, 3–4 …, bei ungerader Zahl bleibt der Letzte übrig */
    if(!order.some((u,i)=>order.some((v,j)=>j>i&&st.played.has(key(u,v))))){
      for(let i=0;i+1<order.length;i+=2)out.add(key(order[i],order[i+1]));
      return out;
    }
    for(const a of order){
      if(used.has(a))continue;
      for(const x of order){
        if(x===a||used.has(x)||st.played.has(key(a,x)))continue;
        if(canFinish(order.filter(y=>y!==a&&y!==x&&!used.has(y)))){used.add(a);used.add(x);out.add(key(a,x));break}
      }
    }
    return out;
  };
  const buildRefs=L=>{
    const grp=[];for(let i=0;i<n;i++)if(st.g[i]===L&&st.g[i]<R)grp.push(i);
    const fixed=grp.filter(i=>!st.busy.has(i)).sort((u,v)=>pos.get(u)-pos.get(v)),pend=grp.filter(i=>st.busy.has(i));
    const runs=S.games.filter(m=>!m.fin&&!done(m)&&(pend.includes(m.a)||pend.includes(m.b)));
    const opts=S.draw?3:2;
    if(Math.pow(opts,runs.length)>2200)return null;
    /* Ungerade Spielerzahl: Ein einzelner Spieler einer niedrigeren Stufe (Pausierender) spielt gegen den Bestplatzierten der Gruppe,
       sobald deren laufende Spiele beendet sind. Das verschiebt die Paarung der übrigen. */
    const low=[];for(let i=0;i<n;i++)if(st.g[i]===L-1&&st.g[i]<R)low.push(i);
    let vis=null;
    if(low.length%2===1){if(low.length>1||st.busy.has(low[0]))return null;vis=low[0]}
    const shift=list=>{
      if(vis==null)return list;
      const k=list.findIndex(y=>!st.played.has(key(vis,y)));
      return k<0?null:[...list.slice(0,k),...list.slice(k+1)];
    };
    const refs=[],mm=new Map();let budget=6000;
    for(let c3=0,tot=Math.pow(opts,runs.length);c3<tot;c3++){
      const pts=new Map(grp.map(i=>[i,sts[i].p]));let x=c3;
      runs.forEach(m=>{const o=x%opts;x=Math.floor(x/opts);
        const add=(i,d)=>{if(pts.has(i)&&pend.includes(i))pts.set(i,pts.get(i)+d)};
        if(o===0){add(m.a,3)}else if(o===1){add(m.b,3)}else{add(m.a,1);add(m.b,1)}});
      /* laufende Spieler an jeder möglichen Stelle innerhalb ihrer Punktgruppe einsortieren */
      const rec=(k,list)=>{
        if(budget<=0)return false;
        if(k===pend.length){budget--;const l2=shift(list);if(!l2)return false;const mk=l2.join();let ms=mm.get(mk);if(!ms){ms=matchOf(l2);mm.set(mk,ms)}refs.push(ms);return true}
        const p=pend[k],P=pts.get(p);
        let lo=0;while(lo<list.length&&pts.get(list[lo])>P)lo++;
        let hi=lo;while(hi<list.length&&pts.get(list[hi])===P)hi++;
        for(let at=lo;at<=hi;at++)if(!rec(k+1,[...list.slice(0,at),p,...list.slice(at)]))return false;
        return true;
      };
      if(!rec(0,fixed))return null;
    }
    return refs;
  };
  const fits=(a,b)=>{let tot=0,mx=0;for(let i=0;i<n;i++){const d=R-g[i]-(i===a||i===b?1:0);tot+=d;if(d>mx)mx=d}return 2*mx<=tot+(tot&1)};
  /* Stufen: 0 gleiche Spielzahl ohne Rematch, 1 gleiche Spielzahl mit Rematch, 2 beliebig ohne Rematch, 3 alles. Bei „Abwarten“ kommt Stufe 2 vor 1.
     Stufen ab 1 nur, wenn kein Spiel mehr läuft und sonst nichts mehr passieren würde. */
  /* Vorausschau: Die ganze Gruppe mit gleicher Spielzahl (auch Spieler, die noch spielen) muss sich ohne Rematch paaren lassen */
  /* Vorausschau auf das ganze Turnier: Ein Paar wird (ohne Wiederholung) nur angesetzt, wenn die übrigen Spiele danach noch ohne
     Wiederholung möglich sind. Gilt nur, wenn das jetzt überhaupt noch möglich ist (bei mehr Runden als Gegnern nicht). */
  feasWork=0;
  const guardOn=!simFast&&feasible(g.map(x=>R-x),st.played);
  let pl=null;const feasMemo=new Map();
  const gok=(a,x,tier)=>{
    if(!guardOn||tier===1||tier===3||feasWork>60000)return true;
    const k=key(a,x),d=g.map((v,i)=>R-v-(i===a||i===x?1:0));
    const ck=d.join()+"|"+k+"|"+[...pl].filter(q=>!st.played.has(q)).sort().join();
    let r=feasMemo.get(ck);
    if(r===undefined){pl.add(k);r=feasible(d,pl);pl.delete(k);      /* gespeichert wird nur, wenn die Rechnung nicht abgebrochen wurde */
      if(feasWork<=60000)feasMemo.set(ck,r)}
    return r;
  };
  let used=new Set();
  const rest=(a,x)=>{
    const grp=[];for(let i=0;i<n;i++)if(g[i]===g[a]&&i!==a&&i!==x&&!used.has(i))grp.push(i);
    const can=l=>{nodes=0;return pairBT(l,st.played)!==null||nodes>20000};
    return grp.length%2?grp.some((_,k)=>can(grp.filter((_,j)=>j!==k))):can(grp);
  };
  /* Vorsprung-Grenze (nur „Sofort weiter“): Kein Spieler soll nach dem Ansetzen mehr als S.lead Spiele mehr haben als der Spieler mit den wenigsten.
     Läuft nichts mehr und nichts ginge, wird die Grenze aufgehoben, bevor ein Wiederholungsspiel angesetzt wird. */
  const leadOn=!!S.lead&&!S.wait;
  const go=(tier,nolead,extra=0)=>{
    const lead=leadOn&&!nolead,LD=(S.lead||0)+extra,minG=()=>{let m=1e9;for(let i=0;i<n;i++)if(g[i]<R&&g[i]<m)m=g[i];return m};
    used=new Set();pl=new Set(st.played);const out=[],tmp=g.slice();
    /* Reihenfolge der Runden: Wartet in einer Stufe ein Paar nur auf die feste Platzierung, wird in höheren Stufen (späteren Runden)
       nichts angesetzt. Niemand spielt eine spätere Runde, solange Spieler einer früheren Runde schon bereitstehen. */
    let blockLv=-1;
    for(const a of pool){
      if(out.length>=free)break;
      if(used.has(a))continue;
      if(blockLv>=0&&g[a]>blockLv)continue;
      const mg=lead?minG():0;
      if(lead&&g[a]+1-mg>LD)continue;
      const ok=x=>x!==a&&!used.has(x)&&(tier===1||tier===3||!st.played.has(key(a,x)))&&(!lead||g[x]+1-mg<=LD)&&fits(a,x);
      let b=tier===0?pool.find(x=>ok(x)&&g[x]===g[a]&&rest(a,x)&&settled(a,x)&&gok(a,x,tier)):null;
      if(b==null)b=pool.find(x=>ok(x)&&(tier>=2||g[x]===g[a])&&settled(a,x)&&gok(a,x,tier));
      if(b==null&&tier<=1&&lvl(g[a])%2===1&&!pend(g[a])&&!pend(g[a]+1))b=pool.find(x=>ok(x)&&g[x]===g[a]+1&&gok(a,x,tier));
      if(b==null){
        if(tier===0&&blockLv<0&&pool.some(x=>ok(x)&&g[x]===g[a]))blockLv=g[a];
        continue;
      }
      used.add(a);used.add(b);out.push([a,b]);g[a]++;g[b]++;pl.add(key(a,b));
    }
    for(let i=0;i<n;i++)g[i]=tmp[i];
    return out;
  };
  let p=go(0);
  for(let e=1;e<=R&&!p.length&&leadOn&&!st.open;e++)p=go(0,false,e);
  for(const t of (S.wait?[2,1,3]:[1,2,3])){if(p.length||st.open)break;p=go(t,true)} /* Abwarten, nichts läuft mehr: lieber ein Gegner aus einer anderen Runde ohne Wiederholung (2) als dieselben Spieler nochmal (1, 3) */
  return p;
}
function rollAdd(){
  const st=rollState(),free=[...Array(S.courts).keys()].filter(k=>!st.courts.has(k));
  if(!free.length)return 0;
  const ps=rollPick(st,free.length),k=S.games.reduce((x,m)=>Math.max(x,m.k),-1)+1;
  if(ps.length)S.games.forEach(m=>{if(done(m)&&!m.fin)m.fin=k}); /* Beendete Spiele sind ab jetzt abgeschlossen: ihre Spieler und Plätze sind wieder vergeben */
  ps.forEach(([a,b,h],i)=>S.games.push(h?{a,b,sa:null,sb:null,c:free[i],k,h:1}:{a,b,sa:null,sb:null,c:free[i],k}));
  return ps.length;
}
/* Platz und Zeitzeile je Spiel einer Runde (Runde für Runde): gleiche Aufteilung wie im Spielplan */
function classicSlots(ri){
  const mp=new Map(),rd=S.rounds[ri];if(!rd||!S.courts)return mp;
  const mx=Math.floor(S.n/2),c=Math.min(mx,S.courts||mx),o=ordM(ri);
  schedule(S.n,S.R,c).forEach((b,i)=>{if(b.r!==ri)return;b.items.forEach((it,k)=>{const m=it.t==="x"?rd.x:o[it.j];if(m)mp.set(m,{k,i})})});
  return mp;
}
function nextOf(p){
  if(S.ov){
    const i=S.games.findIndex(m=>!done(m)&&(m.a===p||m.b===p));
    if(i>=0){const m=S.games[i];return{o:m.a===p?m.b:m.a,k:m.c,i:S.games.slice(0,i).filter(x=>x.c===m.c).length}}
    return null;
  }
  const ri=S.rounds.length-1,rd=S.rounds[ri],SL=classicSlots(ri);
  for(const m of rd.m.concat(rd.x?[rd.x]:[]))if(!done(m)&&(m.a===p||m.b===p)){const q=SL.get(m);return q?{o:m.a===p?m.b:m.a,k:q.k,i:q.i}:{o:m.a===p?m.b:m.a,k:null,i:0}}
  return null;
}
/* Runden im überlappenden Modus: Die Runde eines Spiels ist das wievielte Spiel die Beteiligten bestreiten (das höhere zählt).
   Hat einer der beiden in dieser Runde schon gespielt, ist es das Zusatzspiel dieser Runde. */
function rollInfo(games,n){
  const g=Array(n).fill(0),has={},cnt={};
  const gone=!!(S&&S.games&&(S.out||[]).length);   /* nach einem Ausscheiden: Spiele zwischen Spielern mit unterschiedlichem Stand gleichen aus */
  return games.map(m=>{
    if(m.h){const r=g[m.a]+1;g[m.a]++;return{r,x:true,eq:false,hlp:true,j:0}}
    const eq=gone&&g[m.a]!==g[m.b];
    const r=Math.max(g[m.a],g[m.b])+1;g[m.a]++;g[m.b]++;
    const hs=has[r]||(has[r]=new Set()),x=hs.has(m.a)||hs.has(m.b)||eq;hs.add(m.a);hs.add(m.b);
    return{r,x,eq:gone&&x,j:x?0:(cnt[r]=(cnt[r]||0)+1)};
  });
}
const rollTag=f=>f.x?`Runde ${f.r}, ${f.eq?"Ausgleichsspiel":"Zusatzspiel"}`:`Runde ${f.r}, Spiel ${f.j}`;
const actN=n=>n-((S&&S.out)||[]).length;
/* Pause je Runde bei ungerader Spielerzahl: bekannt, sobald alle regulären Spiele der Runde angesetzt sind */
function rollPauses(games,info,n){
  const out={},by={};n=actN(n);if(!(n%2))return out;
  games.forEach((m,i)=>{if(!info[i].x)(by[info[i].r]||(by[info[i].r]=[])).push(m.a,m.b)});
  for(const r in by)if(by[r].length===n-1){const t=new Set(by[r]);out[r]=[...Array(S?S.n:n).keys()].filter(i=>!t.has(i)&&!isOut(i))}
  return out;
}
/* noch nicht angesetzte Spiele mit voraussichtlicher Runde */
function rollGhosts(n,R,info){
  const na=actN(n),m=Math.floor(na/2),reg={},ex={},out=[];
  info.forEach(f=>{if(f.x)ex[f.r]=1;else reg[f.r]=(reg[f.r]||0)+1});
  for(let r=1;r<=R;r++){
    for(let k=(reg[r]||0)+1;k<=m;k++)out.push({r,j:k,x:false});
    if(na%2&&na===n&&r%2===0&&!ex[r])out.push({r,j:0,x:true});
  }
  return out;
}
/* Zurück in Blöcken: verwirft den jüngsten Block (alle Spiele, die mit einem Klick angesetzt wurden). Der Block davor ist wieder korrigierbar. */
const lastBlock=()=>S.games.reduce((x,m)=>Math.max(x,m.k),-1);
function ordM(r){const o=S.rounds[r].m.slice(),x=S.rounds[r].x;if(x){const k=o.findIndex(m=>m.a===x.a||m.b===x.a);if(k>0)o.unshift(o.splice(k,1)[0])}return o}

/* ===== Aktionen: Alle Änderungen am Turnier laufen hierüber (Browser und Server) ===== */
const cleanName=x=>(x||"").trim().slice(0,24);
/* Neues Turnier anlegen. cfg: n, R, names (voll), lim, courts, dur, brk, draw, cn (Platznamen), wu, t0 (Minuten oder null), ov ("no", "yes", "wait"), lead */
function createTournament(cfg){
  const n=Math.min(MAXN,Math.max(MINN,+cfg.n||MINN)),R=validR(n,+cfg.R);
  S={n,R,names:cfg.names,lim:!!cfg.lim,courts:Math.min(Math.floor(n/2),+cfg.courts||1),dur:+cfg.dur,brk:+cfg.brk,draw:!!cfg.draw};
  const cn=(cfg.cn||[]).map(cleanName).slice(0,S.courts);if(cn.some(Boolean))S.cn=cn;
  S.wu=+cfg.wu||0;if(cfg.t0!=null)S.t0=cfg.t0;
  if(cfg.ov&&cfg.ov!=="no"){S.ov=true;if(cfg.ov==="yes")S.lead=+cfg.lead||0;S.wait=cfg.ov==="wait";S.games=[];S.rk=Array.from({length:n},Math.random);rollAdd()}
  else{S.rounds=[];S.rounds.push(makeRound(true))}
  return S;
}
const scoreVal=v=>v===""?null:Math.min(99,Math.max(0,parseInt(v,10)));
/* Ergebnis eintragen: Runde für Runde (ri, mi; mi<0 = Zusatzspiel), überlappend (gi), Entscheidungsspiel (i) */
function scoreClassic(ri,mi,side,v){const m=mi<0?S.rounds[ri].x:S.rounds[ri].m[mi];m["s"+side]=scoreVal(v);return m}
function scoreRoll(gi,side,v){const m=S.games[gi];m["s"+side]=scoreVal(v);return m}
function scoreSO(i,side,v){
  const m=(S.so||[])[i];if(!m)return null;
  const x=v===""?null:Math.max(0,Math.min(99,parseInt(v,10)));
  m[side==="a"?"sa":"sb"]=Number.isNaN(x)?null:x;return m;
}
/* Runde für Runde: nächste Runde (oder Zusatzspiele) ansetzen, letzte Ansetzung verwerfen */
function canAdvance(){const rd=S.rounds[S.rounds.length-1];return !rd.m.concat(rd.x?[rd.x]:[]).some(m=>!done(m))}
function advanceRound(){
  if(!canAdvance())return false;
  if(S.rounds.length>=S.R){const x=extraRound();if(!x)return false;S.rounds.push(x)}else S.rounds.push(makeRound(false));
  return true;
}
function undoClassic(){if(S.rounds.length<2)return false;S.rounds.pop();return true}
/* Überlappend: jüngsten Block verwerfen */
function undoRoll(){
  const K=lastBlock();if(K<1)return false;
  S.games=S.games.filter(m=>m.k!==K);
  S.games.forEach(m=>{if(m.fin===K)delete m.fin});
  return true;
}
/* Spiele ansetzen, soweit Plätze frei sind (überlappend). Liefert die Zahl neuer Spiele. */
const assignGames=()=>rollAdd();
/* Darf dieser Spieler jetzt ausscheiden? (mindestens MINN aktive Spieler, Turnier läuft noch) */
function canDrop(i){return !!S&&Number.isInteger(i)&&i>=0&&i<S.n&&!isOut(i)&&S.n-(S.out||[]).length>MINN&&!isOver()}
