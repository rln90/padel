/* ===== Online-Oberfläche: Beitritt, eigene Ergebnisse, Organisator. Läuft gegen den Server (/api/t) und nutzt Engine und Zuschaueransicht. ===== */
(function(){
"use strict";
const API="/api/t",CODE_OK=/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;
let seq=0,applied=0,CODE=null,TOK={p:null,a:null,pid:null},D=null,ver=-1,netErr="",flash=null,armed=null,armT=null,pollT=null,fails=0,inflight=false,gen=0;
const OPEN=new Set(),mem={};

/* ---------- Hilfen ---------- */
const q=s=>document.querySelector(s);
const tokKey=c=>"padel-online-"+c;
function loadTok(c){let o=null;try{o=JSON.parse(localStorage.getItem(tokKey(c))||"null")}catch(e){o=mem[c]||null}
  o=o&&typeof o==="object"?o:{};return{p:typeof o.p==="string"?o.p:null,a:typeof o.a==="string"?o.a:null,pid:Number.isInteger(o.pid)?o.pid:null}}
function saveTok(){if(!CODE)return;const s=JSON.stringify(TOK);mem[CODE]=JSON.parse(s);try{localStorage.setItem(tokKey(CODE),s)}catch(e){}}
function dropTok(c){delete mem[c];try{localStorage.removeItem(tokKey(c))}catch(e){}}
const isAdm=()=>!!(D&&D.role==="admin");
const myIdx=()=>D&&TOK.pid!=null?D.players.findIndex(p=>p.id===TOK.pid):-1;
/* Hinweis auf ein neu angesetztes eigenes Spiel: SEEN = schon bekannte offene Spiele (Spielnummern), NEWG = Spiel, auf das hingewiesen wird */
let SEEN=null,SEENCODE=null,NEWG=null;const TITLE0=document.title;
const pname=id=>{const p=D&&D.players.find(p=>p.id===id);return p?p.name:"?"};
const origin=()=>location.origin&&location.origin!=="null"?location.origin:"";
const playerLink=()=>origin()+"/#"+CODE;
const adminLink=()=>origin()+"/#"+CODE+"/"+TOK.a;
let flT=null;
const say=(msg,err)=>{flash=msg?{msg,err:!!err}:null;paintFlash();clearTimeout(flT);if(msg)flT=setTimeout(()=>{flash=null;paintFlash()},err?12000:5000)};

async function api(method,path,body,tok){
  const ctl=typeof AbortController!=="undefined"?new AbortController():null,tm=setTimeout(()=>ctl&&ctl.abort(),12000);
  try{
    const h={};if(tok)h.authorization="Bearer "+tok;
    const init={method,headers:h,cache:"no-store"};if(ctl)init.signal=ctl.signal;
    if(method==="POST"){h["content-type"]="application/json";init.body=JSON.stringify(body||{})}
    const r=await fetch(API+path,init);let j=null;try{j=await r.json()}catch(e){}
    return{status:r.status,j:j&&typeof j==="object"?j:{ok:false,msg:"Unerwartete Antwort vom Server."},net:false};
  }catch(e){return{status:0,j:{ok:false,msg:"Keine Verbindung zum Server."},net:true}}
  finally{clearTimeout(tm)}
}
const tokFor=mode=>mode==="admin"?TOK.a:mode==="none"?null:(TOK.p||TOK.a);

const changed=e=>e.tagName==="SELECT"?(e.selectedIndex!==[...e.options].findIndex(o=>o.defaultSelected)):e.value!==e.defaultValue;
/* Eingaben beim Neuaufbau erhalten */
function keepDrafts(fn){
  const keep={},act=document.activeElement,ak=act&&act.dataset?act.dataset.d:null;
  let ss=null,se=null;if(ak&&"selectionStart" in act){try{ss=act.selectionStart;se=act.selectionEnd}catch(e){}}
  document.querySelectorAll("#onl [data-d],#onl2 [data-d]").forEach(e=>{if(changed(e))keep[e.dataset.d]=e.value});
  document.querySelectorAll("#onl details[data-k],#onl2 details[data-k]").forEach(d=>{if(d.open)OPEN.add(d.dataset.k);else OPEN.delete(d.dataset.k)});
  fn();
  document.querySelectorAll("#onl [data-d],#onl2 [data-d]").forEach(e=>{if(e.dataset.d in keep)e.value=keep[e.dataset.d]});
  if(ak){const e=document.querySelector('[data-d="'+ak+'"]');if(e){try{e.focus({preventScroll:true});if(ss!=null&&e.setSelectionRange)e.setSelectionRange(ss,se)}catch(x){}}}
}
const val=k=>{const e=document.querySelector('[data-d="'+k+'"]');return e?e.value:""};
function arm(key){armed=key;clearTimeout(armT);armT=setTimeout(()=>{armed=null;paintPanels()},6000);paintPanels()}
const disarm=()=>{armed=null;clearTimeout(armT)};
const btn=(act,label,o={})=>`<button class="${o.q?"quiet ":""}${o.danger?"danger":""}"${o.attr?" "+o.attr:""} data-act="${act}"${o.dis?" disabled":""}>${esc(label)}</button>`;
const sure=(key,act,label,sureLabel,o={})=>armed===key?btn(act,sureLabel,{danger:true,attr:o.attr}):btn("arm",label,{q:true,attr:'data-key="'+key+'" '+(o.attr||"")});

/* ---------- Routing und Abruf ---------- */
function route(){
  const m=/^#([A-Za-z0-9]{6})(?:\/(a_[A-Za-z0-9_-]{20,60}))?$/.exec(location.hash||"");
  const code=m?m[1].toUpperCase():null;
  gen++;clearTimeout(pollT);D=null;ver=-1;netErr="";flash=null;disarm();fails=0;
  if(!code||!CODE_OK.test(code)){CODE=null;TOK={p:null,a:null,pid:null};paintAll();if(location.hash.length>1)say("Dieser Code ist ungültig. Bitte prüfen.",true);return}
  CODE=code;TOK=loadTok(code);
  if(m[2]){TOK.a=m[2];saveTok();try{history.replaceState(null,"","#"+code)}catch(e){}}
  paintAll();poll(true);
}
async function poll(force){
  if(!CODE||(inflight&&!force))return;
  inflight=true;const my=gen,sq=++seq;
  const tok=TOK.a||TOK.p,r=await api("GET","/"+CODE+"/state"+(!force&&ver>=0?"?since="+ver:""),null,tok);
  if(sq===seq)inflight=false;
  if(my!==gen||sq<applied)return;applied=sq;
  if(r.net||r.status>=500||r.status===429){fails++;netErr=r.j.msg||"Verbindungsproblem.";paintFlash()}
  else if(r.status===404){dropTok(CODE);CODE=null;D=null;TOK={p:null,a:null,pid:null};gen++;
    try{history.replaceState(null,"","#")}catch(e){}paintAll();say("Dieses Turnier gibt es nicht (mehr). Bitte den Code prüfen.",true);return}
  else if(r.status===401||!r.j.ok){fails++;netErr=r.j.msg||"Fehler.";paintFlash()}
  else{
    fails=0;netErr="";const j=r.j;
    if(j.badToken){ /* Zugang ungültig: gespeicherten Zugang verwerfen und neu laden */
      if(TOK.a&&tok===TOK.a)TOK.a=null;else TOK.p=null;TOK.pid=TOK.p?TOK.pid:null;saveTok();
      say("Dein Zugang gilt nicht mehr. Bitte neu beitreten oder den Organisator um Freigabe bitten.",true);ver=-1;schedule(500);return}
    if(!j.same&&D&&j.code===D.code&&j.ver<D.ver){schedule();return}
    if(!j.same){D=j;ver=j.ver;if(TOK.pid!=null&&!D.players.some(p=>p.id===TOK.pid)){TOK.pid=null;TOK.p=null;saveTok()}paintAll()}
    else paintFlash();
  }
  schedule();
}
function schedule(ms){clearTimeout(pollT);const my=gen;
  const base=document.hidden?15000:3000,w=ms||Math.min(20000,base*Math.pow(1.6,Math.min(fails,5)));
  pollT=setTimeout(()=>{if(my===gen)poll(false)},w)}
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&CODE){clearTimeout(pollT);poll(false)}});
window.addEventListener("hashchange",route);

/* ---------- Darstellung ---------- */
function paintFlash(){
  const e=q("#onlmsg");if(!e)return;
  const t=netErr?{msg:netErr+" Neuer Versuch läuft …",err:true}:flash;
  e.className="onlmsg"+(t&&t.err?" err":"");e.textContent=t?t.msg:"";e.hidden=!t;
}
function syncS(){const on=!!(D&&D.S&&D.status!=="lobby");S=on?D.S:null;VIEW=on}
function paintAll(){syncS();paintPanels();paintViewer()}
function paintViewer(){
  const app=q("#app"),lb=q("#livebar");
  document.body.classList.toggle("onl-me",myIdx()>=0);
  if(S){
    const mi=myIdx();if(mi>=0)MINE=String(mi);
    app.hidden=false;render();
  }else{app.hidden=true;app.innerHTML="";lb.innerHTML="";q("#tl").textContent="Einzel im Schweizer System"}
}
function trackNew(){
  if(SEENCODE!==CODE){SEEN=null;SEENCODE=CODE;NEWG=null}
  const mi=D?myIdx():-1;
  if(!D||mi<0||D.players[mi].out||D.status==="finished"){NEWG=null;if(!D||D.status!=="lobby")SEEN=null;titleNew();return}
  if(D.status==="lobby"){SEEN=new Set();NEWG=null;titleNew();return}
  const cur=gamesOf().filter(g=>(g.m.a===mi||g.m.b===mi)&&!done(g.m)).map(g=>g.m.gid);
  if(SEEN===null)SEEN=new Set(cur); /* erster Stand nach dem Laden: kein Hinweis */
  const fresh=cur.filter(id=>!SEEN.has(id));
  cur.forEach(id=>SEEN.add(id));
  if(fresh.length){NEWG=fresh[0];try{if(navigator.vibrate)navigator.vibrate([200,100,200])}catch(e){}}
  if(NEWG!==null&&!cur.includes(NEWG))NEWG=null;
  titleNew();
}
function titleNew(){try{document.title=NEWG!==null?"● Dein Spiel · "+TITLE0:TITLE0}catch(e){}}
function paintPanels(){
  syncS();trackNew();
  keepDrafts(()=>{
    const a=q("#onl"),b=q("#onl2");
    let top='<div id="onlmsg" class="onlmsg" role="status" aria-live="polite" hidden></div>',bot="";
    if(!CODE)top+=landing();
    else if(!D)top+='<p class="hint wait0">Lädt …</p>';
    else if(D.status==="lobby")top+=lobby();
    else{top+=finalPanel()+(isAdm()&&myIdx()<0?adminPanel()+playerPanel():playerPanel()+adminPanel());bot=bottom()+`<section class="panel">${rulesBox()}</section>`}
    a.innerHTML=top;b.innerHTML=bot;paintFlash();
  });
  if(D&&D.status==="lobby"&&isAdm()&&q("#sum")){try{syncSetup()}catch(e){}}
}

/* Startseite: Code eingeben oder neues Turnier anlegen */
function landing(){
  return`<section class="panel"><h2>Turnier beitreten</h2>
    <p class="hint">Den Code oder Link bekommst du vom Organisator.</p>
    <div class="field"><label for="codeIn">Turniercode</label><input id="codeIn" data-d="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="z. B. K7MQ2X"></div>
    <div class="actions">${btn("goto","Weiter")}</div></section>
    <details class="panel" id="newT"><summary>Neues Turnier anlegen (Organisator)</summary>
      <div class="field"><label for="ckey">Schlüssel</label><input id="ckey" data-d="ckey" type="password" autocomplete="off" placeholder="Schlüssel des Organisators"></div>
      <div class="actions">${btn("create","Turnier anlegen")}</div>
      <p class="hint">Den Schlüssel legst du bei der Einrichtung des Servers fest. Danach bekommst du den Code für die Spieler und deinen Organisator-Link.</p>
      <details class="restore"><summary>Aus Sicherung wiederherstellen</summary>
        <p class="hint">Lädt eine zuvor heruntergeladene Sicherung als neues Turnier. Es bekommt einen neuen Code und neue Links; alle Spieler tragen ihren Namen wieder ein und sind dann sofort wieder dabei.</p>
        <div class="field"><label for="rfile">Sicherungsdatei (.json)</label><input id="rfile" type="file" accept=".json,application/json"></div>
        <div class="actions">${btn("restore","Wiederherstellen",{q:true})}</div></details></details>`;
}

/* Warteraum */
/* QR-Code als Vektorgrafik (Bibliothek: src/vendor/qrcode.min.js). Immer schwarz auf weiß mit Ruhezone, auch im dunklen Modus. */
const QRC={};
function qrSvg(text){
  if(QRC[text]!==undefined)return QRC[text];
  let h="";
  try{
    const q=qrcode(0,"M");q.addData(text);q.make();
    const n=q.getModuleCount(),m=4,s=n+2*m;let d="";
    for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(q.isDark(r,c))d+=`M${c+m} ${r+m}h1v1h-1z`;
    h=`<svg class="qr" viewBox="0 0 ${s} ${s}" role="img" aria-label="QR-Code mit dem Link für die Spieler" shape-rendering="crispEdges"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }catch(e){h=""}
  QRC[text]=h;return h;
}
const qrBox=()=>{const s=qrSvg(playerLink());return s?`<div class="qrbox">${s}<p class="hint">Zum Beitreten mit der Handy-Kamera scannen.</p></div>`:""};
function codeBox(){
  const adm=isAdm();
  return`<section class="panel"><div class="head"><h2>Turnier ${esc(CODE)}</h2><span class="meta">Warteraum</span></div>
    <p class="hint">Link für die Spieler. Wer ihn öffnet, trägt seinen Namen ein.</p>
    <div class="linkrow"><input readonly value="${esc(playerLink())}" data-sel aria-label="Link für die Spieler">${btn("copy","Kopieren",{q:true,attr:'data-text="'+esc(playerLink())+'"'})}</div>
    ${qrBox()}
    ${adm?`<p class="hint">Dein Organisator-Link. Er ist der einzige Weg zurück in die Verwaltung, etwa mit einem anderen Gerät. Nicht weitergeben.</p>
    <div class="linkrow"><input readonly value="${esc(adminLink())}" data-sel aria-label="Organisator-Link">${btn("copy","Kopieren",{q:true,attr:'data-text="'+esc(adminLink())+'"'})}</div>`:""}</section>`;
}
function lobby(){
  const adm=isAdm(),mi=myIdx(),n=D.players.length;
  let h=codeBox();
  if(mi<0){
    h+=`<section class="panel"><h2>${adm?"Selbst mitspielen":"Beitreten"}</h2>
      <div class="field"><label for="nameIn">${adm?"Dein Spielername":"Dein Name"}</label><input id="nameIn" data-d="name" maxlength="24" autocomplete="nickname" placeholder="Name eingeben"></div>
      <div class="actions">${btn("join",adm?"Als Spieler eintragen":"Beitreten")}</div>
      <p class="hint">${adm?"Als Organisator trägst du Ergebnisse immer ein. Mit einem Spielernamen spielst du selbst mit.":D.cfg.closed?"Die Anmeldung ist geschlossen. Bitte den Organisator fragen.":"Der Organisator kann deinen Namen später ändern."}</p></section>`;
  }else{
    h+=`<section class="panel"><h2>Du bist dabei</h2>
      <div class="field"><label for="renIn">Dein Name</label><input id="renIn" data-d="ren" maxlength="24" value="${esc(D.players[mi].name)}"></div>
      <div class="actions">${btn("rename","Namen ändern",{q:true})}${btn("leave","Austragen",{q:true})}</div>
      <p class="hint">Warte, bis der Organisator das Turnier startet. Diese Seite aktualisiert sich selbst.</p></section>`;
  }
  h+=`<section class="panel"><div class="head"><h2>Spieler</h2><span class="meta">${n} von 24${n<4?", mindestens 4":""}</span></div>
    ${n?`<ul class="plist">${D.players.map((p,i)=>playerLi(p,i,adm,mi)).join("")}</ul>`:'<p class="hint">Noch niemand eingetragen.</p>'}
    ${adm?`<div class="actions">${btn("lock",D.cfg.closed?"Anmeldung wieder öffnen":"Anmeldung schließen",{q:true})}</div><p class="hint">${D.cfg.closed?"Die Anmeldung ist geschlossen: niemand kann mehr über den Link beitreten. Du kannst weiter Spieler selbst eintragen.":"Wenn alle da sind, schließe die Anmeldung. Dann kann niemand mehr unerwünscht beitreten."}</p><div class="field"><label for="addIn">Spieler selbst eintragen</label><div class="linkrow"><input id="addIn" data-d="add" maxlength="24" placeholder="Name">${btn("add","Hinzufügen",{q:true})}</div></div>`:""}</section>`;
  h+=`<section class="panel">${rulesBox()}</section>`;
  if(adm)h+=configPanel(n)+`<section class="panel"><div class="actions">${sure("start","start","Turnier starten","Wirklich starten? Danach kann niemand mehr beitreten.",{attr:n<4?"disabled":""})}</div>
    <p class="hint">${n<4?"Zum Start braucht es mindestens 4 Spieler.":"Beim Start werden Runde 1 oder die ersten Spiele ausgelost."}</p></section>`;
  return h;
}
/* Ein Spieler im Organisator-Bereich: Name lesbar, Bearbeiten klappt Feld und Knöpfe auf */
function pedit(p,badge,extra){
  return`<details class="pe" data-k="pe${p.id}"${OPEN.has("pe"+p.id)?" open":""}><summary><span class="pn">${esc(p.name)}${badge}</span><span class="pb">Bearbeiten</span></summary><div class="pctl full"><input data-d="pn${p.id}" maxlength="24" value="${esc(p.name)}" aria-label="Name ${esc(p.name)}">${btn("prename","Speichern",{attr:'data-pid="'+p.id+'"'})}${extra||""}</div></details>`;
}
function playerLi(p,i,adm,mi){
  const badge=(i===mi?' <span class="gone">du</span>':"")+(p.released?' <span class="gone">Zugang frei</span>':"")+(!p.taken&&!p.released?' <span class="gone">vom Organisator eingetragen</span>':"");
  if(!adm)return`<li><span class="pn">${esc(p.name)}${badge}</span></li>`;
  return`<li class="adm-li">${pedit(p,badge,btn("kick","Entfernen",{q:true,attr:'data-pid="'+p.id+'"'}))}</li>`;
}

/* Einstellungen (Warteraum): gleiche Felder und gleiche Berechnung wie in der Offline-Einrichtung (syncSetup) */
const opts=(arr,cur)=>arr.map(([v,t])=>`<option value="${esc(v)}"${String(v)===String(cur)?" selected":""}>${esc(t)}</option>`).join("");
const fld=(id,label,arr,cur,extra="")=>`<div class="field"${extra}><label for="${id}">${label}</label><select id="${id}" data-d="${id}">${opts(arr,cur)}</select></div>`;
/* Ein Feld pro Platz (höchstens 12); nur so viele sichtbar, wie Plätze gebucht sind */
function courtInputs(count,cn){
  return`<div class="cnl" id="cnl">${Array.from({length:12},(_,i)=>`<input type="text" maxlength="24" autocomplete="off" data-d="cn${i}" placeholder="Platz ${i+1}" aria-label="Name Platz ${i+1}" value="${esc((cn||[])[i]||"")}"${i>=count?" hidden":""}>`).join("")}</div>`;
}
function readCourts(count){
  const a=[];for(let i=0;i<Math.min(12,count);i++)a.push(val("cn"+i).trim());
  while(a.length&&!a[a.length-1])a.pop();return a;
}
function configPanel(n){
  const c=D.cfg,N=Math.max(MINN,n),mx=Math.floor(N/2),R=validR(N,c.R),cc=Math.min(mx,c.courts);
  return`<details class="panel cfg"${OPEN.has("cfg")?" open":""} data-k="cfg"><summary>Einstellungen</summary>
    <input type="hidden" id="n" value="${N}"><p id="pleg" hidden></p>
    ${n<MINN?`<p class="hint">Die Berechnung unten gilt für ${MINN} Spieler, bis genug Spieler eingetragen sind.</p>`:""}
    <fieldset class="grp"><legend>Runden und Plätze</legend><div class="grid">
      ${fld("r","Runden",roundOpts(N).map(r=>[r,r+" Runden"]),R)}
      ${fld("c","Plätze",[...Array(mx).keys()].map(k=>[k+1,(k+1)+" "+(k?"Plätze":"Platz")]),cc)}
    </div></fieldset>
    <fieldset class="grp"><legend>Ablauf</legend><div class="grid">
      ${fld("ov","Runden überlappen",[["no","Nein, Runde für Runde"],["yes","Ja, sofort weiter"],["wait","Ja, Platzierung abwarten"]],c.ov)}
      ${fld("lead","Vorsprung begrenzen",[[0,"Keine Grenze"],[1,"Höchstens 1 Spiel Vorsprung"],[2,"Höchstens 2 Spiele Vorsprung"]],c.lead,c.ov==="yes"?' id="leadf"':' id="leadf" hidden')}
    </div></fieldset>
    <fieldset class="grp"><legend>Spielzeit</legend><div class="grid">
      ${fld("lim","Zeitlimit pro Spiel",[["yes","Ja"],["no","Nein"]],c.lim?"yes":"no")}
      <div class="field"><label for="dur" id="durl">Spielzeit pro Spiel</label><select id="dur" data-d="dur">${opts(DURS.map(d=>[d,d+" min"]),c.dur)}</select></div>
      ${fld("draw","Unentschieden",[["yes","Erlaubt, Stand nach Zeitablauf"],["no","Nicht erlaubt"]],c.draw?"yes":"no")}
      ${fld("brk","Wechsel- und Pausenzeit",BRKS.map(d=>[d,d+" min"]),c.brk)}
    </div></fieldset>
    <fieldset class="grp"><legend>Uhrzeit und Buchung</legend><div class="grid">
      <div class="field"><label for="t0">Startzeit (optional)</label><input id="t0" data-d="t0" type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="hh:mm, z. B. 18:30" value="${c.t0==null?"":esc(hhmm(c.t0))}"></div>
      ${fld("wu","Aufwärmen vor dem ersten Spiel",[0,5,10,15,20,30].map(b=>[b,b?b+" min":"Kein Aufwärmen"]),c.wu)}
      ${fld("sec","Buchungssicherheit",[[50,"Knapp: reicht meist"],[75,"Normal: reicht fast immer"],[95,"Sicher: mit Reserve"]],75,c.ov==="no"?' id="secf" hidden':' id="secf"')}
    </div></fieldset>
    <fieldset class="grp"><legend>Namen und Ergebnisse</legend><div class="grid">
      <div class="field wide" id="cnw"><label>Platznamen (optional)</label>${courtInputs(cc,c.cn)}</div>
      ${fld("auto","Ergebnisse",[["reported","Ein Spieler trägt ein, das gilt sofort"],["confirmed","Der Gegner bestätigt"],["off","Nur ich trage ein und setze an"]],c.auto)}
    </div></fieldset>
    <p class="hint">Bei „Ein Spieler trägt ein“ gilt jedes Ergebnis sofort, die nächsten Spiele werden automatisch angesetzt. Du kannst jedes Ergebnis jederzeit ändern.</p>
    <div class="actions">${btn("config","Einstellungen speichern")}</div>
    <div id="sum" aria-live="polite"></div>
    <details class="cmp"><summary>Dauer nach Platzzahl vergleichen</summary><div id="ptab"></div></details></details>`;
}
const rulesBox=()=>RULES_HTML.replace(/^\s+/,"");

/* Spiele auflisten (aus dem Stand des Servers) */
function gamesOf(){
  const out=[];if(!S)return out;
  if(S.ov){let I=null;try{I=rollInfo(S.games,S.n)}catch(e){}
    S.games.forEach((m,i)=>out.push({m,locked:!!m.fin,tag:I&&I[i]?rollTag(I[i]):"Spiel "+(i+1),k:m.c,cls:I&&I[i]?rcOf(I[i].r):"rc0"}))}
  else S.rounds.forEach((r,ri)=>{const lk=ri<S.rounds.length-1,SL=classicSlots(ri);
    r.m.concat(r.x?[r.x]:[]).forEach((m,mi)=>{const s=SL.get(m);out.push({m,locked:lk,k:s?s.k:null,cls:"rc"+(ri%6),tag:r.fin||m===r.x?"Runde "+(ri+1)+", Zusatzspiel":"Runde "+(ri+1)+(m.eq?", Ausgleichsspiel":", Spiel "+(mi+1))})})});
  (S.so||[]).forEach((m,i)=>out.push({m,locked:false,so:true,tag:"Entscheidungsspiel",k:null,cls:"rc0"}));
  return out;
}
function statusText(g){
  const r=D.res[g.m.gid];if(!done(g.m))return"";
  if(!r)return"";
  if(r.st==="reported")return"Gemeldet von "+pname(r.by)+(D.cfg.auto==="confirmed"?", wartet auf Bestätigung":"");
  if(r.st==="confirmed")return"Bestätigt";
  if(r.st==="admin")return"Vom Organisator eingetragen";
  if(r.st==="disputed")return"Strittig, der Organisator entscheidet";
  return"";
}
function gameRow(g,o){
  const m=g.m,id=m.gid,nm=x=>esc(S.names[x]),st=statusText(g),dn=done(m);
  const when=g.k!=null?` · <b class="crt">${esc(cname(g.k))}</b>`:"";
  return`<div class="mw ${g.cls}"><span class="tag">${esc(g.tag)}${when}${g.locked&&!o.admin?" · abgeschlossen":""}</span>
    <div class="m"><div class="a">${nm(m.a)}</div>
    <input type="number" min="0" max="99" inputmode="numeric" enterkeyhint="next" data-d="${o.admin?"A":"P"}g${id}a" aria-label="Games ${nm(m.a)}" value="${m.sa==null?"":m.sa}">
    <div class="sep">:</div>
    <input type="number" min="0" max="99" inputmode="numeric" enterkeyhint="done" data-d="${o.admin?"A":"P"}g${id}b" aria-label="Games ${nm(m.b)}" value="${m.sb==null?"":m.sb}">
    <div class="b">${nm(m.b)}</div></div>
    ${m.h?`<p class="note">Zusatzspiel zum Ausgleich: zählt nur für ${nm(m.a)}.</p>`:""}
    <div class="actions">${btn(o.admin?"asave":"save",dn?"Ändern":"Eintragen",{attr:'data-gid="'+id+'"'+(g.locked&&!o.admin?" disabled":"")})}${o.extra||""}<span class="status">${esc(st)}</span></div></div>`;
}

/* Mein Spiel */
function playerPanel(){
  const mi=myIdx();
  if(mi<0)return claimPanel();
  if(D.players[mi].out)return`<section class="panel"><h2>Du bist ausgeschieden</h2><p class="hint">Deine bisherigen Spiele zählen weiter. Danke fürs Mitspielen.</p>${standLine(mi)}</section>`;
  const G=gamesOf().filter(g=>g.m.a===mi||g.m.b===mi);
  const open=G.filter(g=>!done(g.m)),last=G.filter(g=>done(g.m)).slice(-1)[0];
  let h="";
  const ng=NEWG!==null?open.find(g=>g.m.gid===NEWG):null;
  if(ng){const nx=nextOf(mi),opp=S.names[ng.m.a===mi?ng.m.b:ng.m.a],where=nx&&nx.k!=null?" · "+cname(nx.k)+(T0()!=null?" ab "+tt(nx.i,S.dur+S.brk):""):"";
    h+=`<div class="newgame" role="alert"><span><b>Dein nächstes Spiel steht.</b> Gegen ${esc(opp)}${esc(where)}</span>${btn("seen","OK",{q:true})}</div>`}
  const nx=open.length?nextOf(mi):null;
  h+=`<section class="hero mygame" aria-label="Dein Spiel">`;
  if(open.length){
    const g0=open[0],opp0=S.names[g0.m.a===mi?g0.m.b:g0.m.a];
    h+=`<p class="hk">Dein nächstes Spiel</p><p class="hg">gegen</p><h2 class="ho">${esc(opp0)}</h2>`;
    const pill=nx&&nx.k!=null?`<span class="pill">${esc(cname(nx.k))}</span>`:"",tm=nx&&T0()!=null?`<span class="hz">ab ${tt(nx.i,S.dur+S.brk)}</span>`:"";
    if(pill||tm)h+=`<p class="hw">${pill}${tm}</p>`;
    h+=open.map((g,i)=>{const opp=S.names[g.m.a===mi?g.m.b:g.m.a];
      return`<div class="hin">${i?`<p class="sum">Danach: gegen ${esc(opp)}</p>`:""}${gameRow(g,{})}</div>`}).join("");
    h+=`<p class="hh">Nach dem Spiel trägt einer von euch beiden das Ergebnis in Games ein.${D.cfg.auto==="confirmed"?" Der Gegner bestätigt es.":" Es gilt sofort."}${S.draw?"":" Unentschieden sind nicht erlaubt."}</p>`;
  }else{
    h+=`<p class="hk">Dein Spiel</p><h2 class="ho">${isOver()?"Alle Spiele gespielt":last?"Gerade kein offenes Spiel":"Noch nicht angesetzt"}</h2><p class="hh">${isOver()?"Danke fürs Mitspielen.":"Dein nächstes Spiel erscheint hier automatisch."}</p>`;
  }
  h+=`</section>`+rankCard(mi);
  let more="";
  if(last){
    const r=D.res[last.m.gid],other=r&&r.by!==TOK.pid&&r.st==="reported";
    const extra=other&&D.cfg.auto==="confirmed"?btn("confirm","Stimmt",{q:true,attr:'data-gid="'+last.m.gid+'"'})+btn("dispute","Stimmt nicht",{q:true,attr:'data-gid="'+last.m.gid+'"'}):"";
    more+=`<details class="lastg" data-k="last"${OPEN.has("last")||other||(r&&r.st==="disputed")?" open":""}><summary>Letztes Ergebnis${last.locked?"":" (änderbar)"}</summary>${gameRow(last,{extra})}</details>`;
  }
  if(G.length)more+=`<details class="lastg" data-k="mine"${OPEN.has("mine")?" open":""}><summary>Meine Spiele (${G.length})</summary>${myGames(mi,G)}</details>`;
  if(more)h+=`<section class="panel lastp">${more}</section>`;
  return h;
}
/* Mein Platz in der Tabelle (groß, gelbe Karte) */
function rankCard(mi){
  let st;try{st=ranking()}catch(e){return""}
  const me=st.find(x=>x.i===mi);if(!me)return"";
  const pl=me.g?me.rk:"–";
  return`<section class="rankc" aria-label="Deine Platzierung"><div class="rn"><span class="rl">Platz</span><b>${pl}</b><span class="rv">von ${st.filter(x=>!x.out).length}</span></div><div class="rd"><p class="rname">${esc(D.players[mi].name)}</p>${me.g?`<p><b>${me.p}</b> ${me.p===1?"Punkt":"Punkte"}</p><p>${me.w} ${me.w===1?"Sieg":"Siege"}, ${me.l} ${me.l===1?"Niederlage":"Niederlagen"}${S.draw&&me.d?", "+me.d+" unentschieden":""}</p><p>Games ${me.gf}:${me.ga}</p>`:`<p>Noch kein Spiel gespielt.</p>`}</div></section>`;
}
/* Mein Platz in der Tabelle */
function standLine(mi){
  let st;try{st=ranking()}catch(e){return""}
  const me=st.find(x=>x.i===mi);if(!me)return"";
  if(!me.g)return`<p class="stand">Noch kein Spiel gespielt.</p>`;
  return`<p class="stand"><b>Platz ${me.rk} von ${st.filter(x=>!x.out).length}</b> · ${me.p} ${me.p===1?"Punkt":"Punkte"} · ${me.w} ${me.w===1?"Sieg":"Siege"}, ${me.l} ${me.l===1?"Niederlage":"Niederlagen"}${S.draw&&me.d?", "+me.d+" unentschieden":""} · Games ${me.gf}:${me.ga}</p>`;
}
/* Alle eigenen Spiele mit Gegner und Ergebnis */
function myGames(mi,G){
  return`<ul class="mylist">${G.map(g=>{
    const m=g.m,iA=m.a===mi,opp=S.names[iA?m.b:m.a];
    let res;
    if(done(m)){const a=iA?m.sa:m.sb,b=iA?m.sb:m.sa;res=`<b>${a}:${b}</b> ${a>b?"Sieg":a<b?"Niederlage":"Unentschieden"}`+(m.h&&!iA?" (zählt nur für "+esc(S.names[m.a])+")":"")}
    else res="offen"+(g.k!=null?" · "+esc(cname(g.k)):"");
    return`<li><span class="mt">${esc(g.tag)}</span><span>gegen ${esc(opp)}</span><span class="mr">${res}</span></li>`}).join("")}</ul>`;
}
/* Endstand mit Teilen-Knopf */
function finalText(){
  const st=ranking(),url=location.origin+location.pathname+"#"+CODE;
  return"Padel-Turnier, Endstand\n"+st.map(s=>`${s.rk}. ${s.nm}: ${s.p} Pkt, ${s.gf}:${s.ga} Games (${sgn(s.gf-s.ga)})`).join("\n")+"\nAlle Ergebnisse (7 Tage abrufbar): "+url;
}
function finalPanel(){
  if(!D||D.status!=="finished")return"";
  let st;try{st=ranking()}catch(e){return""}
  const top=st.filter(s=>s.rk<=3).map(s=>`${s.rk}. ${esc(s.nm)} (${s.p} Pkt)`).join(" · ");
  return`<section class="panel final"><h2>Turnier beendet</h2><p class="sum">${top}</p><div class="actions">${btn("share","Endstand teilen")}</div></section>`;
}
function claimPanel(){
  const adm=isAdm();
  return`<section class="panel"><h2>${adm?"Selbst mitspielen":"Du schaust zu"}</h2>
    <p class="hint">${adm?"Du bist Organisator und trägst Ergebnisse immer ein. Das Turnier läuft bereits, ein neuer Spieler kann nicht mehr beitreten.":"Das Turnier läuft schon. Wer schon dabei war, trägt hier denselben Namen ein, sobald sein Zugang frei ist. Nach einem Gerätewechsel bittet er dafür den Organisator um „Zugang freigeben“."}</p>
    <div class="field"><label for="nameIn">Name</label><input id="nameIn" data-d="name" maxlength="24" placeholder="Dein Name wie eingetragen"></div>
    <div class="actions">${btn("join","Zugang übernehmen",{q:true})}</div></section>`;
}

/* Organisator: Ergebnisse */
function adminPanel(){
  if(!isAdm())return"";
  const G=gamesOf(),open=G.filter(g=>!done(g.m)),fin=G.filter(g=>done(g.m)).reverse();
  const dis=Object.keys(D.res).filter(k=>D.res[k].st==="disputed").length;
  let h=`<section class="panel adm"><div class="head"><h2>Organisator</h2><span class="meta">${open.length} offen</span></div>`;
  if(dis)h+=`<p class="hint err">${dis} strittige${dis===1?"s Ergebnis":" Ergebnisse"}. Bitte unten entscheiden.</p>`;
  if(D.reqs&&D.reqs.length)h+=`<div class="reqs"><h3>Anfragen zum Ausscheiden</h3>${D.reqs.map(r=>`<div class="actions"><span>${esc(pname(r.pid))}</span>${btn("dropok","Ausscheiden",{attr:'data-pid="'+r.pid+'"'})}${btn("dropno","Ablehnen",{q:true,attr:'data-pid="'+r.pid+'"'})}</div>`).join("")}</div>`;
  h+=open.length?`<h3>Offene Spiele</h3><div class="matches">${open.map(g=>gameRow(g,{admin:true})).join("")}</div>`:`<p class="hint">Keine offenen Spiele.</p>`;
  h+=`<details data-k="all"${OPEN.has("all")?" open":""}><summary>Alle Ergebnisse ändern (${fin.length})</summary>
    <p class="hint">Änderungen wirken sofort auf die Tabelle. Spätere Paarungen bleiben, wie sie sind.</p>
    <div class="matches">${fin.map(g=>gameRow(g,{admin:true})).join("")}</div></details></section>`;
  return h;
}

/* Unten: Links, Ausscheiden, Organisator-Werkzeuge */
function bottom(){
  const adm=isAdm(),mi=myIdx();let h="";
  if(mi>=0&&!D.players[mi].out&&D.status==="running"){
    h+=`<section class="panel"><h3>Ausscheiden</h3><p class="hint">Musst du früher gehen? Der Organisator bestätigt es. Deine bisherigen Spiele zählen für die anderen weiter.</p>
      <div class="actions">${D.dropReq?`<span class="status">Anfrage gesendet, der Organisator bestätigt.</span>`+btn("dropcancel","Anfrage zurückziehen",{q:true}):sure("dropreq","dropreq","Ich möchte ausscheiden","Wirklich anfragen?")}</div></section>`;
  }
  if(adm){
    const cand=D.players.map((p,i)=>({p,i})).filter(x=>!x.p.out&&D.status==="running"&&canDrop(x.i));
    h+=`<section class="panel adm"><h3>Werkzeuge</h3><div class="actions">
      ${D.status==="running"?btn("assign","Jetzt ansetzen",{q:true})+sure("undo","undo","Letzte Ansetzung zurücknehmen","Wirklich zurücknehmen?"):""}
      ${btn("export","Sicherung herunterladen",{q:true})}
      ${btn("copy","Link für Spieler kopieren",{q:true,attr:'data-text="'+esc(playerLink())+'"'})}${btn("copy","Organisator-Link kopieren",{q:true,attr:'data-text="'+esc(adminLink())+'"'})}</div>
      ${cand.length?`<div class="actions"><select data-d="dropsel" aria-label="Spieler ausscheiden lassen">${cand.map(x=>`<option value="${x.p.id}">${esc(x.p.name)}</option>`).join("")}</select>${sure("drop","drop","Ausscheiden lassen","Wirklich ausscheiden lassen?")}</div>`:""}
      ${D.status==="running"&&S&&S.courts>0?`<details data-k="cnames"${OPEN.has("cnames")?" open":""}><summary>Platznamen ändern</summary>${courtInputs(S.courts,D.cfg.cn)}<div class="actions">${btn("courts","Platznamen speichern")}</div></details>`:""}
      <details data-k="qr"${OPEN.has("qr")?" open":""}><summary>QR-Code für Spieler</summary>${qrBox()}</details>
      <details data-k="players"${OPEN.has("players")?" open":""}><summary>Spieler und Zugänge</summary><ul class="plist">${D.players.map((p,i)=>`<li class="adm-li">${pedit(p,(p.out?' <span class="gone">ausgeschieden</span>':"")+(p.released?' <span class="gone">Zugang frei</span>':""),p.taken?btn("release","Zugang freigeben",{q:true,attr:'data-pid="'+p.id+'"'}):"")}</li>`).join("")}</ul></details>
      <div class="actions">${sure("end","end","Turnier beenden und löschen","Endgültig löschen?")}</div>
      <p class="hint">Das Turnier wird 7 Tage nach der letzten Änderung automatisch gelöscht. Wer die Tabelle behalten will, kopiert sie vorher mit „Tabelle kopieren“.</p></section>`;
  }
  if(!adm&&mi<0)h+=`<section class="panel"><p class="hint">Link zu diesem Turnier: ${esc(playerLink())}</p></section>`;
  return h;
}

/* ---------- Aktionen ---------- */
const num=v=>{const s=String(v==null?"":v).trim();return/^\d{1,2}$/.test(s)?+s:null};
function readScore(btnEl){
  const row=btnEl.closest(".mw"),ins=row?row.querySelectorAll("input"):[];
  const a=ins.length>1?num(ins[0].value):null,b=ins.length>1?num(ins[1].value):null;
  if(a==null||b==null){say("Bitte beide Ergebnisse als ganze Zahlen von 0 bis 99 eintragen.",true);return null}
  if(!S.draw&&a===b){say("Unentschieden sind in diesem Turnier nicht erlaubt.",true);return null}
  return{sa:a,sb:b};
}
async function call(path,body,mode){
  if(!CODE)return null;
  const admin=mode==="admin";
  const r=await api("POST","/"+CODE+path,body,tokFor(mode));
  if(r.net){say("Keine Verbindung. Bitte noch einmal versuchen.",true);return null}
  if(!r.j.ok){
    if(r.status===401&&!admin){TOK.p=null;TOK.pid=null;saveTok();say("Dein Zugang gilt nicht mehr. Bitte neu beitreten oder den Organisator um Freigabe bitten.",true);ver=-1;poll(true);return null}
    say(r.j.msg||"Das hat nicht geklappt.",true);if(r.status===409||r.status===404)poll(true);return null}
  say(null);return r.j;
}
async function createWith(key,body,failMsg){
  const r=await fetch(API,{method:"POST",headers:{"x-create-key":key,"content-type":"application/json"},body:JSON.stringify(body)}).then(async x=>({s:x.status,j:await x.json().catch(()=>({}))}),()=>({s:0,j:{msg:"Keine Verbindung zum Server."}}));
  if(!r.j.ok){say(r.j.msg||failMsg,true);return}
  CODE=r.j.code;TOK={p:null,a:r.j.adminKey,pid:null};saveTok();
  try{history.replaceState(null,"","#"+CODE)}catch(e){}
  D=null;ver=-1;gen++;paintAll();poll(true);
  if(r.j.restored)say("Wiederhergestellt als Turnier "+CODE+". Schick den neuen Link oder QR-Code an die Spieler; jeder trägt seinen Namen ein und ist wieder dabei.");
}
async function refresh(){clearTimeout(pollT);await poll(true)}
const ACT={
  arm(e){arm(e.dataset.key)},
  async goto(){let c=(val("code")||"").trim().toUpperCase();const hm=c.match(/#([^\/\s?]+)/);if(hm)c=hm[1];c=c.replace(/[\s\-_.]/g,"");if(!CODE_OK.test(c)){say("Bitte den Code mit 6 Zeichen eingeben (ohne 0, 1, I, L, O).",true);return}location.hash="#"+c},
  async create(){
    const key=val("ckey");if(!key){say("Bitte den Schlüssel des Organisators eingeben.",true);return}
    await createWith(key,{cfg:{auto:"reported"}},"Das Anlegen hat nicht geklappt.");
  },
  async restore(){
    const key=val("ckey");if(!key){say("Bitte oben den Schlüssel des Organisators eingeben.",true);return}
    const inp=q("#rfile"),f=inp&&inp.files&&inp.files[0];if(!f){say("Bitte eine Sicherungsdatei auswählen.",true);return}
    if(f.size>390000){say("Die Datei ist zu groß für eine Sicherung.",true);return}
    let obj;try{obj=JSON.parse(await f.text())}catch(e){say("Die Datei ist keine gültige Sicherung.",true);return}
    await createWith(key,{restore:obj},"Die Wiederherstellung hat nicht geklappt.");
  },
  async export(){
    const r=await api("GET","/"+CODE+"/admin/export",null,TOK.a);
    if(r.net||!r.j.ok){say(r.j.msg||"Die Sicherung hat nicht geklappt.",true);return}
    try{
      const blob=new Blob([JSON.stringify(r.j.backup)],{type:"application/json"}),a=document.createElement("a"),d=new Date(),z=x=>String(x).padStart(2,"0");
      a.href=URL.createObjectURL(blob);a.download="padel-sicherung-"+CODE+"-"+d.getFullYear()+z(d.getMonth()+1)+z(d.getDate())+"-"+z(d.getHours())+z(d.getMinutes())+".json";
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
      say("Sicherung heruntergeladen. Sie enthält keine Zugänge; zum Wiederherstellen brauchst du den Schlüssel.");
    }catch(e){say("Das Speichern der Datei ist auf diesem Gerät nicht möglich.",true)}
  },
  async join(){
    const r=await call("/join",{name:val("name")},"none");if(!r)return;
    TOK.pid=r.pid;if(r.token)TOK.p=r.token;saveTok();await refresh();
  },
  async rename(){if(!await call("/rename",{name:val("ren")},"player"))return;await refresh()},
  async leave(){if(!await call("/leave",{},"player"))return;TOK.p=null;TOK.pid=null;saveTok();await refresh()},
  async add(){if(!await call("/admin/add",{name:val("add")},"admin"))return;const e=document.querySelector('[data-d="add"]');if(e)e.value="";await refresh()},
  async prename(e){if(!await call("/admin/rename",{pid:+e.dataset.pid,name:val("pn"+e.dataset.pid)},"admin"))return;await refresh()},
  async kick(e){if(!await call("/admin/kick",{pid:+e.dataset.pid},"admin"))return;await refresh()},
  async release(e){if(!await call("/admin/release",{pid:+e.dataset.pid},"admin"))return;say("Zugang freigegeben. Der Spieler trägt jetzt seinen Namen erneut ein.");await refresh()},
  async config(){
    const g=k=>val(k),lim=g("lim")==="yes",cfg={R:+g("r"),courts:+g("c"),ov:g("ov"),lead:+g("lead")||0,lim,dur:+g("dur"),brk:+g("brk"),wu:+g("wu"),draw:lim&&g("draw")==="yes",auto:g("auto"),cn:readCourts(+g("c"))};
    const t=g("t0").trim();if(t==="")cfg.t0=null;else{const v=tparse(t);if(v==null){say("Die Startzeit bitte als hh:mm eintragen, z. B. 18:30.",true);return}cfg.t0=v}
    if(!await call("/admin/config",{cfg},"admin"))return;say("Einstellungen gespeichert.");await refresh();
  },
  async lock(){if(!await call("/admin/config",{cfg:{closed:!D.cfg.closed}},"admin"))return;await refresh()},
  async courts(){
    const cn=readCourts(S&&S.courts||0);
    if(!await call("/admin/config",{cfg:{cn}},"admin"))return;say("Platznamen gespeichert.");await refresh();
  },
  async start(){disarm();if(!await call("/admin/start",{},"admin"))return;await refresh()},
  async save(e){const gid=+e.dataset.gid,s=readScore(e);if(!s)return;const r=await call("/result",{gid,...s},"player");if(!r)return;say("Ergebnis gespeichert.");await refresh()},
  async asave(e){const gid=+e.dataset.gid,s=readScore(e);if(!s)return;const r=await call("/admin/result",{gid,...s,force:true},"admin");if(!r)return;say("Ergebnis gespeichert.");await refresh()},
  async confirm(e){if(!await call("/confirm",{gid:+e.dataset.gid},"player"))return;await refresh()},
  async dispute(e){if(!await call("/dispute",{gid:+e.dataset.gid},"player"))return;say("Der Organisator wurde informiert und entscheidet.");await refresh()},
  async dropreq(){disarm();if(!await call("/drop-request",{},"player"))return;say("Anfrage gesendet. Der Organisator bestätigt.");await refresh()},
  async dropcancel(){if(!await call("/drop-request",{cancel:true},"player"))return;await refresh()},
  async dropok(e){if(!await call("/admin/drop",{pid:+e.dataset.pid},"admin"))return;await refresh()},
  async dropno(e){if(!await call("/admin/dismiss",{pid:+e.dataset.pid},"admin"))return;await refresh()},
  async drop(){disarm();const pid=+val("dropsel");if(!await call("/admin/drop",{pid},"admin"))return;await refresh()},
  async assign(){const r=await call("/admin/assign",{},"admin");if(!r)return;say(r.assigned?"Neue Spiele angesetzt.":"Es gibt gerade nichts anzusetzen.");await refresh()},
  async undo(){disarm();if(!await call("/admin/undo",{confirm:true},"admin"))return;await refresh()},
  async end(){disarm();if(!await call("/admin/end",{confirm:true},"admin"))return;dropTok(CODE);CODE=null;D=null;TOK={p:null,a:null,pid:null};gen++;clearTimeout(pollT);history.replaceState(null,"","#");say("Das Turnier wurde gelöscht.");paintAll()},
  seen(){NEWG=null;titleNew();paintAll()},
  async share(){
    let t;try{t=finalText()}catch(e){say("Der Endstand konnte nicht erstellt werden.",true);return}
    try{if(navigator.share){await navigator.share({title:"Padel-Turnier, Endstand",text:t});return}}catch(e){if(e&&e.name==="AbortError")return}
    let ok=false;try{await navigator.clipboard.writeText(t);ok=true}catch(e){}
    if(ok)say("Endstand kopiert. Jetzt in einen Chat einfügen.");else say("Kopieren ist hier nicht möglich. Bitte die Tabelle markieren und kopieren.",true);
  },
  async copy(e){
    const t=e.dataset.text||"";let ok=false;
    try{await navigator.clipboard.writeText(t);ok=true}catch(x){}
    if(!ok){const i=e.parentElement&&e.parentElement.querySelector("input[data-sel]");if(i){i.focus();i.select();say("Zum Kopieren den markierten Text halten und „Kopieren“ wählen.")}else say(t)}
    else say("Kopiert.");
  },
};
document.addEventListener("click",ev=>{
  const e=ev.target.closest&&ev.target.closest("[data-act]");if(!e||e.disabled)return;
  const f=ACT[e.dataset.act];if(!f)return;
  if(e.dataset.act!=="arm"&&e.dataset.act!=="copy"&&!/^(start|undo|end|drop|dropreq)$/.test(e.dataset.act))disarm();
  e.disabled=true;
  Promise.resolve().then(()=>f(e)).catch(x=>say("Unerwarteter Fehler: "+(x&&x.message||x),true)).finally(()=>{if(document.contains(e))e.disabled=false});
});
document.addEventListener("keydown",ev=>{
  if(ev.key!=="Enter"||!ev.target||!ev.target.dataset||!ev.target.dataset.d)return;
  const k=ev.target.dataset.d;let a=null;
  if(k==="code")a="goto";else if(k==="ckey")a="create";else if(k==="name")a="join";else if(k==="ren")a="rename";else if(k==="add")a="add";
  else if(/^[AP]g\d+[ab]$/.test(k)){const r=ev.target.closest(".mw"),b=r&&r.querySelector("[data-act=save],[data-act=asave]");if(b&&!b.disabled)b.click();return}
  else if(/^cn\d+$/.test(k)){const b=document.querySelector("[data-act=config],[data-act=courts]");if(b)b.click();return}
  else if(/^pn\d+$/.test(k)){const b=ev.target.parentElement.querySelector("[data-act=prename]");if(b)b.click();return}
  if(a){const b=document.querySelector('[data-act="'+a+'"]');if(b)b.click()}
});
document.addEventListener("change",ev=>{
  const e=ev.target;if(!e||!e.closest||!e.closest("details.cfg"))return;const k=e.dataset&&e.dataset.d;
  try{if(k==="lim")limChange();else if(k==="t0")fixT0(e);else if(k==="c"){const n=+e.value;document.querySelectorAll("#cnl [data-d^=cn]").forEach((x,i)=>{x.hidden=i>=n});syncSetup()}else if(["r","ov","lead","dur","draw","brk","wu","sec"].includes(k))syncSetup()}catch(x){}
});
document.addEventListener("toggle",ev=>{const d=ev.target;if(d&&d.dataset&&d.dataset.k){d.open?OPEN.add(d.dataset.k):OPEN.delete(d.dataset.k)}},true);

window.__online={poll:()=>poll(true),state:()=>({CODE,D,TOK}),route};
route();
})();
