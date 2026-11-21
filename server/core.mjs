// Server-Kern des Padel-Turniers: Rollen, Beitritt, Ergebnisse, Bestätigung, automatisches Ansetzen.
// Rein und synchron: kein Netzwerk, kein Speicher. Der Worker (worker.mjs) liefert Anfragen und sichert den Zustand.
import {createEngine} from './engine.gen.mjs';
import {sha256} from './sha256.mjs';

export const TTL=7*864e5;             // Turnier wird 7 Tage nach der letzten Änderung gelöscht
export const CODE_RE=/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;
const ALPHA='ABCDEFGHJKMNPQRSTUVWXYZ23456789',B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const MAXP=24,MINP=4;
/* Grenzen je Minute. Jeder Absender hat sein eigenes Kontingent (Organisator, jeder Spieler, jede Adresse ohne Zugang),
   damit ein einzelner Störer niemanden sonst ausbremst. Zusätzlich eine Decke für alle zusammen; der Organisator zählt dort nicht mit. */
const LIM={admin:{w:600,r:3000},player:{w:120,r:600},ip:{w:90,r:600},all:{w:1500,r:12000},maxKeys:2000,joinFailPerIp:60,joinWindow:10*60e3};

class Err extends Error{constructor(status,err,msg){super(msg);this.status=status;this.err=err;this.msg=msg}}
const bad=(msg,err='eingabe')=>new Err(422,err,msg);
const isObj=o=>o&&typeof o==='object'&&!Array.isArray(o);
const isInt=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;

export function defaultRand(n){const b=new Uint8Array(n);globalThis.crypto.getRandomValues(b);return b}
const b64=(bytes)=>{let s='';for(let i=0;i<bytes.length;i++)s+=B64[bytes[i]&63];return s};  // 24 Zufallsbytes, je 6 Bit genutzt: 144 Bit Zufall
export const newCode=(rand=defaultRand)=>[...rand(6)].map(x=>ALPHA[x%ALPHA.length]).join('');

const CTRL=new RegExp('['+['\\u0000-\\u001f','\\u007f-\\u009f','\\u200b-\\u200f','\\u2028-\\u202e','\\u2060-\\u206f','\\ufeff'].join('')+']','g');
/* Namen: Steuerzeichen raus, Leerraum glätten, höchstens 24 Zeichen, keine spitzen Klammern */
export function cleanName(v,{allowEmpty=false}={}){
  if(typeof v!=='string')return null;
  const s=v.normalize('NFC').replace(CTRL,'').replace(/\s+/g,' ').trim();
  if(!s)return allowEmpty?"":null;
  if([...s].length>24||/[<>]/.test(s))return null;
  return s;
}
const sameName=(a,b)=>a.toLocaleLowerCase('de')===b.toLocaleLowerCase('de');

/* Einstellungen prüfen. base = bisherige Werte; Unbekanntes wird ignoriert, Falsches abgelehnt. */
export function cleanCfg(input,base,E){
  if(!isObj(input))throw bad('Einstellungen fehlen.');
  const c={...base},{DURS,BRKS}=E;
  const take=(k,test,fix=x=>x)=>{if(k in input){if(!test(input[k]))throw bad('Ungültiger Wert für '+k+'.');c[k]=fix(input[k])}};
  take('R',v=>isInt(v,3,20));
  take('courts',v=>isInt(v,1,12));
  take('dur',v=>DURS.includes(v));
  take('brk',v=>BRKS.includes(v));
  take('lim',v=>typeof v==='boolean');
  take('closed',v=>typeof v==='boolean');
  take('draw',v=>typeof v==='boolean');
  take('ov',v=>['no','yes','wait'].includes(v));
  take('lead',v=>isInt(v,0,2));
  take('wu',v=>isInt(v,0,60));
  take('t0',v=>v===null||isInt(v,0,1439));
  take('auto',v=>['reported','confirmed','off'].includes(v));
  take('grace',v=>isInt(v,30,600));
  if('cn' in input){
    if(!Array.isArray(input.cn)||input.cn.length>12)throw bad('Ungültige Platznamen.');
    c.cn=input.cn.map(x=>{const s=cleanName(x,{allowEmpty:true});if(s===null)throw bad('Ungültiger Platzname.');return s});
  }
  if(!c.lim)c.draw=false;
  if(c.ov!=='yes')c.lead=0;
  return c;
}
const DEFAULT_CFG={R:5,courts:2,dur:20,brk:5,lim:true,draw:true,ov:'wait',lead:0,wu:0,t0:null,cn:[],auto:'reported',grace:120,closed:false};

export const ROUTE_KEYS=()=>Object.keys(ROUTES);

export class Tournament{
  constructor(data=null,opts={}){
    this.now=opts.now||Date.now;this.rand=opts.rand||defaultRand;
    this.E=createEngine();this.m=null;this.corrupt=false;
    this.rl=new Map();this.rlAll={w:[],r:[]};this.joins=new Map();
    if(data){
      this.m=data;
      if(data.S){if(this.E.okState(data.S))this.E.S=data.S;else this.corrupt=true}
    }
  }
  exists(){return !!this.m}
  toJSON(){return this.m}
  expiresAt(){return this.m?this.m.touched+TTL:0}
  /* Kurzfassung für die Turnierübersicht des Organisators (keine Namen, keine Schlüssel) */
  summary(){const m=this.m;return m?{code:m.code,st:m.status,n:m.players.length,c:m.created,t:m.touched,e:this.expiresAt()}:null}

  /* ===== Anfrage bearbeiten: {method,path,token,body,query,ip} -> {status,body,dirty,wipe} ===== */
  handle(req){
    this.dirty=false;this.wipe=false;
    try{
      const route=req.method+' '+req.path;
      if(route==='POST init')return this.ok(this.init(req.body,req.code));
      if(!this.m)throw new Err(404,'nicht_gefunden','Dieses Turnier gibt es nicht (mehr).');
      if(this.corrupt)throw new Err(500,'beschaedigt','Der Turnierstand ist beschädigt.');
      let who;
      try{who=this.auth(req.token,route==='GET state')}catch(e){this.limit(req,{role:'none'},req.ip);throw e}
      this.limit(req,who,req.ip);
      this.tick();
      const h=this.routes[route];
      if(!h)throw new Err(404,'unbekannt','Unbekannter Pfad.');
      const body=req.method==='POST'?(isObj(req.body)?req.body:{}):{};
      const out=h.call(this,{who,body,q:req.query||{},ip:req.ip||''});
      return this.ok(out);
    }catch(e){
      if(e instanceof Err)return{status:e.status,body:{ok:false,err:e.err,msg:e.msg},dirty:this.dirty,wipe:false};
      this.lastError=e;
      return{status:500,body:{ok:false,err:'intern',msg:'Interner Fehler.'},dirty:this.dirty,wipe:false};
    }
  }
  ok(body){return{status:200,body:{ok:true,...body},dirty:this.dirty,wipe:this.wipe}}
  limit(req,who,ip){
    const t=this.now(),w=req.method==='POST',k=who.role==='admin'?'admin':who.role==='player'?'p'+who.pid:'ip:'+(ip||'-');
    const lim=who.role==='admin'?LIM.admin:who.role==='player'?LIM.player:LIM.ip;
    let e=this.rl.get(k);if(!e){e={w:[],r:[]};this.rl.set(k,e);if(this.rl.size>LIM.maxKeys)for(const x of this.rl.keys()){if(x!==k){this.rl.delete(x);break}}}
    const trim=a=>{while(a.length&&a[0]<t-60e3)a.shift()};
    const mine=w?e.w:e.r;trim(mine);
    if(mine.length>=(w?lim.w:lim.r))throw new Err(429,'zu_viele','Zu viele Anfragen von diesem Gerät. Bitte kurz warten.');
    if(who.role!=='admin'){
      const all=w?this.rlAll.w:this.rlAll.r;trim(all);
      if(all.length>=(w?LIM.all.w:LIM.all.r))throw new Err(429,'zu_viele','Gerade sehr viel los. Bitte kurz warten.');
      all.push(t);
    }
    mine.push(t);
  }
  auth(token,soft){
    if(token==null||token==="")return{role:'none'};
    if(typeof token!=='string'||token.length>80)throw new Err(401,'token','Ungültiger Zugang.');
    const h=sha256(token);
    if(token.startsWith('a_')&&h===this.m.adminHash)return{role:'admin'};
    if(token.startsWith('p_')){const p=this.m.players.find(p=>p.hash&&p.hash===h);if(p)return{role:'player',pid:p.id}}
    if(soft)return{role:'none',badToken:true};
    throw new Err(401,'token','Ungültiger Zugang. Bitte neu beitreten oder den Organisator fragen.');
  }
  /* Modus „bestätigt“: Ein gemeldetes Ergebnis, das die andere Seite nicht innerhalb der Frist bestätigt oder anfechtet, gilt als bestätigt. */
  tick(){
    const m=this.m;if(!this.E.S||m.status==='lobby'||m.cfg.auto!=='confirmed')return;
    const t=this.now(),g=m.cfg.grace*1000;let ch=false;
    for(const k in m.res){const r=m.res[k];if(r.st==='reported'&&t-r.at>=g){r.st='confirmed';r.auto=true;ch=true}}
    if(ch){this.commit({role:'sys'},'auto-confirm',null);this.autoStep()}
  }
  need(who,role){
    if(role==='admin'&&who.role!=='admin')throw new Err(403,'verboten','Nur der Organisator darf das.');
    if(role==='player'&&who.role!=='player')throw new Err(401,'token','Bitte zuerst dem Turnier beitreten.');
    if(role==='any'&&who.role==='none')throw new Err(401,'token','Bitte zuerst dem Turnier beitreten.');
  }
  commit(who,act,info){
    const m=this.m;m.ver++;m.touched=this.now();this.dirty=true;
    m.log.push({t:m.touched,w:who.role==='admin'?'admin':who.role==='player'?who.pid:'-',a:act,i:info===undefined?null:info});
    if(m.log.length>300)m.log.splice(0,m.log.length-300);
  }

  /* ===== Anlegen ===== */
  init(body,code){
    if(this.m)throw new Err(409,'vorhanden','Dieses Turnier gibt es schon.');
    if(!CODE_RE.test(code||''))throw bad('Ungültiger Turniercode.');
    const restore=body&&body.restore!==undefined&&body.restore!==null?this.parseBackup(body.restore):null;
    const cfg=restore?restore.cfg:cleanCfg(isObj(body&&body.cfg)?body.cfg:{},DEFAULT_CFG,this.E);
    const adminKey='a_'+b64(this.rand(24));
    const t=this.now();
    this.m={v:1,code,created:t,touched:t,ver:1,adminHash:sha256(adminKey),cfg,players:[],nextPid:1,status:'lobby',S:null,nextGid:1,res:{},reqs:[],log:[]};
    if(restore){
      const m=this.m;
      m.players=restore.players;m.nextPid=restore.nextPid;m.S=restore.S;m.res=restore.res;m.nextGid=restore.nextGid;
      this.E.S=restore.S;
      if(restore.S){for(const g of this.games())if(Number.isInteger(g.m.gid)&&g.m.gid>=m.nextGid)m.nextGid=g.m.gid+1;this.reconcile()}
      this.commit({role:'admin'},'restore',m.players.length);
    }
    this.dirty=true;
    return{code,adminKey,ver:this.m.ver,restored:!!restore};
  }
  /* Sicherung (Export) prüfen und in einen Turnierstand umwandeln. Zugänge werden nicht mitgesichert:
     Alle Spieler sind danach „frei“ und holen ihren Zugang über ihren Namen zurück. */
  parseBackup(src){
    const E=this.E;
    if(!isObj(src)||src.format!=='padel-turnier-sicherung'||src.v!==1)throw bad('Das ist keine Sicherungsdatei dieses Programms.');
    if(!Array.isArray(src.players)||src.players.length>MAXP)throw bad('Die Sicherung enthält keine gültige Spielerliste.');
    const players=[],ids=new Set();let maxPid=0;
    for(const p of src.players){
      const name=isObj(p)?cleanName(p.name):null;
      if(name===null||!Number.isInteger(p.id)||p.id<1||p.id>1e9||ids.has(p.id)||players.some(q=>sameName(q.name,name)))throw bad('Ungültiger Spieler in der Sicherung.');
      ids.add(p.id);maxPid=Math.max(maxPid,p.id);players.push({id:p.id,name,hash:null,released:true});
    }
    const cfg=cleanCfg(isObj(src.cfg)?src.cfg:{},DEFAULT_CFG,E);
    let S=null;
    if(src.S!==null&&src.S!==undefined){
      try{S=JSON.parse(JSON.stringify(src.S))}catch(e){throw bad('Der Turnierstand in der Sicherung ist ungültig.')}
      if(!E.okState(S))throw bad('Der Turnierstand in der Sicherung ist ungültig.');
      if(S.n!==players.length||S.names.length!==players.length||S.names.some((x,i)=>x!==players[i].name))throw bad('Spielerliste und Turnierstand in der Sicherung passen nicht zusammen.');
    }else if(Array.isArray(src.players)&&src.status&&src.status!=='lobby')throw bad('Der Turnierstand fehlt in der Sicherung.');
    const res={};
    if(isObj(src.res))for(const k of Object.keys(src.res)){
      const r=src.res[k];
      if(!/^\d{1,9}$/.test(k)||!isObj(r)||!['reported','confirmed','disputed','admin'].includes(r.st))throw bad('Ungültiges Ergebnis in der Sicherung.');
      const by=r.by==='admin'?'admin':Number.isInteger(r.by)&&ids.has(r.by)?r.by:null;
      if(by===null)throw bad('Ungültiges Ergebnis in der Sicherung.');
      res[k]={by,st:r.st,at:Number.isFinite(r.at)?r.at:0,n:Number.isInteger(r.n)&&r.n>=0&&r.n<=99?r.n:0};
      if(r.auto===true)res[k].auto=true;
    }
    let nextGid=Number.isInteger(src.nextGid)&&src.nextGid>0&&src.nextGid<1e9?src.nextGid:1;
    return{players,cfg,S,res,nextPid:Math.max(maxPid+1,Number.isInteger(src.nextPid)&&src.nextPid<1e9?src.nextPid:1),nextGid};
  }
  /* Sicherung (Export): alles außer Zugangsdaten und Protokoll */
  backup(){
    const m=this.m;
    return{format:'padel-turnier-sicherung',v:1,exportedAt:this.now(),code:m.code,status:m.status,cfg:m.cfg,
      players:m.players.map(p=>({id:p.id,name:p.name})),nextPid:m.nextPid,nextGid:m.nextGid,S:m.S||null,res:m.res};
  }

  /* ===== Spiele ===== */
  games(){
    const E=this.E,S=E.S,out=[];if(!S)return out;
    if(S.ov)S.games.forEach((m,i)=>out.push({m,kind:'roll',i,locked:!!m.fin}));
    else S.rounds.forEach((rd,ri)=>{const lk=ri<S.rounds.length-1;rd.m.forEach((m,mi)=>out.push({m,kind:'classic',ri,mi,locked:lk}));if(rd.x)out.push({m:rd.x,kind:'classic',ri,mi:-1,locked:lk})});
    (S.so||[]).forEach((m,i)=>out.push({m,kind:'so',i,locked:false}));
    return out;
  }
  findGame(gid){if(!Number.isInteger(gid))throw bad('Ungültiges Spiel.');const g=this.games().find(g=>g.m.gid===gid);if(!g)throw new Err(404,'spiel','Dieses Spiel gibt es nicht (mehr).');return g}
  /* Nach jeder Änderung: neue Spiele bekommen eine feste Nummer, verwaiste Einträge verschwinden, Status wird bestimmt */
  reconcile(){
    const m=this.m,E=this.E;if(!E.S)return;
    if(E.isOver())E.syncSOcore();
    const gs=this.games(),live=new Set();
    for(const g of gs){if(!g.m.gid)g.m.gid=m.nextGid++;live.add(g.m.gid)}
    for(const k of Object.keys(m.res))if(!live.has(+k))delete m.res[k];
    const st=E.isOver()&&(E.S.so||[]).every(E.done)?'finished':'running';
    m.status=st;
  }
  unconfirmed(){
    const E=this.E;
    return this.games().filter(g=>!g.locked&&g.kind!=='so'&&E.done(g.m)&&['reported','disputed'].includes((this.m.res[g.m.gid]||{}).st));
  }
  /* Automatisches Ansetzen nach jeder Änderung (Einstellung „auto“) */
  autoStep(){
    const E=this.E,m=this.m;
    if(!E.S||m.status==='lobby'){return}
    if(m.cfg.auto!=='off'&&!(m.cfg.auto==='confirmed'&&this.unconfirmed().length)&&!E.isOver()){
      if(E.S.ov)E.assignGames();else if(E.canAdvance())E.advanceRound();
    }
    this.reconcile();
  }

  /* ===== Sicht für Clients ===== */
  idxOf(pid){return this.m.players.findIndex(p=>p.id===pid)}
  view(who){
    const m=this.m,E=this.E,S=E.S,adm=who.role==='admin';
    const res={};for(const k in m.res){const r=m.res[k];res[k]={by:r.by,st:r.st,at:r.at,n:r.n||0}}
    const v={ver:m.ver,now:this.now(),code:m.code,status:m.status,cfg:m.cfg,
      players:m.players.map((p,i)=>({id:p.id,name:p.name,taken:!!p.hash,released:!!p.released,out:S?E.isOut(i):false})),
      S:S||null,res,over:S?E.isOver():false,role:who.role};
    if(who.role==='player'){const i=this.idxOf(who.pid);v.me={pid:who.pid,idx:i,name:m.players[i].name};v.dropReq=m.reqs.some(r=>r.pid===who.pid)}
    if(who.badToken)v.badToken=true;
    if(adm){v.reqs=m.reqs.slice();v.log=m.log.slice(-60);v.attention=Object.keys(m.res).filter(k=>m.res[k].st==='disputed'||(m.res[k].n||0)>=3).map(Number)}
    return v;
  }

  /* ===== Routen ===== */
  get routes(){return ROUTES}
}

function needLobby(t){if(t.m.status!=='lobby')throw new Err(409,'laeuft','Das Turnier läuft bereits.')}
function needRunning(t){if(t.m.status==='lobby')throw new Err(409,'lobby','Das Turnier hat noch nicht begonnen.')}
function playerById(t,pid){if(!Number.isInteger(pid))throw bad('Ungültiger Spieler.');const p=t.m.players.find(p=>p.id===pid);if(!p)throw new Err(404,'spieler','Diesen Spieler gibt es nicht.');return p}
function nameFree(t,name,exceptPid){return !t.m.players.some(p=>p.id!==exceptPid&&sameName(p.name,name))}
function newToken(t){return 'p_'+b64(t.rand(24))}

function joinNew(t,c,b,m){
    const name=cleanName(b.name);
    if(name===null)throw bad('Bitte einen Namen mit 1 bis 24 Zeichen eingeben (ohne < oder >).','name');
    const ex=m.players.find(p=>sameName(p.name,name));
    if(ex){
      if(!ex.released)throw new Err(409,'name_vergeben','Dieser Name ist schon vergeben. Bitte einen anderen wählen oder den Organisator fragen.');
      const token=newToken(t);ex.hash=sha256(token);ex.released=false;t.commit({role:'player',pid:ex.id},'claim',ex.id);
      return{pid:ex.id,token,name:ex.name,claimed:true};
    }
    if(m.cfg.closed)throw new Err(409,'geschlossen','Die Anmeldung ist geschlossen. Bitte den Organisator fragen.');
    needLobby(t);
    if(m.players.length>=MAXP)throw new Err(409,'voll','Das Turnier ist voll (höchstens '+MAXP+' Spieler).');
    const token=newToken(t),p={id:m.nextPid++,name,hash:sha256(token),released:false};
    m.players.push(p);t.commit({role:'player',pid:p.id},'join',p.id);
    return{pid:p.id,token,name};
  }

const ROUTES={
  'GET state'(c){
    const q=c.q,since=q.since!==undefined?+q.since:null;
    if(since!==null&&since===this.m.ver&&!c.who.badToken)return{ver:this.m.ver,same:true,now:this.now()};
    return this.view(c.who);
  },
  'POST join'(c){
    const m=this.m,b=c.body;
    if(c.who.role==='player'){const p=playerById(this,c.who.pid);return{pid:p.id,name:p.name,resumed:true}}
    if(c.who.role==='admin')throw new Err(403,'verboten','Mit dem Organisator-Zugang kann man nicht beitreten. Zum Mitspielen bitte „Selbst mitspielen“ nutzen oder den Spieler-Link öffnen.');
    // Versuche je Netzwerkadresse begrenzen
    // Nur abgewiesene Versuche zählen (Tippfehler, vergebene Namen): ein ganzes Lokal teilt oft eine Adresse und soll nicht gesperrt werden
    const t=this.now(),ip=c.ip||'-',a=(this.joins.get(ip)||[]).filter(x=>x>t-LIM.joinWindow);
    if(a.length>=LIM.joinFailPerIp)throw new Err(429,'zu_viele','Zu viele Versuche. Bitte ein paar Minuten warten.');
    try{return joinNew(this,c,b,m)}catch(e){if(e instanceof Err){a.push(t);this.joins.set(ip,a);if(this.joins.size>500)for(const k of this.joins.keys()){this.joins.delete(k);break}}throw e}
  },
  'POST rename'(c){
    this.need(c.who,'player');needLobby(this);
    const name=cleanName(c.body.name);if(name===null)throw bad('Bitte einen Namen mit 1 bis 24 Zeichen eingeben (ohne < oder >).','name');
    const p=playerById(this,c.who.pid);if(p.name===name)return{name};
    if(!nameFree(this,name,p.id))throw new Err(409,'name_vergeben','Dieser Name ist schon vergeben.');
    p.name=name;this.commit(c.who,'rename',p.id);return{name};
  },
  'POST leave'(c){
    this.need(c.who,'player');needLobby(this);
    const m=this.m;m.players=m.players.filter(p=>p.id!==c.who.pid);this.commit(c.who,'leave',c.who.pid);return{};
  },
  'POST result'(c){return setResult(this,c.who,c.body,false)},
  'POST confirm'(c){
    this.need(c.who,'any');needRunning(this);
    const g=this.findGame(c.body.gid),r=this.m.res[g.m.gid];
    if(!this.E.done(g.m)||!r)throw new Err(409,'kein_ergebnis','Für dieses Spiel gibt es noch kein Ergebnis.');
    if(c.who.role==='player'){
      const i=this.idxOf(c.who.pid);
      if(g.m.a!==i&&g.m.b!==i)throw new Err(403,'verboten','Nur die beiden Spieler (oder der Organisator) bestätigen das Ergebnis.');
      if(r.by===c.who.pid)throw new Err(409,'eigenes','Das Ergebnis muss die andere Seite bestätigen.');
    }
    if(r.st==='confirmed'||r.st==='admin')return{st:r.st};
    r.st=c.who.role==='admin'?'admin':'confirmed';r.at=this.now();
    this.commit(c.who,'confirm',g.m.gid);this.autoStep();return{st:r.st};
  },
  'POST dispute'(c){
    this.need(c.who,'player');needRunning(this);
    const g=this.findGame(c.body.gid),r=this.m.res[g.m.gid],i=this.idxOf(c.who.pid);
    if(g.m.a!==i&&g.m.b!==i)throw new Err(403,'verboten','Nur die beiden Spieler können widersprechen.');
    if(!this.E.done(g.m)||!r||r.by===c.who.pid||r.st!=='reported')throw new Err(409,'nicht_moeglich','Hier ist kein Widerspruch möglich.');
    r.st='disputed';r.at=this.now();this.commit(c.who,'dispute',g.m.gid);return{st:'disputed'};
  },
  'POST drop-request'(c){
    this.need(c.who,'player');needRunning(this);
    const m=this.m,i=this.idxOf(c.who.pid),has=m.reqs.some(r=>r.pid===c.who.pid);
    if(c.body.cancel===true){if(has){m.reqs=m.reqs.filter(r=>r.pid!==c.who.pid);this.commit(c.who,'drop-cancel',c.who.pid)}return{}}
    if(!this.E.canDrop(i))throw new Err(409,'nicht_moeglich','Ausscheiden ist jetzt nicht möglich (zu wenige Spieler oder das Turnier ist zu Ende). Bitte den Organisator fragen.');
    if(!has){m.reqs.push({pid:c.who.pid,at:this.now(),type:'drop'});this.commit(c.who,'drop-request',c.who.pid)}
    return{};
  },
  /* ----- Organisator ----- */
  'POST admin/config'(c){
    this.need(c.who,'admin');const m=this.m,b=c.body;
    const inc=isObj(b.cfg)?b.cfg:null;if(!inc)throw bad('Einstellungen fehlen.');
    if(m.status!=='lobby'){
      const allowed={};for(const k of ['auto','cn'])if(k in inc)allowed[k]=inc[k];
      if(Object.keys(inc).some(k=>!['auto','cn'].includes(k)))throw new Err(409,'laeuft','Nach dem Start lassen sich nur Automatik und Platznamen ändern.');
      m.cfg=cleanCfg(allowed,m.cfg,this.E);
      if(this.E.S&&'cn' in allowed){const cn=m.cfg.cn.slice(0,this.E.S.courts);if(cn.some(Boolean))this.E.S.cn=cn;else delete this.E.S.cn}
    }else m.cfg=cleanCfg(inc,m.cfg,this.E);
    this.commit(c.who,'config',null);this.autoStep();return{cfg:m.cfg};
  },
  'POST admin/add'(c){
    this.need(c.who,'admin');needLobby(this);const m=this.m;
    const name=cleanName(c.body.name);if(name===null)throw bad('Bitte einen Namen mit 1 bis 24 Zeichen eingeben (ohne < oder >).','name');
    if(m.players.length>=MAXP)throw new Err(409,'voll','Das Turnier ist voll.');
    if(!nameFree(this,name,0))throw new Err(409,'name_vergeben','Dieser Name ist schon vergeben.');
    const p={id:m.nextPid++,name,hash:null,released:false};m.players.push(p);this.commit(c.who,'add',p.id);return{pid:p.id};
  },
  'POST admin/rename'(c){
    this.need(c.who,'admin');const p=playerById(this,c.body.pid);
    const name=cleanName(c.body.name);if(name===null)throw bad('Bitte einen Namen mit 1 bis 24 Zeichen eingeben (ohne < oder >).','name');
    if(!nameFree(this,name,p.id))throw new Err(409,'name_vergeben','Dieser Name ist schon vergeben.');
    p.name=name;if(this.E.S)this.E.S.names[this.idxOf(p.id)]=name;
    this.commit(c.who,'rename',p.id);return{};
  },
  'POST admin/kick'(c){
    this.need(c.who,'admin');needLobby(this);const p=playerById(this,c.body.pid);
    this.m.players=this.m.players.filter(x=>x.id!==p.id);this.commit(c.who,'kick',p.id);return{};
  },
  'POST admin/release'(c){
    this.need(c.who,'admin');const p=playerById(this,c.body.pid);
    p.hash=null;p.released=true;this.commit(c.who,'release',p.id);return{};
  },
  'POST admin/start'(c){
    this.need(c.who,'admin');needLobby(this);const m=this.m,E=this.E,n=m.players.length;
    if(n<MINP)throw new Err(409,'zu_wenige','Zum Start braucht es mindestens '+MINP+' Spieler.');
    const cfg=m.cfg;
    E.createTournament({n,R:cfg.R,names:m.players.map(p=>p.name),lim:cfg.lim,courts:cfg.courts,dur:cfg.dur,brk:cfg.brk,draw:cfg.draw,cn:cfg.cn,wu:cfg.wu,t0:cfg.t0,ov:cfg.ov,lead:cfg.lead});
    m.S=E.S;m.status='running';m.res={};m.reqs=[];
    this.commit(c.who,'start',n);this.autoStep();return{};
  },
  'GET admin/export'(c){
    this.need(c.who,'admin');return{backup:this.backup()};
  },
  'POST admin/result'(c){return setResult(this,c.who,c.body,true)},
  'POST admin/drop'(c){
    this.need(c.who,'admin');needRunning(this);const p=playerById(this,c.body.pid),i=this.idxOf(p.id);
    if(!this.E.canDrop(i))throw new Err(409,'nicht_moeglich','Ausscheiden ist jetzt nicht möglich (mindestens '+MINP+' Spieler müssen bleiben).');
    this.E.doDrop(i);this.m.reqs=this.m.reqs.filter(r=>r.pid!==p.id);
    this.commit(c.who,'drop',p.id);this.autoStep();return{};
  },
  'POST admin/dismiss'(c){
    this.need(c.who,'admin');const pid=c.body.pid,n=this.m.reqs.length;
    this.m.reqs=this.m.reqs.filter(r=>r.pid!==pid);if(this.m.reqs.length!==n)this.commit(c.who,'dismiss',pid);return{};
  },
  'POST admin/assign'(c){
    this.need(c.who,'admin');needRunning(this);const E=this.E;
    let n=0;
    if(!E.isOver()){if(E.S.ov)n=(c.body&&c.body.force&&E.S.wait)?E.rollAddNow():E.assignGames();else if(E.canAdvance())n=E.advanceRound()?1:0}
    this.reconcile();if(n)this.commit(c.who,'assign',n);return{assigned:n};
  },
  'POST admin/pair'(c){
    this.need(c.who,'admin');needRunning(this);const E=this.E,b=c.body||{};
    if(E.isOver())throw new Err(409,'nicht_moeglich','Das Turnier ist schon fertig.');
    const e=E.manualAdd(b.a,b.b,b.c);if(e)throw new Err(409,'nicht_moeglich',e);
    this.reconcile();this.commit(c.who,'pair',1);return{assigned:1};
  },
  'POST admin/undo'(c){
    this.need(c.who,'admin');needRunning(this);
    if(c.body.confirm!==true)throw bad('Bitte das Zurücknehmen bestätigen.','bestaetigen');
    const E=this.E,ok=E.S.ov?E.undoRoll():E.undoClassic();
    if(!ok)throw new Err(409,'nicht_moeglich','Hier gibt es nichts zurückzunehmen.');
    this.reconcile();this.commit(c.who,'undo',null);return{};
  },
  'POST admin/end'(c){
    this.need(c.who,'admin');
    if(c.body.confirm!==true)throw bad('Bitte das Beenden bestätigen.','bestaetigen');
    this.m=null;this.E.S=null;this.dirty=false;this.wipe=true;return{ended:true};
  },
};

function setResult(t,who,b,asAdmin){
  const E=t.E,m=t.m;
  if(asAdmin)t.need(who,'admin');else t.need(who,'any');
  needRunning(t);
  const g=t.findGame(b.gid),admin=who.role==='admin';
  const sa=b.sa,sb=b.sb;
  if(!isInt(sa,0,99)||!isInt(sb,0,99))throw bad('Bitte ganze Zahlen von 0 bis 99 eintragen.','ergebnis');
  if(!E.S.draw&&sa===sb)throw bad('Unentschieden sind in diesem Turnier nicht erlaubt.','unentschieden');
  const was=E.done(g.m),same=was&&g.m.sa===sa&&g.m.sb===sb,r=m.res[g.m.gid];
  if(!admin){
    const i=t.idxOf(who.pid);
    if(g.m.a!==i&&g.m.b!==i)throw new Err(403,'verboten','Nur die beiden Spieler (oder der Organisator) tragen das Ergebnis ein.');
    if(E.isOut(i))throw new Err(403,'ausgeschieden','Ausgeschiedene Spieler tragen nichts mehr ein.');
    if(!same){
      if(g.locked)throw new Err(409,'gesperrt','Dieses Spiel ist abgeschlossen. Bitte den Organisator fragen.');
      if(was&&r&&(r.st==='confirmed'||r.st==='admin'))throw new Err(409,'bestaetigt','Das Ergebnis ist bereits bestätigt. Bitte den Organisator fragen.');
    }
  }else if(g.locked&&!same&&b.force!==true)throw new Err(409,'gesperrt','Das Spiel ist abgeschlossen. Zum Ändern bitte das Überschreiben bestätigen.');
  const key=admin?'admin':who.pid,tm=t.now();
  if(same){
    if(admin){if(!r||r.st!=='admin'){m.res[g.m.gid]={by:'admin',st:'admin',at:tm,n:0};t.commit(who,'result',g.m.gid);t.autoStep()}return{st:'admin'}}
    if(r&&r.by!==key&&(r.st==='reported'||r.st==='disputed')){r.st='confirmed';r.at=tm;t.commit(who,'confirm',g.m.gid);t.autoStep();return{st:'confirmed'}}
    return{st:r?r.st:'reported'};
  }
  if(g.kind==='roll'){E.scoreRoll(g.i,'a',sa);E.scoreRoll(g.i,'b',sb)}
  else if(g.kind==='classic'){E.scoreClassic(g.ri,g.mi,'a',sa);E.scoreClassic(g.ri,g.mi,'b',sb)}
  else{E.scoreSO(g.i,'a',sa);E.scoreSO(g.i,'b',sb)}
  const n=(r&&r.n||0)+(was?1:0);
  m.res[g.m.gid]=admin?{by:'admin',st:'admin',at:tm,n}:{by:who.pid,st:n>=3?'disputed':'reported',at:tm,n};
  t.commit(who,'result',g.m.gid);t.autoStep();
  return{st:m.res[g.m.gid]?m.res[g.m.gid].st:'reported'};
}
