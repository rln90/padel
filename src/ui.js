/* ===== Oberfläche: Darstellung, Eingaben, Speicherstand im Browser, Live-Ansicht. Nutzt die Engine. ===== */
document.documentElement.lang="de";
const $=s=>document.querySelector(s),KEY="padel-turnier-v2";
let resetArmed=false,undoArmed=false;
const justDone=new Set();
try{const j=localStorage.getItem(KEY);if(j)S=JSON.parse(j)}catch(e){}
if(!okState(S))S=null;
let VIEW=false;
let liveDoc=null,liveCan=false,liveRemote=null,liveTimer=null,liveMsg="",liveAt=0,liveBoot=typeof window!=="undefined"&&!!(window.claude&&typeof window.claude.use==="function");
const save=()=>{if(VIEW)return;try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}pushLive()};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function fixT0(el){const t=tparse(el.value);el.value=t==null?"":hhmm(t);syncSetup()}
const wu=()=>S?(S.wu||0):(+((document.getElementById("wu")||{}).value)||0);
const T0=()=>S?(S.t0==null?null:S.t0):tparse((document.getElementById("t0")||{}).value);
const rowMin=(r,step)=>wu()+r*step+dly(r);
const tt=(r,step)=>{const b=T0();return b==null?clk(rowMin(r,step)):hhmm(b+rowMin(r,step))};
let PCUR=0;
/* Buchung: je Platz von Turnierbeginn bis zum Ende seines letzten Spiels, auf 30 min aufgerundet, mindestens 60 min */
function plan(n,R,c,dur,brk,ov){
  if(ov){ /* Prognose bei überlappenden Runden: jedes Spiel startet, sobald ein Platz frei ist */
    const G=n*R/2,w=Math.ceil(G/c),step=dur+brk;
    const need=Array.from({length:c},(_,k)=>Math.max(60,Math.ceil(((Math.ceil((G-k)/c)-1)*step+dur+wu())/30)*30));
    return{waves:w,total:w*dur+(w-1)*brk,need,step};
  }
  const bl=schedule(n,R,c),step=dur+brk,w=bl.length,last=Array(c).fill(0);
  bl.forEach((b,i)=>{for(let k=0;k<b.items.length&&k<c;k++)last[k]=i});
  const need=last.map(i=>Math.max(60,Math.ceil((i*step+dur+wu())/30)*30));
  return{waves:w,total:w*dur+(w-1)*brk,blocks:bl,need,step};
}
function syncSO(){if(syncSOcore())save()}
let dropArmed=null;
function renderOut(){
  const el=$("#outc");if(!el||!S)return;
  const act=[...Array(S.n).keys()].filter(i=>!isOut(i)),gone=(S.out||[]).map(i=>esc(S.names[i])).join(", ");
  const note=gone?`<p class="hint">Ausgeschieden: ${gone}</p>`:"";
  if(act.length<=MINN||isOver()){el.innerHTML=note;return}
  const keepSel=$("#dropsel"),sel=keepSel?+keepSel.value:act[0];
  el.innerHTML=`<h2>Spieler scheidet aus</h2><p class="hint">Seine bisherigen Spiele zählen weiter. Offene Spiele mit ihm entfallen, die anderen spielen ohne ihn weiter und stehen mit ihm unten in der Tabelle. Fehlt dadurch einem Spieler ein Spiel, bekommt er am Ende ein Zusatzspiel gegen einen tabellenähnlichen Gegner. Es zählt nur für ihn. Das lässt sich nicht rückgängig machen. Mit 4 Spielern kann niemand mehr ausscheiden.</p>${note}<div class="actions"><select id="dropsel" aria-label="Spieler, der ausscheidet">${act.map(i=>`<option value="${i}"${i===sel?" selected":""}>${esc(S.names[i])}</option>`).join("")}</select><button class="${dropArmed!=null?"danger":"quiet"}" onclick="dropPlayer()">${dropArmed!=null?"Wirklich ausscheiden lassen?":"Ausscheiden lassen"}</button></div>`;
}
function dropPlayer(){
  const sel=$("#dropsel");if(!sel||!S)return;
  const i=+sel.value;
  if(!canDrop(i))return;
  if(dropArmed!==i){dropArmed=i;renderOut();setTimeout(()=>{if(dropArmed===i){dropArmed=null;if(S)renderOut()}},4000);return}
  dropArmed=null;doDrop(i);
  justDone.clear();undoArmed=false;save();render();
}
function soScore(i,side,v){
  if(!scoreSO(i,side,v))return;save();
  $("#champ").innerHTML=champHtml();renderTable();
}
function renderSO(){
  const el=$("#so");if(!el)return;
  const so=S.so||[];
  if(!so.length){el.innerHTML="";return}
  const row=(m,i)=>`<div class="mw rc${i%6}"><span class="tag">Entscheidungsspiel ${i+1}</span><div class="m">
      <div class="a ${done(m)&&m.sa>m.sb?"win":""}">${esc(S.names[m.a])}</div>
      <input type="number" min="0" max="99" inputmode="numeric" enterkeyhint="next" aria-label="Games ${esc(S.names[m.a])}" value="${m.sa??""}" oninput="soScore(${i},'a',this.value)">
      <div class="sep">:</div>
      <input type="number" min="0" max="99" inputmode="numeric" enterkeyhint="next" aria-label="Games ${esc(S.names[m.b])}" value="${m.sb??""}" oninput="soScore(${i},'b',this.value)">
      <div class="b ${done(m)&&m.sb>m.sa?"win":""}">${esc(S.names[m.b])}</div>
    </div></div>`;
  el.innerHTML=`<section class="panel"><div class="head"><h2>Entscheidungsspiele</h2></div><p class="hint">Bei den Plätzen 1 bis 3 sind Spieler punktgleich. Sie spielen die Reihenfolge unter sich aus. Gewertet wird wie sonst: Sieg 3 Punkte${S.draw?", Unentschieden 1 Punkt":""}. Bleibt es danach gleich, zählen Direktvergleich, Game-Differenz und Buchholz.</p><div class="matches">${so.map(row).join("")}</div></section>`;
}
function champHtml(){
  if(!isOver())return"";
  const st=ranking(),so=S.so||[];
  if(so.some(m=>!done(m)))return`<div class="champ"><strong>Entscheidungsspiele</strong><span>Die Plätze 1 bis 3 werden noch unter punktgleichen Spielern ausgespielt.</span></div>`;
  const top=st.filter(s=>s.rk===1),nm=s=>esc(s.nm);
  const pod=[2,3].map(r=>{const g=st.filter(s=>s.rk===r);return g.length?`${r}. ${g.map(nm).join(", ")}`:""}).filter(Boolean);
  const podium=pod.length?`<span>${pod.join("  ·  ")}</span>`:"";
  return top.length>1?
    `<div class="champ"><strong>Gleichstand an der Spitze</strong><span>${top.map(nm).join(", ")}</span><span>Auch nach Direktvergleich, Game-Differenz, Buchholz, Siegen und erzielten Games gleich.</span>${podium}</div>`:
    `<div class="champ"><span class="k">Turniersieger</span><strong>${nm(top[0])}</strong><span>${top[0].p} Punkte, ${top[0].w} ${top[0].w===1?"Sieg":"Siege"}</span>${podium}</div>`;
}
/* Einrichtung */
/* Namenseingabe: ein Feld je Spieler und je Platz. Leere Felder bekommen A, B, C … bzw. Platz 1, Platz 2 … */
let NM=[],CNM=[];
const clean=a=>a.map(x=>(x||"").trim().slice(0,24));
cnFn=()=>clean(CNM);
const given=()=>clean(NM);
const typed=n=>given().slice(0,n).filter(Boolean);
const fullNames=n=>{
  const g=given().slice(0,n),used=new Set(g.filter(Boolean).map(x=>x.toLowerCase()));let c=0;
  return Array.from({length:n},(_,i)=>{if(g[i])return g[i];let l;do{l=letters(c++)}while(used.has(l.toLowerCase()));used.add(l.toLowerCase());return l});
};
function nameFields(){
  const el=document.getElementById("nf");if(!el)return;
  const n=+$("#n").value||MINN,c=Math.min(Math.floor(n/2),+$("#c").value||1);
  const f=(arr,i,ph,kind,lab)=>`<input type="text" maxlength="24" autocomplete="off" data-k="${kind}" data-i="${i}" placeholder="${esc(ph)}" aria-label="${lab}" value="${esc(arr[i]||"")}">`;
  el.innerHTML=`<div class="nfg"><h3>Spieler</h3><div class="nfl">${Array.from({length:n},(_,i)=>f(NM,i,letters(i),"p","Name Spieler "+(i+1))).join("")}</div></div>
    <div class="nfg"><h3>Plätze</h3><div class="nfl">${Array.from({length:c},(_,i)=>f(CNM,i,"Platz "+(i+1),"c","Name Platz "+(i+1))).join("")}</div></div>
    <p class="hint">Leere Felder heißen A, B, C … bzw. Platz 1, Platz 2 … Eine Liste mit Komma oder Zeilenumbruch lässt sich in ein Feld einfügen und verteilt sich auf die folgenden.</p><p class="hint" id="nh" aria-live="polite"></p>`;
  nameHint();
}
document.addEventListener("input",e=>{
  const t=e.target;if(!t||!t.matches||!t.matches("#nf input"))return;
  (t.dataset.k==="p"?NM:CNM)[+t.dataset.i]=t.value;
  if(t.dataset.k==="c")renderPlan();else nameHint();
});
document.addEventListener("paste",e=>{
  const t=e.target;if(!t||!t.matches||!t.matches("#nf input"))return;
  const txt=(e.clipboardData&&e.clipboardData.getData("text"))||"";
  if(!/[,;\n\t]/.test(txt))return;
  e.preventDefault();
  const parts=txt.split(/[,;\n\t]/).map(x=>x.trim().slice(0,24)).filter(Boolean),arr=t.dataset.k==="p"?NM:CNM;
  const all=[...document.querySelectorAll('#nf input[data-k="'+t.dataset.k+'"]')];
  parts.forEach((v,j)=>{const k=+t.dataset.i+j,inp=all[k];if(inp){inp.value=v;arr[k]=v}});
  if(t.dataset.k==="c")renderPlan();else nameHint();
});
document.addEventListener("keydown",e=>{
  if(e.key!=="Enter"||!e.target.matches||!e.target.matches("#nf input"))return;
  e.preventDefault();const ins=[...document.querySelectorAll("#nf input")];const nx=ins[ins.indexOf(e.target)+1];
  if(nx)nx.focus();else{const b=document.querySelector("#app .actions button");if(b)b.focus()}
});
const dupOf=a=>{const seen=new Set();for(const x of a){const k=x.toLowerCase();if(seen.has(k))return x;seen.add(k)}return null};
function nameHint(){
  const n=+$("#n").value||MINN,g=typed(n),d=dupOf(g),el=document.getElementById("nh");if(!el)return;
  el.className="hint"+(d?" err":"");
  el.textContent=d?"„"+d+"“ kommt doppelt vor. Bitte eindeutige Namen verwenden.":g.length?g.length+" von "+n+" Namen eingegeben.":"";
  const ns=document.getElementById("ns");if(ns)ns.textContent="· "+g.length+" von "+n+" Namen";
}
function limChange(){const on=$("#lim").value==="yes";$("#dur").value=on?"20":"40";$("#draw").value=on?"yes":"no";syncSetup()}
/* Schätzung für „Platzierung abwarten“: Das Turnier wird mit der echten Ansetzungslogik mehrfach mit zufälligen Ergebnissen durchgespielt
   (alle Spiele gleich lang, kleine Schwankung). Ergebnis ist der Median der Zeitblöcke. Wird gemerkt, damit die Tabelle schnell bleibt. */
const waitCache={};
function waitBlocks(n,R,c,draw,wait=true,lead=0){
  const ck=[n,R,c,draw?1:0,wait?1:0,wait?0:lead].join();
  if(ck in waitCache)return waitCache[ck];
  const keep=S,res=[],ends=[],G=totalGames(n,R);
  const score=()=>{
    if(Math.random()<.5){return[[6,0],[6,5],[0,6],[5,6]][Math.floor(Math.random()*4)]}
    let a=Math.floor(Math.random()*8),b=Math.floor(Math.random()*8);
    if(a===b&&!draw)b=(b+1+Math.floor(Math.random()*7))%8;
    return[a,b];
  };
  simFast=true;
  const rnd0=Math.random;let seed=[...ck].reduce((h,ch)=>(h*31+ch.charCodeAt(0))>>>0,7);
  Math.random=()=>{seed=(seed+0x6D2B79F5)>>>0;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};  /* feste Zufallsfolge: gleiche Eingaben, gleiche Empfehlung */
  try{
    for(let q=0;q<(G<=60?60:G<=100?30:G<=200?12:6);q++){
      S={n,R,names:Array(n).fill(""),lim:true,courts:c,dur:20,brk:5,draw,ov:true,wait,lead:wait?0:lead,games:[],rk:Array.from({length:n},Math.random)};
      const end=new Map();let t=0,guard=0;
      const add=()=>{const b=S.games.length;rollAdd();for(let i=b;i<S.games.length;i++)end.set(S.games[i],t+1+(Math.random()-.5)*.2)};
      add();
      while(guard++<4000){
        const live=S.games.filter(m=>!m.fin&&!done(m));
        if(!live.length){if(S.games.length>=G)break;add();if(!S.games.some(m=>!m.fin&&!done(m)))break;continue}
        const m=live.reduce((x,y)=>end.get(x)<=end.get(y)?x:y);
        t=end.get(m);[m.sa,m.sb]=score();add();
      }
      if(S.games.length>=G){
        res.push(Math.max(...S.games.map(m=>end.get(m))));
        /* Wann ist jeder Platz zuletzt belegt? Die Plätze werden nach Länge sortiert, denn welcher Platz länger läuft, ist beliebig. */
        const le=Array(c).fill(0);S.games.forEach(m=>{le[m.c]=Math.max(le[m.c],Math.round(end.get(m)))});
        ends.push(le.sort((x,y)=>y-x));
      }
    }
  }finally{S=keep;simFast=false;Math.random=rnd0}
  res.sort((x,y)=>x-y);
  const v=res.length?{t:res[Math.floor(res.length/2)],runs:ends,ends:Array.from({length:c},(_,k)=>{const a=ends.map(e=>e[k]).sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(WQ*a.length))]})}:null;
  waitCache[ck]=v;return v;
}
const WQ=.8;
/* Bei „sofort weiter“ gibt es keine Wartezeit zu simulieren: Reserve in Zeitblöcken (knapp 0, normal 1, sicher 2). Bei „abwarten“ entscheidet der Anteil simulierter Turniere. */
const RESB={50:0,75:1,95:2};
function bookFor(runs,c,wt,sec,dur,brk){
  const e=wt?0:(RESB[sec]==null?1:RESB[sec]),b=bookWait(runs.map(r=>r.map(x=>x+e)),c,wt?sec/100:1,dur,brk);
  return{need:b.need,cov:wt?b.cov:null,res:e};
}
function waitTotal(){
  const lo=plan(S.n,S.R,S.courts,S.dur,S.brk,true).waves,v=waitBlocks(S.n,S.R,S.courts,!!S.draw),w=v?Math.max(lo,Math.round(v.t)):plan(S.n,S.R,S.courts,S.dur,S.brk,false).waves;
  return w*S.dur+(w-1)*S.brk;
}
/* Buchung aus den simulierten Turnieren: Je Platz (nach Länge sortiert) die kleinste Buchung, sodass der Anteil q aller Läufe komplett abgedeckt ist */
function bookWait(runs,c,q,dur,brk){
  const step=dur+brk,needOf=e=>Math.max(60,Math.ceil(((e-1)*step+dur+wu())/30)*30),Rn=runs.map(e=>e.map(needOf));
  for(let p=Math.max(.01,q-.2);p<=1.0001;p+=.01){
    const need=Array.from({length:c},(_,k)=>{const a=Rn.map(r=>r[k]).sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.max(0,Math.ceil(p*a.length)-1))]});
    const cov=Rn.filter(r=>r.every((x,k)=>x<=need[k])).length/Rn.length;
    if(cov>=q-1e-9)return{need,cov};
  }
  const need=Array.from({length:c},(_,k)=>Math.max(...Rn.map(r=>r[k])));
  return{need,cov:1};
}
let waitJob=0;
function fillWait(n,R,dur,brk,draw,mx){
  const job=++waitJob;let k=1;
  const next=()=>{
    if(job!==waitJob||k>mx)return;
    const cell=document.getElementById("wt"+k);if(!cell)return;
    const bv=waitBlocks(n,R,k,draw),b=bv&&bv.t,lo=plan(n,R,k,dur,brk,true).waves,hi=plan(n,R,k,dur,brk,false).waves;
    const wbc=document.getElementById("wb"+k);
    const md=$("#ov").value;
    if(wbc&&(md==="wait"||md==="yes")){const bw=md==="wait"?bv:waitBlocks(n,R,k,draw,false,+($("#lead")||{}).value||0);wbc.textContent=bw?"Buchung: "+groups(bookFor(bw.runs,k,md==="wait",+$("#sec").value||75,dur,brk).need).map(g=>`${courtLbl(g)}: ${fmt(g.T)}`).join(" · "):"Buchung: –"}
    if(b==null)cell.textContent="–";
    else{const w=Math.max(lo,Math.round(b)),t=x=>x*dur+(x-1)*brk;
      cell.textContent=fc(t(w))}
    k++;setTimeout(next,0);
  };
  setTimeout(next,0);
}
const fc=t=>{const h=Math.floor(t/60),m=t%60;return h+":"+String(m).padStart(2,"0")+" h"};
const RULES_HTML=`<details class="rules"><summary>Spielregeln</summary><ul>
        <li>Wertung: Sieg 3 Punkte, Unentschieden 1 Punkt (nur wenn erlaubt), Niederlage 0. Das Ergebnis wird in Games eingetragen, bei Zeitlimit zählt der Stand nach Ablauf.</li>
        <li>Platzierung: Punkte, dann Direktvergleich, Game-Differenz, Buchholz (Punkte der Gegner), Siege, erzielte Games. Sind 2 bis 4 Spieler bei den Plätzen 1 bis 3 punktgleich, spielen sie am Ende Entscheidungsspiele jeder gegen jeden.</li>
        <li>Paarung: Runde 1 wird ausgelost. Ab Runde 2 wird nach Tabelle gepaart, bevorzugt Spieler mit benachbarten Plätzen (1. gegen 2., 3. gegen 4. usw.), und ohne Wiederholungen, solange das möglich ist. Dafür zählen Punkte, Game-Differenz, Siege und erzielte Games.</li>
        <li>Bei ungerader Spielerzahl pausiert pro Runde möglichst, wer bisher am seltensten pausiert hat, davon der Tabellenletzte. Bei Gleichstand und in Runde 1 entscheidet das Los.</li>
        <li>Nach jeder zweiten Runde spielen die beiden Pausierenden ein Zusatzspiel, damit am Ende alle gleich viele Spiele haben.</li>
        <li>Scheidet ein Spieler aus, zählen seine bisherigen Spiele für die Gegner weiter. Wer dadurch ein Spiel verliert, bekommt ein Ausgleichsspiel. Fehlt am Ende noch jemandem ein Spiel, spielt er ein Zusatzspiel gegen einen tabellenähnlichen Gegner. Es zählt nur für ihn, nicht für den Gegner.</li>
        <li>Ohne Überlappung: Spiele laufen gleichzeitig, soweit Plätze frei sind. Eine neue Runde beginnt erst, wenn alle Ergebnisse vorliegen. Ein Zusatzspiel startet nach dem regulären Spiel des Spielers, der in der Vorrunde pausiert hat.</li>
        <li>Mit Überlappung: Ein Spiel beginnt, sobald ein Platz frei ist und die Spieler bereit sind, auch wenn die Vorrunde noch läuft. Gepaart werden bevorzugt Spieler mit gleich vielen bisherigen Spielen, nach Tabelle. Bei „Ja, sofort weiter“ kennt die Paarung nicht den Stand der laufenden Spiele, Wiederholungsspiele lassen sich seltener vermeiden. Bei „Ja, Platzierung abwarten“ wird ein Spiel erst angesetzt, wenn laufende Spiele die Platzierung der beiden Spieler nicht mehr verändern können. Ein Platz bleibt dafür manchmal kurz frei, Wiederholungsspiele werden dabei möglichst vermieden. Die Vorsprung-Grenze (nur „sofort weiter“) hält die Spielzahlen enger beieinander.</li>
      </ul></details>`;
function syncSetup(){
  const n=+$("#n").value,sel=$("#r"),cur=validR(n,+sel.value||4);
  sel.innerHTML=roundOpts(n).map(r=>`<option value="${r}"${r===cur?" selected":""}>${r} Runden</option>`).join("");
  const mx=Math.floor(n/2),cs=$("#c"),cc=Math.min(mx,+cs.value||2);
  cs.innerHTML=[...Array(mx).keys()].map(k=>`<option value="${k+1}"${k+1===cc?" selected":""}>${k+1} ${k?"Plätze":"Platz"}</option>`).join("");
  const lim=$("#lim").value==="yes",dr=$("#draw"),dur=+$("#dur").value,brk=+$("#brk").value;
  $("#durl").textContent=lim?"Spielzeit pro Spiel":"Geschätzte Dauer pro Spiel";
  dr.disabled=!lim;if(!lim)dr.value="no";
  const R=+sel.value,c=+cs.value,mode=$("#ov").value,ov=mode!=="no",wt=mode==="wait",P=plan(n,R,c,dur,brk,ov&&!wt),sim=Math.min(c,mx)*2,A=plan(n,R,c,dur,brk,!ov||wt);
  $("#leadf").hidden=mode!=="yes";$("#secf").hidden=!ov;
  const drawOn=$("#draw").value==="yes"&&lim,leadV=+($("#lead")||{}).value||0,WV=ov?waitBlocks(n,R,c,drawOn,wt,leadV):null;
  let BK=null;
  if(ov&&WV){const sc=+$("#sec").value||75,b=bookFor(WV.runs,c,wt,sc,dur,brk),tw=Math.max(plan(n,R,c,dur,brk,true).waves,Math.round(WV.t));BK={need:b.need,cov:b.cov,res:b.res,tot:tw*dur+(tw-1)*brk,tw,runs:WV.runs.length}}
  const lines=[`Jeder spielt ${R}-mal, insgesamt ${totalGames(n,R)} Spiele.`,
    BK?`Gesamtdauer ca. ${fmt(BK.tot)}: ${BK.tw} Zeitblöcke zu ${dur} min${brk&&BK.tw>1?`, dazwischen je ${brk} min Wechsel und Pause`:""}. Schätzung aus ${BK.runs} simulierten Turnieren.`:
    `Gesamtdauer ${wt?"bis ":""}ca. ${fmt(P.total)}: ${P.waves} Zeitblöcke zu ${dur} min${brk&&P.waves>1?`, dazwischen je ${brk} min Wechsel und Pause`:""}.`,
    `Gleichzeitig spielen ${sim} Spieler${n>sim?`, ${n-sim} pausieren oder warten`:""}.`];
  if(n%2)lines.push(ov&&!wt?"Bei ungerader Spielerzahl sind nur gerade Rundenzahlen möglich, damit alle gleich oft spielen.":"Bei ungerader Spielerzahl sind nur gerade Rundenzahlen möglich. Die Zusatzspiele der Pausierenden sind eingerechnet.");
  if(ov&&!wt){
    lines.push(BK?"Spiele werden angesetzt, sobald ein Platz frei ist.":"Spiele werden angesetzt, sobald ein Platz frei ist. Die Dauer ist die Prognose im besten Fall und kann sich um ein bis zwei Zeitblöcke verlängern.");
    lines.push(`Hinweis: Die Paarungen entstehen, ohne dass der Stand der noch laufenden Spiele feststeht. Sie passen dadurch ${c*4>n?"deutlich":"etwas"} weniger gut zur Tabelle als bei Runde für Runde. Mit „Ja, Platzierung abwarten“ bleibt die Paarung wie im Schweizer System, dafür kann es Wartezeit geben.`);
  }
  if(wt){
    lines.push("Ein Spiel wird erst angesetzt, wenn die Platzierung der beiden Spieler feststeht und sich durch laufende Spiele nicht mehr ändern kann. Die Paarungen entsprechen dann dem Schweizer System, Plätze bleiben dafür manchmal kurz frei.");
    if(!BK)lines.push(`Die Dauer liegt zwischen ca. ${fmt(A.total)} (ohne Wartezeit) und ca. ${fmt(P.total)} (wie Runde für Runde).`);
  }
  if(BK)lines.push((BK.cov!=null?`Die Buchung unten reicht in ca. ${Math.round(BK.cov*100)} % der simulierten Turniere.`:`Die Buchung unten enthält ${BK.res?BK.res+(BK.res>1?" Zeitblöcke":" Zeitblock")+" Reserve":"keine Reserve"} für Verzögerungen.`)+` Dauert es länger, müsste ein Platz verlängert werden. Die Plätze unterscheiden sich in der Dauer, weil nicht auf allen Plätzen gleich viele Spiele stattfinden.`);
  if(!ov&&A.waves<P.waves)lines.push(`Mit überlappenden Runden wären es nur ${A.waves} Zeitblöcke, ca. ${fmt(A.total)}, mit etwas schlechteren Paarungen.`);
  if(ov&&!wt&&A.waves>P.waves)lines.push(`Ohne Überlappung wären es ${A.waves} Zeitblöcke, ca. ${fmt(A.total)}.`);
  if(!lim)lines.push("Ohne Zeitlimit wird bis zum Ergebnis gespielt, Unentschieden gibt es nicht. Die Dauer ist eine Schätzung.");
  if(R>n-1)lines.push("Bei mehr Runden als Gegnern lassen sich Wiederholungsspiele nicht vermeiden.");
  const t0=T0(),w0=wu();
  if(w0)lines.push(`Aufwärmen: ${w0} min, in der Buchung eingerechnet.${t0!=null?` Das erste Spiel beginnt um ${hhmm(t0+w0)}.`:""}`);
  const bk=groups(BK?BK.need:P.need).map(g=>`<tr><td class="nm">${courtLbl(g)}</td><td>${fmt(g.T)}${t0!=null?`<span class="sub">${hhmm(t0)} bis ${hhmm(t0+g.T)}</span>`:""}</td><td>${split(g.T).join(" + ")} min</td></tr>`).join("");
  $("#sum").innerHTML=lines.map((t,i)=>`<p class="${i?"hint":"sum"}">${t}</p>`).join("")+`<div class="wrap bkt"><table><thead><tr><th class="nm">Buchung</th><th>Dauer</th><th>Aufteilung</th></tr></thead><tbody>${bk}</tbody></table></div><p class="hint">Plätze lassen sich zu 60, 90 oder 120 min buchen. Gerechnet wird bis zum Ende des letzten Spiels auf dem jeweiligen Platz, aufgerundet auf 30 min.</p>`;
  const cols=[["no","Runde für Runde"],["yes","Sofort weiter"],["wait","Abwarten (ca.)"]];
  const rows=[...Array(mx).keys()].map(k=>{
    const q0=plan(n,R,k+1,dur,brk,false),q1=plan(n,R,k+1,dur,brk,true),qs=mode==="yes"?q1:q0,cl=k+1===c?"sel":"";
    const cell=(m,txt,id)=>`<td class="${m===mode?"cm":""}"${id?` id="${id}"`:""}>${txt}</td>`;
    return`<tr class="${cl} cmp1"><td class="l">${k+1} ${k?"Plätze":"Platz"}</td>${cell("no",fc(q0.total))}${cell("yes",fc(q1.total))}${cell("wait","…","wt"+(k+1))}</tr><tr class="${cl} cmp2"><td colspan="4" id="wb${k+1}">Buchung: ${mode==="wait"||mode==="yes"?"…":groups(qs.need).map(g=>`${courtLbl(g)}: ${fmt(g.T)}`).join(" · ")}</td></tr>`}).join("");
  $("#ptab").innerHTML=`<div class="wrap"><table class="cmpt"><thead><tr><th class="l">Plätze</th>${cols.map(x=>`<th class="${x[0]===mode?"cm":""}">${x[1]}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div><p class="legend">Gesamtdauer je Platzzahl bei den drei Optionen für „Runden überlappen“. „Sofort weiter“ ist der beste Fall, „Abwarten“ eine Schätzung aus simulierten Turnieren mit gemischten Ergebnissen. Wenn Unentschieden erlaubt sind und viele Spiele unentschieden enden, bleibt die Platzierung länger offen und es dauert bis zu so lang wie Runde für Runde (obere Angabe). Unter jeder Zeile steht die Buchung je Platz für die gewählte Option, aufgerundet auf 30 min.</p>`;
  fillWait(n,R,dur,brk,$("#draw").value==="yes"&&lim,mx);
  $("#pleg").textContent=ov?(wt?"Zeitplan im günstigsten Fall, ohne Wartezeit. Tatsächlich kann es länger dauern, wenn Plätze auf feste Platzierungen warten. ":"")+"Zeiten sind Richtwerte ab Turnierstart, inklusive Wechselzeit. Die Paarungen ergeben sich während des Turniers, sobald Plätze frei werden. Die Farbleiste zeigt die Runde.":"Zeiten ab Turnierstart, inklusive Wechselzeit. Ab Runde 2 ergeben sich die Paarungen aus der Tabelle. Die Farbleiste zeigt die Runde.";
  renderPlan();
  nameFields();
}
function start(){
  const n=Math.min(MAXN,Math.max(MINN,+$("#n").value||MINN)),R=validR(n,+$("#r").value);
  if(dupOf(typed(n))){const dn=dupOf(typed(n)).toLowerCase(),f=[...document.querySelectorAll('#nf input[data-k="p"]')].find(x=>x.value.trim().toLowerCase()===dn);const d=document.querySelector("details.names");if(d)d.open=true;nameHint();if(f)f.focus();return}
  const lim=$("#lim").value==="yes",cn=clean(CNM);
  justDone.clear();
  createTournament({n,R:+$("#r").value,names:fullNames(n),lim,courts:+$("#c").value,dur:+$("#dur").value,brk:+$("#brk").value,draw:lim&&$("#draw").value==="yes",cn,wu:+$("#wu").value||0,t0:tparse($("#t0").value),ov:$("#ov").value,lead:+$("#lead").value||0});
  NM=[];CNM=[];
  save();render();
}
/* Turnierablauf */
function nextRound(){
  if(!canAdvance())return;
  undoArmed=false;
  if(!advanceRound())return;
  save();render();
}
function undoRound(){
  if(S.rounds.length<2)return;
  const rd=S.rounds[S.rounds.length-1],dirty=rd.m.concat(rd.x?[rd.x]:[]).some(m=>m.sa!=null||m.sb!=null);
  if(dirty&&!undoArmed){undoArmed=true;renderActions();setTimeout(()=>{undoArmed=false;if(S)renderActions()},3500);return}
  undoArmed=false;undoClassic();save();render();
}
function reset(){
  if(!resetArmed){resetArmed=true;renderTop();setTimeout(()=>{resetArmed=false;renderTop()},3500);return}
  resetArmed=false;undoArmed=false;S=null;try{localStorage.removeItem(KEY)}catch(e){}
  pushLive();render();
}
function setScore(ri,mi,side,v){
  scoreClassic(ri,mi,side,v);
  save();renderTable();renderActions();markRow(ri,mi);renderPlan();
}
function markRow(ri,mi){
  const m=mi<0?S.rounds[ri].x:S.rounds[ri].m[mi],row=document.getElementById("m"+ri+"_"+mi);
  if(!row)return;
  const d=done(m);
  row.querySelector(".a").classList.toggle("win",d&&m.sa>m.sb);
  row.querySelector(".b").classList.toggle("win",d&&m.sb>m.sa);
}
document.addEventListener("keydown",e=>{
  if(e.key!=="Enter"||!e.target.matches||!e.target.matches(".m input"))return;
  e.preventDefault();
  const ins=[...document.querySelectorAll(".m input")],nx=ins[ins.indexOf(e.target)+1]||document.querySelector("#act button:not(:disabled)");
  if(nx)nx.focus();
});
/* Anzeige */
function renderTop(){
  $("#topbtns").innerHTML=VIEW?"":S?`<button class="${resetArmed?"danger":"quiet"}" onclick="reset()">${resetArmed?"Wirklich zurücksetzen?":"Zurücksetzen"}</button>`:"";
}
function render(){render0();if(VIEW)lockView();renderLiveBar()}
function render0(){
  renderTop();
  $("#tl").textContent=S&&S.courts?`Einzel im Schweizer System. ${S.courts} ${S.courts===1?"Platz":"Plätze"}, ${S.lim?S.dur+" min Zeitlimit":"ohne Zeitlimit"}, geplant ca. ${fmt(S.wait?waitTotal():plan(S.n,S.R,S.courts,S.dur,S.brk,S.ov).total)}${S.ov?(S.wait?", Runden überlappend, mit Warten auf feste Platzierung":", Runden überlappend"):""}.`:"Einzel im Schweizer System";
  if(!S&&liveBoot){$("#app").innerHTML='<p class="hint wait0">Lädt …</p>';return}
  if(!S&&liveDoc&&!liveCan&&!liveRemote){$("#app").innerHTML='<section class="panel"><h2>Noch kein Turnier</h2><p class="hint">Sobald das Turnier gestartet wird, erscheint der Stand hier automatisch. Die Seite muss nicht neu geladen werden.</p></section>';return}
  if(!S){
    const nOpts=[...Array(MAXN-MINN+1).keys()].map(k=>`<option value="${MINN+k}"${MINN+k===9?" selected":""}>${MINN+k} Spieler</option>`).join("");
    $("#app").innerHTML=`<section class="panel"><h2>Turnier einrichten</h2>
      <fieldset class="grp"><legend>Teilnehmer und Plätze</legend><div class="grid">
        <div class="field"><label for="n">Spieler</label><select id="n" onchange="syncSetup()">${nOpts}</select></div>
        <div class="field"><label for="r">Runden</label><select id="r" onchange="syncSetup()"></select></div>
        <div class="field"><label for="c">Plätze</label><select id="c" onchange="syncSetup()"></select></div>
      </div></fieldset>
      <fieldset class="grp"><legend>Ablauf</legend><div class="grid">
        <div class="field"><label for="ov">Runden überlappen</label><select id="ov" onchange="syncSetup()"><option value="no">Nein, Runde für Runde</option><option value="yes">Ja, sofort weiter</option><option value="wait">Ja, Platzierung abwarten</option></select></div>
        <div class="field" id="leadf" hidden><label for="lead">Vorsprung begrenzen</label><select id="lead" onchange="syncSetup()"><option value="0">Keine Grenze</option><option value="1">Höchstens 1 Spiel Vorsprung</option><option value="2">Höchstens 2 Spiele Vorsprung</option></select><p class="hint">Begrenzt, wie viele Spiele ein Spieler mehr haben darf als der Spieler mit den wenigsten. Strenger heißt gleichmäßiger, aber mehr Leerlauf und eher Wiederholungsspiele.</p></div>
      </div></fieldset>
      <fieldset class="grp"><legend>Spielzeit</legend><div class="grid">
        <div class="field"><label for="lim">Zeitlimit pro Spiel</label><select id="lim" onchange="limChange()"><option value="yes">Ja</option><option value="no">Nein</option></select></div>
        <div class="field"><label for="dur" id="durl">Spielzeit pro Spiel</label><select id="dur" onchange="syncSetup()">${DURS.map(d=>`<option value="${d}"${d===20?" selected":""}>${d} min</option>`).join("")}</select></div>
        <div class="field"><label for="draw">Unentschieden</label><select id="draw" onchange="syncSetup()"><option value="yes">Erlaubt, Stand nach Zeitablauf</option><option value="no">Nicht erlaubt</option></select></div>
        <div class="field"><label for="brk">Wechsel- und Pausenzeit</label><select id="brk" onchange="syncSetup()">${BRKS.map(b=>`<option value="${b}"${b===5?" selected":""}>${b} min</option>`).join("")}</select></div>
      </div></fieldset>
      <fieldset class="grp"><legend>Uhrzeit und Buchung</legend><div class="grid">
        <div class="field"><label for="t0">Startzeit (optional)</label><input id="t0" type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="hh:mm, z. B. 18:30" onchange="fixT0(this)"></div>
        <div class="field"><label for="wu">Aufwärmen vor dem ersten Spiel</label><select id="wu" onchange="syncSetup()">${[0,5,10,15,20,30].map(b=>`<option value="${b}"${b===0?" selected":""}>${b?b+" min":"Kein Aufwärmen"}</option>`).join("")}</select></div>
        <div class="field" id="secf" hidden><label for="sec">Buchungssicherheit</label><select id="sec" onchange="syncSetup()"><option value="50">Knapp: reicht meist</option><option value="75" selected>Normal: reicht fast immer</option><option value="95">Sicher: mit Reserve</option></select></div>
      </div></fieldset>
      <div id="sum" aria-live="polite"></div>
      <details class="cmp"><summary>Dauer nach Platzzahl vergleichen</summary><div id="ptab"></div></details>
      <details class="names"><summary>Namen für Spieler und Plätze (optional) <span id="ns" class="meta"></span></summary><div id="nf"></div></details>
      <div class="actions"><button onclick="start()">Turnier starten</button></div>
      ${RULES_HTML}
      <details class="rules"><summary>Handhabung</summary><ul>
        <li>Einrichten: Spieler, Runden, Plätze und Modus wählen. Namen für Spieler und Plätze sind optional, leere Felder heißen A, B, C … bzw. Platz 1, Platz 2 … Eine Liste mit Komma oder Zeilenumbruch lässt sich in ein Feld einfügen. Mit Startzeit (Beginn der Platzbuchung) und Aufwärmen zeigt der Spielplan Uhrzeiten, das Aufwärmen liegt am Anfang der Buchung.</li>
        <li>Buchung: Unter den Einstellungen steht, wie lange jeder Platz gebucht werden sollte. Bei überlappenden Runden wird das aus simulierten Turnieren berechnet. „Buchungssicherheit“ legt fest, wie oft die Buchung reichen soll (Abwarten: Knapp ca. 50 %, Normal ca. 75 %, Sicher ca. 95 % der simulierten Turniere. Sofort weiter: Knapp ohne, Normal mit einem, Sicher mit zwei Zeitblöcken Reserve). Der Vergleich nach Platzzahl zeigt dieselbe Rechnung für andere Platzzahlen.</li>
        <li>Spielen: „Turnier starten“ lost Runde 1 aus. Ergebnisse in Games eintragen. Bei Runde für Runde erscheint die nächste Runde mit „Runde n erstellen“, sobald alle Ergebnisse vorliegen. Bei überlappenden Runden setzt „Spiel ansetzen“ die nächsten Spiele an, sobald ein Platz frei ist.</li>
        <li>Korrigieren: Das Ergebnis der jüngsten Spiele lässt sich ändern. Mit „Zurück zu Runde“ bzw. „Letzte Ansetzung zurücknehmen“ wird die letzte Ansetzung verworfen. Ältere Spiele sind gesperrt.</li>
        <li>Ausscheiden: Unter „Spieler scheidet aus“ den Spieler wählen und bestätigen. Offene Spiele mit ihm entfallen, Ausgleichs- und Zusatzspiele werden automatisch angesetzt.</li>
        <li>Zeiten anpassen: Über dem Spielplan lassen sich Startzeit und Aufwärmen ändern. Mit „+5 min“ oder „+10 min“ verschieben sich alle Zeiten ab der aktuellen Zeile, wenn sich ein Slot verschiebt. „Zurücksetzen“ stellt den Plan wieder her.</li>
        <li>Tabelle kopieren: Der Button unter der Tabelle kopiert den Stand als Text, zum Beispiel für einen Messenger.</li>
        <li>Speichern: Der Stand bleibt im Browser erhalten, auch nach dem Neuladen. „Zurücksetzen“ oben verwirft das Turnier nach Bestätigung.</li>
      </ul></details></section>
    <section class="section"><h2>Spielplan</h2><p class="hint">Vorschau, wie sich die Spiele auf Plätze und Zeitblöcke verteilen. Die Namen erscheinen nach dem Start.</p><div class="wrap" id="plan"></div><p class="legend" id="pleg"></p></section>`;
    syncSetup();
    return;
  }
  if(VIEW){
    $("#app").innerHTML=`<div id="champ" aria-live="polite"></div>
    <section class="panel roundp"><div class="head"><h2 id="rh"></h2><span class="meta" id="prog"></span></div><div id="mine"></div><div class="cur" id="vcur"></div></section>
    <section class="section"><h2>Tabelle</h2><div class="wrap" id="tab"></div><p class="legend" id="leg"></p><div class="actions"><button class="quiet more" id="morecol" aria-expanded="false" onclick="toggleCols()">Games und Buchholz zeigen</button><button class="quiet" onclick="copyTable()">Tabelle kopieren</button><span class="status" id="cpst" role="status"></span></div><textarea id="cpbox" class="cpbox" hidden readonly aria-label="Tabelle als Text"></textarea></section>
    <section class="section"><h2>Spielplan</h2><div class="wrap" id="plan"></div><p class="legend">Zeiten sind Richtwerte, inklusive Wechselzeit, und können sich verschieben. Hervorgehobene Felder laufen gerade.</p></section>`;
    renderViewer();return;
  }
  if(S.ov){
    $("#app").innerHTML=`<div id="champ" aria-live="polite"></div><div id="so"></div>
    <section class="panel"><div class="head"><h2 id="rh"></h2><span class="meta" id="prog"></span></div><div id="mine"></div><div class="cur" id="cur"></div><div class="actions" id="act"></div></section>
    <section class="section"><h2>Tabelle</h2><div class="wrap" id="tab"></div><p class="legend" id="leg"></p><div class="actions"><button class="quiet more" id="morecol" aria-expanded="false" onclick="toggleCols()">Games und Buchholz zeigen</button><button class="quiet" onclick="copyTable()">Tabelle kopieren</button><span class="status" id="cpst" role="status"></span></div><textarea id="cpbox" class="cpbox" readonly hidden aria-label="Tabelle als Text"></textarea></section>
    <section class="section"><h2>Spielplan</h2><div id="tctl"></div><div class="wrap" id="plan"></div><p class="legend">Zeiten sind Richtwerte ab Turnierstart, inklusive Wechselzeit. Gestrichelte Felder sind noch nicht angesetzt, hervorgehobene Felder laufen gerade. Die Farbleiste zeigt die Runde. Runden können sich überlappen, weil ein Spiel startet, sobald Platz und Spieler frei sind.</p></section>
    <section class="section" id="outc"></section>
    <section class="section" id="histc" hidden><h2>Bisherige Runden</h2><p class="hint">Abgeschlossene Runden sind gesperrt. Zum Korrigieren mit „Zurück zu Runde“ zurückgehen.</p><div class="hist" id="hist"></div></section>`;
    renderRoll();return;
  }
  $("#app").innerHTML=`<div id="champ" aria-live="polite"></div><div id="so"></div>
    <section class="panel"><div class="head"><h2 id="rh"></h2><span class="meta" id="prog"></span></div><div id="mine"></div><div class="cur" id="cur"></div><div class="actions" id="act"></div></section>
    <section class="section"><h2>Tabelle</h2><div class="wrap" id="tab"></div><p class="legend" id="leg"></p><div class="actions"><button class="quiet more" id="morecol" aria-expanded="false" onclick="toggleCols()">Games und Buchholz zeigen</button><button class="quiet" onclick="copyTable()">Tabelle kopieren</button><span class="status" id="cpst" role="status"></span></div><textarea id="cpbox" class="cpbox" readonly hidden aria-label="Tabelle als Text"></textarea></section>
    <section class="section"><h2>Spielplan</h2><div id="tctl"></div><div class="wrap" id="plan"></div><p class="legend">Zeiten ab Turnierstart, inklusive Wechselzeit. Gestrichelte Felder sind noch nicht ausgelost. Das hervorgehobene Feld gehört zur aktuellen Runde. Die Farbleiste zeigt die Runde.</p></section>
    <section class="section" id="outc"></section>
    <section class="section" id="histc" hidden><h2>Bisherige Runden</h2><div class="hist" id="hist"></div></section>`;
  renderCur();renderTable();renderActions();renderHist();renderPlan();
}
/* Mein nächstes Spiel: Auswahl des Spielers, Anzeige von Platz, Uhrzeit und Gegner */
let MINE="";
try{MINE=localStorage.getItem("padel-mine")||""}catch(e){}
function setMine(v){MINE=v;try{localStorage.setItem("padel-mine",v)}catch(e){}renderMine()}
/* Zuschauer-Ansicht: nur lesen. Laufende Spiele als Text, Tabelle, Spielplan. */
function viewRow(tag,m,k,i){
  const d=done(m),nm=x=>esc(S.names[x]),sc=v=>v==null?"–":v;
  return`<div class="mw ${tag.cls}"><span class="tag">${tag.t}${k==null?"":` · <b class="crt">${esc(cname(k))}</b>`}${k!=null&&i!=null&&T0()!=null?" · ab "+tt(i,S.dur+S.brk):""}</span><div class="m">
      <div class="a ${d&&m.sa>m.sb?"win":""}">${nm(m.a)}</div><div class="vs">${sc(m.sa)}</div><div class="sep">:</div><div class="vs">${sc(m.sb)}</div><div class="b ${d&&m.sb>m.sa?"win":""}">${nm(m.b)}</div>
    </div>${m.h?`<p class="note">Zusatzspiel zum Ausgleich: zählt nur für ${nm(m.a)}.</p>`:""}</div>`;
}
function renderViewer(){
  const G=S.games?S.games.length+rollLeft()+helpLeft():(S.out&&S.out.length?null:totalGames(S.n,S.R)),fin=allM().filter(done).length;
  $("#prog").textContent=fin+(G==null?" Spiele beendet":" von "+G+" Spielen beendet");
  $("#champ").innerHTML=champHtml();
  let h="";
  if(S.ov){
    const v=rollView(),I=v.I,P=rollPauses(S.games,I,S.n);rollTitle(v);
    h=`<div class="matches">${v.rows.map(([m,i])=>viewRow({cls:rcOf(I[i].r),t:rollTag(I[i])},m,m.c,rollRows(S.games,S.courts)[i])).join("")}</div>`+
      [...new Set(v.rows.map(([m,i])=>I[i].r))].filter(r=>P[r]).map(r=>`<p class="note">Pausiert in Runde ${r}: <b>${P[r].map(x=>esc(S.names[x])).join(", ")}</b></p>`).join("");
  }else{
    const ri=S.rounds.length-1,rd=S.rounds[ri],SL=classicSlots(ri);
    $("#rh").textContent=rd.fin?"Zusatzspiele":`Runde ${ri+1} von ${S.R}`;
    h=`<div class="matches">${rd.m.concat(rd.x?[rd.x]:[]).map((m,mi)=>{const q=SL.get(m);return viewRow({cls:"rc"+(ri%6),t:rd.fin?"Zusatzspiel":"Runde "+(ri+1)+", "+(m===rd.x?"Zusatzspiel":m.eq?"Ausgleichsspiel":"Spiel "+(mi+1))},m,q?q.k:null,q?q.i:null)}).join("")}</div>`+
      (rd.bye!=null?`<p class="note">Pausiert: <b>${esc(S.names[rd.bye])}</b></p>`:"");
  }
  $("#vcur").innerHTML=h;
  renderMine();renderTable();renderPlan();
}
function previewView(){if(!S)return;VIEW=true;S=JSON.parse(JSON.stringify(S));render()}
function renderMine(){
  const el=document.getElementById("mine");if(!el||!S)return;
  const p=MINE===""?-1:+MINE,ok=p>=0&&p<S.n;
  let msg="";
  if(ok){
    const q=nextOf(p),gone=(S.out||[]).includes(p);
    msg=gone?"Ausgeschieden.":q?`Nächstes Spiel: ${q.k==null?"":`<b class="crt">${esc(cname(q.k))}</b> · `}${T0()!=null?"ab <b>"+tt(q.i,S.dur+S.brk)+"</b> · ":""}gegen <b>${esc(S.names[q.o])}</b>`:(isOver()?"Alle Spiele gespielt.":"Noch nicht angesetzt. Dein nächstes Spiel erscheint hier, sobald es feststeht.");
  }
  el.innerHTML=`<div class="mine"><label for="mineSel">Ich bin</label><select id="mineSel" onchange="setMine(this.value)"><option value="">Spieler wählen</option>${S.names.slice(0,S.n).map((x,i)=>`<option value="${i}"${ok&&i===p?" selected":""}>${esc(x)}</option>`).join("")}</select>${ok?`<span class="nx" aria-live="polite">${msg}</span>`:""}</div>`;
}
function renderCur(){
  const ri=S.rounds.length-1,rd=S.rounds[ri];
  const SL=classicSlots(ri),where=m=>{const q=SL.get(m);return q?` · <b class="crt">${esc(cname(q.k))}</b>${T0()!=null?" · ab "+tt(q.i,S.dur+S.brk):""}`:""};
  const row=(m,mi)=>`<div class="mw rc${ri%6}"><span class="tag">${rd.fin?"Zusatzspiel":"Runde "+(ri+1)+", "+(mi<0?"Zusatzspiel":m.eq?"Ausgleichsspiel":"Spiel "+(mi+1))}${where(m)}</span><div class="m" id="m${ri}_${mi}">
      <div class="a ${done(m)&&m.sa>m.sb?"win":""}">${esc(S.names[m.a])}</div>
      <input type="number" min="0" max="99" inputmode="numeric" enterkeyhint="next" aria-label="Games ${esc(S.names[m.a])}" value="${m.sa??""}" oninput="setScore(${ri},${mi},'a',this.value)">
      <div class="sep">:</div>
      <input type="number" min="0" max="99" inputmode="numeric" enterkeyhint="next" aria-label="Games ${esc(S.names[m.b])}" value="${m.sb??""}" oninput="setScore(${ri},${mi},'b',this.value)">
      <div class="b ${done(m)&&m.sb>m.sa?"win":""}">${esc(S.names[m.b])}</div>
    </div>${m.h?`<p class="note">Zählt nur für ${esc(S.names[m.a])}, nicht für ${esc(S.names[m.b])}.</p>`:""}</div>`;
  renderMine();
  $("#rh").textContent=rd.fin?"Zusatzspiele":`Runde ${ri+1} von ${S.R}`;
  $("#cur").innerHTML=`<p class="hint">Ergebnis in Games eintragen, z. B. 6 : 4.${S.draw?"":" Unentschieden sind nicht erlaubt."}</p>
    <div class="matches">${rd.m.map(row).join("")}</div>`+
    (rd.bye!=null?`<p class="note">Pausiert: <b>${esc(S.names[rd.bye])}</b></p>`:"")+
    (rd.free&&rd.free.length?`<p class="note">Ohne Gegner (Gegner ausgeschieden): <b>${rd.free.map(i=>esc(S.names[i])).join(", ")}</b></p>`:"")+
    (rd.x?`<div class="extra"><h3>Zusatzspiel</h3><p class="hint">Die Pausierenden aus Runde ${ri} und ${ri+1} gleichen ihre Spiele aus.</p><div class="matches">${row(rd.x,-1)}</div></div>`:"");
}
/* Tabelle als Text kopieren, z. B. für die Gruppe. Klappt die Zwischenablage nicht, wird der Text zum Markieren angezeigt. */
function tableText(){
  const st=ranking(),G=S.games?S.games.length+rollLeft()+helpLeft():(S.out&&S.out.length?null:totalGames(S.n,S.R)),fin=allM().filter(done).length;
  return`Padel-Turnier, Stand nach ${fin}${G==null?" Spielen":" von "+G+" Spielen"}\n`+st.map(s=>{return`${s.rk}. ${s.nm}${s.out?" (ausgeschieden)":""}: ${s.p} Pkt, ${s.gf}:${s.ga} Games (${sgn(s.gf-s.ga)})`}).join("\n");
}
async function copyTable(){
  const t=tableText(),st=$("#cpst"),box=$("#cpbox");
  let ok=false;
  try{await navigator.clipboard.writeText(t);ok=true}catch(e){}
  if(!ok){try{box.hidden=false;box.value=t;box.select();ok=document.execCommand("copy")}catch(e){}}
  if(ok){box.hidden=true;st.textContent="Kopiert."}
  else{box.hidden=false;box.value=t;box.focus();box.select();st.textContent="Zum Kopieren markiert, bitte selbst kopieren."}
  setTimeout(()=>{if(st.textContent==="Kopiert.")st.textContent=""},2500);
}
function toggleCols(){const t=$("#tab"),o=t.classList.toggle("open"),b=$("#morecol");if(b){b.setAttribute("aria-expanded",o);b.textContent=o?"Games und Buchholz ausblenden":"Games und Buchholz zeigen"}}
function renderTable(){
  const st=ranking(),top=st.filter(s=>s.rk===1),dr=S.draw;
  const th=(t,ttl,x)=>`<th${x?' class="xc"':""} title="${ttl}">${t}</th>`;
  $("#tab").innerHTML=`<table><thead><tr><th>Platz</th><th class="nm">Spieler</th>${th("Sp","Spiele")}${th("S","Siege")}${dr?th("U","Unentschieden"):""}${th("N","Niederlagen")}${th("Games","Games erzielt:kassiert",1)}${th("Diff","Game-Differenz")}${th("Bh","Buchholz: Summe der Punkte aller bisherigen Gegner",1)}${th("Pkt","Punkte")}</tr></thead><tbody>`+
    st.map(s=>{const rk=s.rk,lead=rk===1&&top.length<st.length&&s.g>0;
      return`<tr class="${lead?"lead":""}"><td class="rk">${rk}</td><td class="nm">${esc(s.nm)}${s.out?" <span class=\"gone\">ausgeschieden</span>":""}</td><td>${s.g}</td><td>${s.w}</td>${dr?`<td>${s.d}</td>`:""}<td>${s.l}</td><td class="xc">${s.gf}:${s.ga}</td><td>${sgn(s.gf-s.ga)}</td><td class="xc">${s.bh}</td><td class="pt">${s.p}</td></tr>`}).join("")+`</tbody></table>`;
  $("#leg").textContent=`Sp Spiele, S Siege, ${dr?"U Unentschieden, ":""}N Niederlagen, Games erzielt:kassiert, Diff Game-Differenz, Bh Buchholz (Punkte der Gegner), Pkt Punkte. Bei Punktgleichheit entscheiden Direktvergleich, Game-Differenz, Buchholz, Siege und erzielte Games.`;
}
function renderActions(){
  const ri=S.rounds.length-1,rd=S.rounds[ri],all=rd.m.concat(rd.x?[rd.x]:[]);
  const open=all.filter(m=>!done(m)).length,last=S.rounds.length>=S.R;
  $("#prog").textContent=`${all.length-open} von ${all.length} Ergebnissen eingetragen`;
  let h="";
  const xr=last&&!open?extraRound():null;
  if(!last)h+=`<button onclick="nextRound()"${open?" disabled":""}>Runde ${ri+2} erstellen</button>`;
  else if(xr)h+=`<button onclick="nextRound()">Zusatzspiele ansetzen</button>`;
  if(ri>0)h+=`<button class="${undoArmed?"danger":"quiet"}" onclick="undoRound()" title="Verwirft Runde ${ri+1} und öffnet Runde ${ri} zum Korrigieren">${undoArmed?`Runde ${ri+1} wirklich verwerfen?`:`Zurück zu Runde ${ri}`}</button>`;
  h+=`<span class="status">${open?`Noch ${open} ${open===1?"Ergebnis":"Ergebnisse"} offen.`:last?(xr?"Einigen Spielern fehlen noch Spiele. Es folgen Zusatzspiele.":"Alle Runden gespielt."):"Alle Ergebnisse eingetragen."}</span>`;
  $("#act").innerHTML=h;
  syncSO();$("#champ").innerHTML=champHtml();renderSO();renderOut();
}
function renderHist(){
  const ri=S.rounds.length-1;
  $("#histc").hidden=ri===0;
  const line=m=>{const d=m.sa===m.sb;return`<div class="r"><span class="a ${!d&&m.sa>m.sb?"win":""}">${esc(S.names[m.a])}</span><span class="sc">${m.sa} : ${m.sb}</span><span class="b ${!d&&m.sb>m.sa?"win":""}">${esc(S.names[m.b])}</span></div>`};
  $("#hist").innerHTML=S.rounds.slice(0,ri).map((rd,k)=>`<details><summary>Runde ${k+1}</summary><div class="rows">${rd.m.map(line).join("")}${rd.x?`<p class="note">Zusatzspiel</p>${line(rd.x)}`:""}${rd.bye!=null?`<p class="note">Pausiert: ${esc(S.names[rd.bye])}</p>`:""}</div></details>`).join("");
}
const rcOf=r=>"rc"+((r-1)%6);
function renderRoll(){rollCur();renderTable();rollActions();rollHist();renderPlan()}
function rollGo(){justDone.clear();undoArmed=false;forceArmed=false;rollAdd();save();renderRoll()}
let forceArmed=false;
/* „Trotzdem ansetzen“ (nur bei Abwarten): zweistufig, damit es nicht versehentlich passiert */
function rollForce(){
  if(!forceArmed){forceArmed=true;rollActions();setTimeout(()=>{forceArmed=false;if(S&&S.ov)rollActions()},3500);return}
  forceArmed=false;justDone.clear();undoArmed=false;rollAddNow();save();renderRoll();
}
/* Sichtbar im Bereich oben: offene Spiele, gerade beendete Spiele und der jüngste Block (korrigierbar). Ältere Spiele sind gesperrt. */
function rollView(){
  const I=rollInfo(S.games,S.n),mx=I.length?Math.max(...I.map(f=>f.r)):1,K=lastBlock();
  const rows=S.games.map((m,i)=>[m,i]).filter(([m,i])=>!done(m)||justDone.has(i)||m.k===K).sort((p,q)=>I[p[1]].r-I[q[1]].r||I[p[1]].x-I[q[1]].x||p[1]-q[1]);
  return{I,mx,rows,shown:new Set(rows.map(r=>r[1]))};
}
function rollScore(gi,side,v){
  const m=S.games[gi],was=done(m);
  scoreRoll(gi,side,v);
  if(done(m)!==was){if(done(m))justDone.add(gi);else justDone.delete(gi)}
  save();renderTable();rollActions();renderPlan();
  const row=document.getElementById("g"+gi);
  if(row){const d=done(m);row.querySelector(".a").classList.toggle("win",d&&m.sa>m.sb);row.querySelector(".b").classList.toggle("win",d&&m.sb>m.sa)}
}
function rollUndo(){
  const K=lastBlock();
  if(K<1)return;
  const dirty=S.games.some(m=>m.k===K&&(m.sa!=null||m.sb!=null));
  if(dirty&&!undoArmed){undoArmed=true;rollActions();setTimeout(()=>{undoArmed=false;if(S&&S.ov)rollActions()},3500);return}
  undoArmed=false;
  undoRoll();
  justDone.clear();
  S.games.forEach((m,i)=>{if(m.k===K-1&&done(m))justDone.add(i)});
  save();renderRoll();
}
function rollTitle(v){
  const rs=[...new Set(v.rows.map(([m,i])=>v.I[i].r))];
  $("#rh").textContent=rs.length===1?`Runde ${rs[0]} von ${S.R}`:rs.length===2?`Runde ${rs[0]} und ${rs[1]} von ${S.R}`:`Runde ${rs[0]} bis ${rs[rs.length-1]} von ${S.R}`;
}
function rollCur(){
  const st=rollState(),v=rollView(),I=v.I,nm=i=>esc(S.names[i]),P=rollPauses(S.games,I,S.n),G=S.games.length+rollLeft()+helpLeft();
  const row=(m,i)=>`<div class="mw ${rcOf(I[i].r)}"><span class="tag">${rollTag(I[i])} · <b class="crt">${esc(cname(m.c))}</b>${T0()!=null?" · ab "+tt(rollRows(S.games,S.courts)[i],S.dur+S.brk):""}</span><div class="m" id="g${i}">
      <div class="a ${done(m)&&m.sa>m.sb?"win":""}">${nm(m.a)}</div>
      <input type="number" min="0" max="99" inputmode="numeric" enterkeyhint="next" aria-label="Games ${nm(m.a)}" value="${m.sa??""}" oninput="rollScore(${i},'a',this.value)">
      <div class="sep">:</div>
      <input type="number" min="0" max="99" inputmode="numeric" enterkeyhint="next" aria-label="Games ${nm(m.b)}" value="${m.sb??""}" oninput="rollScore(${i},'b',this.value)">
      <div class="b ${done(m)&&m.sb>m.sa?"win":""}">${nm(m.b)}</div>
    </div>${m.h?`<p class="note">Zusatzspiel zum Ausgleich: zählt nur für ${nm(m.a)}, nicht für ${nm(m.b)}.</p>`:""}</div>`;
  rollTitle(v);renderMine();
  const rs=[...new Set(v.rows.map(([m,i])=>I[i].r))],wait=[...Array(S.n).keys()].filter(i=>!st.busy.has(i)&&st.g[i]<S.R);
  $("#cur").innerHTML=`<p class="hint">Ergebnis in Games eintragen, z. B. 6 : 4.${S.draw?"":" Unentschieden sind nicht erlaubt."}</p><div class="matches">${v.rows.map(([m,i])=>row(m,i)).join("")}</div>`+
    rs.filter(r=>P[r]).map(r=>`<p class="note">Pausiert in Runde ${r}: <b>${P[r].map(nm).join(", ")}</b></p>`).join("")+
    (wait.length&&S.games.length<G?`<p class="wait">Wartende Spieler: ${wait.map(nm).join(", ")}</p>`:"");
}
/* Feststehende Spiele, unabhängig von allen noch offenen Ergebnissen:
   1. Die Spielgruppe mit den wenigsten Spielen: Spielt dort niemand gerade, hängt die Paarung nur noch vom Stand dieser Spieler ab.
      Ergebnisse laufender Spiele anderer Gruppen ändern sie nicht, und niedrigere Gruppen gibt es nicht. Es stehen also alle noch offenen
      Spiele dieser Runde fest, auch wenn sie noch auf einen freien Platz warten.
   2. Rein rechnerisch Vorgegebenes: Jeder Spieler muss noch d = R − g Spiele bestehen (g zählt laufende Spiele mit). Hat ein Spieler a
      mehr offene Spiele, als alle anderen außer b zusammen noch bestreiten können, muss er mindestens d_a − (D − d_a − d_b)-mal gegen b spielen. */
function rollSure(){
  const left=rollLeft(),G=S.games.length+left;
  if(left<=0)return[];
  const st=rollState(),n=S.n,R=S.R,g=st.g;
  const det=[];
  const act=[...Array(n).keys()].filter(i=>g[i]<R);
  if(act.length){
    const gmin=Math.min(...act.map(i=>g[i]));
    if(!act.some(i=>g[i]===gmin&&st.busy.has(i)))
      rollPick(st,999).forEach(([a,b])=>{if(g[a]===gmin&&g[b]===gmin)det.push([a,b])});
  }
  const d=g.map(x=>R-x),forced=[];
  if(!d.some(x=>x<0)){
    for(let ch=true,guard=0;ch&&guard<200;guard++){
      ch=false;
      const D=d.reduce((x,y)=>x+y,0);
      for(let a=0;a<n&&!ch;a++)for(let b=a+1;b<n&&!ch;b++){
        if(d[a]<=0||d[b]<=0)continue;
        const m=Math.max(d[a],d[b])-(D-d[a]-d[b]);
        if(m>0){for(let q=0;q<m;q++)forced.push([a,b]);d[a]-=m;d[b]-=m;ch=true}
      }
    }
  }
  const cnt=new Map();det.forEach(([a,b])=>cnt.set(key(a,b),(cnt.get(key(a,b))||0)+1));
  const extra=forced.filter(([a,b])=>{const k=key(a,b),c=cnt.get(k)||0;if(c>0){cnt.set(k,c-1);return false}return true});
  if(!det.length&&!extra.length)return[];
  const tmp=S.games.map(m=>({...m}));
  [...det,...extra].forEach(([a,b])=>tmp.push({a,b,sa:null,sb:null,c:0,k:99}));
  const I=rollInfo(tmp,n),base=S.games.length;
  return[...det.map(([a,b],i)=>({a,b,i,j:true})),...extra.map(([a,b],i)=>({a,b,i:det.length+i,j:false}))].map(e=>{
    const f=I[base+e.i];
    return{a:e.a,b:e.b,r:f.r,t:e.j?(f.x?(f.eq?"Ausgleichsspiel":"Zusatzspiel"):"Spiel "+f.j):"",o:e.i};
  }).sort((p,q)=>p.r-q.r||p.o-q.o);
}
const sureBox=(title,rows,note)=>rows.length?`<div class="sure"><div class="st">${title}</div>${rows.join("")}${note?`<div class="sn">${note}</div>`:""}</div>`:"";
/* Meldung bei „Platzierung abwarten“: nennt die laufenden Spiele, auf die gewartet wird (gleiche Spielzahl wie ein freier Spieler) */
function waitMsg(st,v){
  const lv=new Set([...Array(S.n).keys()].filter(i=>!st.busy.has(i)&&st.g[i]<S.R).map(i=>st.g[i]));
  const bl=S.games.map((m,i)=>[m,i]).filter(([m])=>!m.fin&&!done(m)&&lv.has(st.g[m.a]));
  const nm=i=>esc(S.names[i]);
  return bl.length?`Platz frei. Gewartet wird auf ${bl.map(([m,i])=>`${rollTag(v.I[i])} (${nm(m.a)}–${nm(m.b)})`).join(" und ")}, damit die Platzierung feststeht.`:"Platz frei. Es wird gewartet, bis die Platzierung der Wartenden feststeht, bitte Ergebnisse eintragen.";
}
function rollActions(){
  const v=rollView(),left=rollLeft()+helpLeft(),G=S.games.length+left,st=rollState(),fin=S.games.filter(done).length,pend=S.games.length-fin;
  rollTitle(v);
  const free=S.courts-st.courts.size,peek=free&&left?rollPick(st,free).length:0;
  $("#prog").textContent=`${fin} von ${G} Spielen beendet`;
  let h="";
  const now=S.wait&&left&&free&&!peek?rollPeekNow(st,free).length:0;
  if(left)h+=`<button onclick="rollGo()"${peek?"":" disabled"}>${peek>1?peek+" Spiele ansetzen":"Spiel ansetzen"}</button>`;
  if(now)h+=`<button class="${forceArmed?"danger":"quiet"}" onclick="rollForce()" title="Setzt ${now===1?"das Spiel":"die Spiele"} jetzt an, ohne auf die Platzierung zu warten. Der Modus bleibt.">${forceArmed?"Ohne Abwarten ansetzen: wirklich?":`Trotzdem jetzt ansetzen${now>1?" ("+now+")":""}`}</button>`;
  if(lastBlock()>=1){const nb=S.games.filter(m=>m.k===lastBlock()).length;h+=`<button class="${undoArmed?"danger":"quiet"}" onclick="rollUndo()" title="Verwirft die zuletzt angesetzten ${nb} ${nb===1?"Spiel":"Spiele"} und öffnet den Block davor zum Korrigieren">${undoArmed?`${nb} ${nb===1?"Spiel":"Spiele"} wirklich verwerfen?`:"Letzte Ansetzung zurücknehmen"}</button>`}
  const msg=!left?(pend?`Noch ${pend} ${pend===1?"Ergebnis":"Ergebnisse"} offen.`:"Alle Spiele gespielt."):
    peek?`${free} ${free===1?"Platz":"Plätze"} frei, ${peek===1?"ein Spiel kann":peek+" Spiele können"} angesetzt werden.`:
    free?(S.wait?waitMsg(st,v):"Platz frei. Es fehlen noch passende Gegner, bitte Ergebnisse eintragen."):"Alle Plätze belegt.";
  h+=`<span class="status">${msg}</span>`;
  const sure=rollSure();
  h+=sureBox(sure.length===rollLeft()?(left===1?"Das letzte Spiel steht fest":`Die letzten ${rollLeft()} Spiele stehen fest`):sure.length===1?"Dieses Spiel steht schon fest":"Diese Spiele stehen schon fest",sure.map(g=>`<div class="sr"><span class="sl">Runde ${g.r}${g.t?", "+g.t:""}</span><span>${esc(S.names[g.a])} – ${esc(S.names[g.b])}</span></div>`),"Die Paarung hängt nicht mehr von den laufenden Spielen ab.");
  $("#act").innerHTML=h;
  syncSO();$("#champ").innerHTML=champHtml();renderSO();renderOut();
}
function rollHist(){
  const v=rollView(),I=v.I,P=rollPauses(S.games,I,S.n),nm=i=>esc(S.names[i]);
  const openR=new Set([...document.querySelectorAll("#hist details[open]")].map(d=>d.dataset.r));
  const fin=S.games.map((m,i)=>[m,i]).filter(([m,i])=>done(m)&&!v.shown.has(i)),rs=[...new Set(fin.map(([m,i])=>I[i].r))].sort((a,b)=>a-b);
  $("#histc").hidden=!fin.length;
  $("#histc .hint").textContent="Abgeschlossene Spiele sind gesperrt. Zum Korrigieren mit „Letzte Ansetzung zurücknehmen“ zurückgehen.";
  $("#hist").innerHTML=rs.map(r=>`<details data-r="${r}"${openR.has(String(r))?" open":""}><summary>Runde ${r}</summary><div class="rows">`+
    fin.filter(([m,i])=>I[i].r===r).sort((p,q)=>I[p[1]].x-I[q[1]].x||p[1]-q[1]).map(([m,i])=>`<div class="mw ${rcOf(r)}"><span class="tag">Runde ${r}, ${I[i].x?(I[i].eq?"Ausgleichsspiel":"Zusatzspiel"):"Spiel "+I[i].j} · ${esc(cname(m.c))}</span><div class="r"><span class="a ${m.sa>m.sb?"win":""}">${nm(m.a)}</span><span class="sc">${m.sa} : ${m.sb}</span><span class="b ${m.sb>m.sa?"win":""}">${nm(m.b)}</span></div></div>`).join("")+(P[r]?`<p class="note">Pausiert: ${P[r].map(nm).join(", ")}</p>`:"")+`</div></details>`).join("");
}
/* Plan bei überlappenden Runden: ein Feld pro Spiel und Platz, in Ansetzungsreihenfolge, mit Rundenköpfen */
function planRoll(n,R,c,dur,brk,games){
  const step=dur+brk,per=Array.from({length:c},()=>[]),I=rollInfo(games,n),P=rollPauses(games,I,n);
  rollRows(games,c).forEach((r,i)=>{per[games[i].c][r]=[games[i],i]});
  const gh=rollGhosts(n,R,I).slice(0,S&&games===S.games?rollLeft()+helpLeft():n*R/2-games.length),seen=new Set();let gi=0;
  /* feststehende Spiele (rollSure) in den freien Feldern mit Namen zeigen */
  if(S&&games===S.games){
    const used=new Set();
    rollSure().forEach(g=>{
      let k=gh.findIndex((f,q)=>!used.has(q)&&f.r===g.r&&(g.t?((g.t==="Zusatzspiel"||g.t==="Ausgleichsspiel")?f.x:(!f.x&&"Spiel "+f.j===g.t)):true));
      if(k<0)k=gh.findIndex((f,q)=>!used.has(q)&&f.r===g.r);
      if(k>=0){used.add(k);gh[k].pair=[g.a,g.b];if(!g.t)gh[k].lab="Runde "+g.r}
    });
  }
  const head=r=>`<div class="rh rcb ${rcOf(r)}${seen.size?"":" first"}">Runde ${r}<span>${actN(n)%2?(P[r]?"Pause: "+P[r].map(i=>esc(S.names[i])).join(", "):"Pause: 1 Spieler"):""}</span></div>`;
  let h=`<div class="plan" style="--cols:${c}"><div class="tm">${T0()!=null?"Uhrzeit":"Beginn"}</div>`+[...Array(c).keys()].map(k=>`<div class="ph">${esc(cname(k))}</div>`).join("");
  if(wu()){const b=T0();h+=`<div class="tm">${b==null?"0:00":hhmm(b)}</div><div class="warm" style="grid-column:2/-1">Aufwärmen · ${wu()} min</div>`}
  PCUR=-1;
  for(let r=0;per.some(a=>a.length>r)||gi<gh.length;r++){
    const cells=[];
    for(let k=0;k<c;k++){
      const e=per[k][r];
      cells.push(e?{e,f:I[e[1]]}:gi<gh.length&&per[k].length<=r?{f:gh[gi++]}:null);
    }
    [...new Set(cells.filter(Boolean).map(x=>x.f.r))].sort((a,b)=>a-b).forEach(rd=>{if(!seen.has(rd)){h+=head(rd);seen.add(rd)}});
    if(PCUR<0&&cells.some(x=>x&&(!x.e||!done(x.e[0]))))PCUR=r;
    h+=`<div class="tm" data-r="${r}">${tt(r,step)}</div>`;
    cells.forEach(x=>{h+=!x?"<div></div>":x.f.pair?planCell({a:x.f.pair[0],b:x.f.pair[1],sa:null,sb:null},{t:"m"},false,x.f.lab||rollTag(x.f),x.f.r-1).replace('class="cell','class="cell fixd'):planCell(x.e?x.e[0]:null,{t:"m"},!!x.e&&!done(x.e[0]),rollTag(x.f),x.f.r-1)});
  }
  if(PCUR<0)PCUR=0;
  return h+"</div>";
}
/* Spielplan-Grafik: ohne Turnier anonym, mit Turnier gefüllt mit Namen und Ergebnissen */
const clk=t=>Math.floor(t/60)+":"+String(t%60).padStart(2,"0");
/* „Runde 2, Spiel 1“ → [„Runde 2,“, „Spiel 1“] (ohne Lookbehind, damit auch ältere Safari-Versionen die Seite laden) */
const tagParts=t=>t.split(", ").map((x,i,a)=>i<a.length-1?x+",":x);
function planCell(m,it,cur,lab,rc){
  const c=rc==null?"":" rc"+rc%6;
  if(!m)return`<div class="cell ghost${c}">${lab?`<span class="tag">${tagParts(lab).map(x=>`<span>${x}</span>`).join(" ")}</span>`:"Spiel"}</div>`;
  const d=done(m),sc=v=>v==null?"":v,wa=d&&m.sa>m.sb,wb=d&&m.sb>m.sa;
  return`<div class="cell${cur?" cur":""}${c}">${lab?`<span class="tag">${tagParts(lab).map(x=>`<span>${x}</span>`).join(" ")}</span>`:""}<div class="pl${wa?" w":""}"><span>${esc(S.names[m.a])}</span><b>${sc(m.sa)}</b></div><div class="pl${wb?" w":""}"><span>${esc(S.names[m.b])}</span><b>${sc(m.sb)}</b></div></div>`;
}
/* Zeiten anpassen: Startzeit, Aufwärmen und Verzögerungen ab der aktuellen Zeile */
function timeCtl(){
  const el=document.getElementById("tctl");if(!el)return;
  if(!S||VIEW){el.innerHTML="";return}
  const d=dly(1e9),b=(t,f)=>`<button class="quiet" onclick="${f}">${t}</button>`;
  el.innerHTML=`<div class="tctl"><label>Startzeit <input type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="hh:mm" size="6" value="${S.t0==null?"":hhmm(S.t0)}" onchange="setT0(this.value)" aria-label="Startzeit, 24-Stunden-Format"></label>
    <label>Aufwärmen <select onchange="setWu(+this.value)">${[0,5,10,15,20,30,45,60].map(x=>`<option value="${x}"${x===(S.wu||0)?" selected":""}>${x?x+" min":"keins"}</option>`).join("")}</select></label>
    <span class="dl">Verzögerung ab jetzt: ${b("−5 min","addDelay(-5)")}${b("+5 min","addDelay(5)")}${b("+10 min","addDelay(10)")}${d?b("Zurücksetzen","resetDelay()"):""}<span class="hint">Markierte Zeile (▶ ${tt(PCUR,(S.dur||20)+(S.brk==null?5:S.brk))}): „+5 min“ verschiebt diese und alle späteren Zeiten um 5 Minuten.${d?" Insgesamt "+(d>0?"+":"")+d+" min gegenüber dem Plan.":""}</span></span></div>`;
}
function setT0(v){const t=tparse(v);if(t==null)delete S.t0;else S.t0=t;save();render()}
function setWu(v){S.wu=v;save();render()}
function addDelay(m){S.dl=S.dl||{};const k=PCUR;S.dl[k]=Math.max(-240,Math.min(240,(S.dl[k]||0)+m));if(!S.dl[k])delete S.dl[k];save();render()}
function resetDelay(){delete S.dl;save();render()}
function markNow(el){const q=el.querySelector('.tm[data-r="'+PCUR+'"]');if(q&&S&&!VIEW)q.classList.add("now")}
function renderPlan(){
  const el=$("#plan");if(!el)return;
  const n=S?S.n:+$("#n").value,R=S?S.R:+$("#r").value,mx=Math.floor(n/2);
  const c=S?Math.min(mx,S.courts||mx):Math.min(mx,+$("#c").value||1);
  const dur=S?(S.dur||20):+$("#dur").value,brk=S?(S.brk==null?5:S.brk):+$("#brk").value;
  if(S?S.ov:$("#ov").value!=="no"){el.innerHTML=planRoll(n,R,c,dur,brk,S?S.games:[]);markNow(el);timeCtl();return}
  const bl=schedule(n,R,c),step=dur+brk,ordered={};
  const ord=r=>ordered[r]||(ordered[r]=ordM(r));
  let h=`<div class="plan" style="--cols:${c}"><div class="tm">${T0()!=null?"Uhrzeit":"Beginn"}</div>`+[...Array(c).keys()].map(k=>`<div class="ph">${esc(cname(k))}</div>`).join("");
  if(wu()){const b=T0();h+=`<div class="tm">${b==null?"0:00":hhmm(b)}</div><div class="warm" style="grid-column:2/-1">Aufwärmen · ${wu()} min</div>`}
  let lr=-1;PCUR=-1;
  bl.forEach((b,i)=>{
    const rd=S&&S.rounds[b.r];
    if(b.r!==lr){lr=b.r;h+=`<div class="rh rcb ${rcOf(b.r+1)}${b.r===0?" first":""}">Runde ${b.r+1}<span>${n%2?(rd?(rd.bye!=null?"Pause: "+esc(S.names[rd.bye]):""):"Pause: 1 Spieler"):""}</span></div>`}
    h+=`<div class="tm" data-r="${i}">${tt(i,step)}</div>`;
    for(let k=0;k<c;k++){
      const it=b.items[k];if(!it){h+="<div></div>";continue}
      const pm=rd?(it.t==="x"?rd.x:ord(b.r)[it.j]):null;
      if(PCUR<0&&(!pm||!done(pm)))PCUR=i;
      h+=planCell(pm,it,!!S&&b.r===S.rounds.length-1,it.t==="x"?`Runde ${b.r+1}, Zusatzspiel`:`Runde ${b.r+1}, Spiel ${(pm?rd.m.indexOf(pm):it.j)+1}`,b.r);
    }
  });
  if(PCUR<0)PCUR=0;
  el.innerHTML=h+"</div>";markNow(el);timeCtl();
}
try{render()}catch(e){/* beschädigter Speicherstand: verwerfen und neu beginnen */S=null;try{localStorage.removeItem(KEY)}catch(_){}render()}
/* Live-Ansicht: Mit der Fähigkeit „db“ stellt die Seite den Spielstand für Zuschauer bereit (nur lesen, Dokument live/state).
   Wer die Seite bearbeiten darf, stellt bereit. Alle anderen sehen den Stand, solange sie kein eigenes Turnier laufen haben.
   Ohne die Fähigkeit passiert nichts, die Seite arbeitet wie bisher. Spätere Erweiterung (Beitreten, Ergebnisse eintragen) kann auf live/ aufbauen. */
function pushLive(){
  if(!liveDoc||!liveCan||VIEW)return;
  clearTimeout(liveTimer);
  liveTimer=setTimeout(()=>{
    try{
      const p=S?liveDoc.set({json:JSON.stringify(S),updated:Date.now()}):liveDoc.delete();
      Promise.resolve(p).then(()=>{if(liveMsg){liveMsg="";renderLiveBar()}},()=>{liveMsg="Die Live-Ansicht konnte nicht aktualisiert werden.";renderLiveBar()});
    }catch(e){}
  },700);
}
function lockView(){document.querySelectorAll("#app input,#app select,#app textarea,#app button").forEach(e=>{if(!/copyTable|toggleCols/.test(e.getAttribute("onclick")||"")&&e.id!=="mineSel")e.disabled=true})}
function viewStart(){if(!liveRemote)return;VIEW=true;S=liveRemote;render()}
function viewEnd(){VIEW=false;S=null;try{const j=localStorage.getItem(KEY);if(j){const x=JSON.parse(j);if(okState(x))S=x}}catch(e){}render()}
function takeOver(){if(!liveRemote||!liveCan)return;VIEW=false;S=liveRemote;save();render()}
function renderLiveBar(){
  const el=$("#livebar");if(!el)return;
  const b=(t,f,q)=>`<button class="${q?"":"quiet"}" onclick="${f}()">${t}</button>`;
  const at=liveAt?" · Stand "+hhmm(new Date(liveAt).getHours()*60+new Date(liveAt).getMinutes())+" Uhr":"";
  el.innerHTML=VIEW?`<span><b>Live</b>${liveCan&&!liveRemote?" (Vorschau)":at} · aktualisiert sich automatisch</span>${liveCan?b("Beenden","viewEnd")+(liveRemote?b("Hier weiterführen","takeOver"):""):""}`:
    (!S&&liveRemote&&liveCan)?`<span>Es läuft ein Turnier.</span>${b("Live ansehen","viewStart",1)}${b("Hier weiterführen","takeOver")}`:
    (!S&&liveRemote)?`<span>Es läuft ein Turnier.</span>${b("Live ansehen","viewStart",1)}`:
    (S&&liveCan&&liveDoc)?`<span>Live-Ansicht aktiv: Wer den Link über „Teilen“ geöffnet bekommt, sieht den Stand automatisch.${liveMsg?" "+liveMsg:""}</span>${b("So sehen es die Spieler","previewView")}`:"";
}
async function liveInit(){
  try{
    if(!window.claude||typeof window.claude.use!=="function"){liveBoot=false;return}
    const db=await window.claude.use("db");if(!db){liveBoot=false;render();return}
    try{const u=await window.claude.use("user");liveCan=!!(u&&u.canEdit&&u.canEdit())}catch(e){}
    liveDoc=db.doc("live/state");
    liveDoc.onSnapshot(snap=>{
      let st=null;
      try{if(snap.exists){st=JSON.parse(snap.data().json);if(!okState(st))st=null}}catch(e){st=null}
      liveRemote=st;try{liveAt=snap.exists&&snap.data().updated||0}catch(e){liveAt=0}
      if(VIEW){if(st){S=st;render()}else if(liveCan)viewEnd();else{S=null;VIEW=false;render()}}
      else if(!S&&st&&!liveCan){viewStart()}
      else{renderLiveBar();if(!S&&!liveCan)render()}
    },()=>{});
    if(S&&liveCan)pushLive();
    liveBoot=false;render();
  }catch(e){liveBoot=false;render()}
}
liveInit();
setTimeout(()=>{if(liveBoot){liveBoot=false;render()}},5000);
