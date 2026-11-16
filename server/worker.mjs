// Cloudflare Worker + Durable Object. Dünne Hülle um server/core.mjs.
// Routen: POST /api/t (anlegen), /api/t/<CODE>/<pfad> (siehe core.mjs), GET /api/health. Alles andere liefern die statischen Dateien.
import {Tournament,CODE_RE,newCode,ROUTE_KEYS,TTL} from './core.mjs';
import {sha256} from './sha256.mjs';
import {Limiter} from './limiter.mjs';

const MAX_BODY=4096,MAX_RESTORE=400000; // Sicherungsdateien sind größer; sie werden erst nach der Schlüsselprüfung gelesen
const J=(status,body,extra={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; frame-ancestors 'none'",'referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow',...extra}});
const fail=(status,err,msg)=>J(status,{ok:false,err,msg});
// Fehlerprotokoll (Cloudflare Workers Logs). Nur technische Angaben: nie Namen, Zugangsschlüssel oder Netzwerkadressen.
const log=(level,ev,info={})=>{try{console[level](JSON.stringify({ev,...info}))}catch(e){}};

async function readJson(request,max=MAX_BODY){
  const len=+request.headers.get('content-length')||0;
  if(len>max)return{err:fail(413,'zu_gross','Die Anfrage ist zu groß.')};
  const text=await request.text();
  if(text.length>max)return{err:fail(413,'zu_gross','Die Anfrage ist zu groß.')};
  if(!text)return{body:{}};
  try{return{body:JSON.parse(text)}}catch(e){return{err:fail(400,'json','Die Anfrage ist kein gültiges JSON.')}}
}
const bearer=r=>{const h=r.headers.get('authorization')||'';return h.startsWith('Bearer ')?h.slice(7).trim():null};

export default{
  async fetch(request,env){
    const url=new URL(request.url),p=url.pathname.replace(/\/+$/,'')||'/';
    if(!p.startsWith('/api/')&&p!=='/api')return env.ASSETS?env.ASSETS.fetch(request):fail(404,'unbekannt','Nicht gefunden.');
    if(p==='/api/health')return J(200,{ok:true});
    // Turnier anlegen (nur mit Schlüssel des Organisators)
    if(p==='/api/t'){
      if(request.method!=='POST')return fail(405,'methode','Nur POST.');
      const key=env.CREATE_KEY;
      if(!key&&env.ALLOW_OPEN_CREATE!=='1')return fail(503,'nicht_eingerichtet','Der Server ist noch nicht eingerichtet (CREATE_KEY fehlt).');
      const keyOk=!key||sha256(request.headers.get('x-create-key')||'')===sha256(key);
      // Raten des Schlüssels und Massen-Anlegen bremsen (pro IP, siehe server/limiter.mjs)
      let verdict;
      if(env.LIMITER){
        try{
          const res=await env.LIMITER.get(env.LIMITER.idFromName('anlegen')).fetch('https://do/attempt',{method:'POST',body:JSON.stringify({ip:request.headers.get('cf-connecting-ip')||'-',keyOk})});
          verdict=await res.json();
        }catch(e){return fail(503,'limiter','Bitte gleich noch einmal versuchen.')}
      }else verdict=keyOk?{allowed:true}:{allowed:false,reason:'schluessel'};
      if(!verdict.allowed){
        if(verdict.reason==='gesperrt')return J(429,{ok:false,err:'gesperrt',msg:'Zu viele falsche Schlüssel. Bitte in 15 Minuten noch einmal versuchen.'},{'retry-after':'900'});
        if(verdict.reason==='zu_viele')return J(429,{ok:false,err:'zu_viele',msg:'Zu viele neue Turniere in kurzer Zeit. Bitte später noch einmal versuchen.'},{'retry-after':'3600'});
        return fail(403,'schluessel','Falscher Schlüssel.');
      }
      const r=await readJson(request,MAX_RESTORE);if(r.err)return r.err;
      for(let k=0;k<6;k++){
        const code=newCode(),stub=env.TOURNAMENT.get(env.TOURNAMENT.idFromName(code));
        const res=await stub.fetch('https://do/init',{method:'POST',headers:{'x-code':code,'content-type':'application/json'},body:JSON.stringify({cfg:r.body&&r.body.cfg,restore:r.body&&r.body.restore})});
        if(res.status===409)continue;
        return new Response(res.body,{status:res.status,headers:res.headers});
      }
      return fail(503,'code','Kein freier Turniercode gefunden.');
    }
    const m=/^\/api\/t\/([^/]+)\/(.+)$/.exec(p);
    if(!m)return fail(404,'unbekannt','Unbekannter Pfad.');
    const code=m[1].toUpperCase(),sub=m[2],route=request.method+' '+sub;
    if(!CODE_RE.test(code))return fail(404,'nicht_gefunden','Dieses Turnier gibt es nicht.');
    if(!ROUTE_KEYS().includes(route)||sub==='init')return fail(404,'unbekannt','Unbekannter Pfad.');
    let body={};
    if(request.method==='POST'){const r=await readJson(request);if(r.err)return r.err;body=r.body}
    const stub=env.TOURNAMENT.get(env.TOURNAMENT.idFromName(code));
    return stub.fetch('https://do/'+sub+url.search,{method:request.method,headers:{'x-code':code,'x-token':bearer(request)||'','x-ip':request.headers.get('cf-connecting-ip')||'','content-type':'application/json'},body:request.method==='POST'?JSON.stringify(body):undefined});
  }
};

// Zählt Anlege-Versuche aller Besucher (eine einzige Instanz, nur im Arbeitsspeicher)
export class LimiterDO{
  constructor(state,env){this.l=new Limiter(()=>(env&&env.NOW?env.NOW():Date.now()))}
  async fetch(request){
    let b={};try{b=JSON.parse(await request.text()||'{}')}catch(e){}
    const v=this.l.attempt(String(b.ip||'-').slice(0,64),b.keyOk===true);
    if(v.reason==='gesperrt'||v.reason==='zu_viele')log('warn','limiter',{grund:v.reason});
    return J(200,v);
  }
}

export class TournamentDO{
  constructor(state,env){
    this.state=state;this.env=env;
    // env.NOW und env.RAND gibt es nur in Tests (Zeitreise, feste Zufallswerte)
    this.opts={now:()=>(env&&env.NOW?env.NOW():Date.now()),rand:env&&env.RAND?env.RAND:undefined};
    this.t=new Tournament(null,this.opts);
    state.blockConcurrencyWhile(async()=>{const d=await state.storage.get('t');this.t=new Tournament(d||null,this.opts)});
  }
  async fetch(request){
    const url=new URL(request.url),path=url.pathname.slice(1);
    let body;
    if(request.method==='POST'){try{body=JSON.parse(await request.text()||'{}')}catch(e){body={}}}
    const q={};for(const [k,v] of url.searchParams)q[k]=v;
    const res=this.t.handle({method:request.method,path,token:request.headers.get('x-token')||null,body,query:q,ip:request.headers.get('x-ip')||'',code:request.headers.get('x-code')||''});
    if(res.status===500){const e=this.t.lastError;log('error','intern',{route:request.method+' '+path,fehler:e&&e.message,stack:e&&e.stack?String(e.stack).split('\n').slice(0,4).join(' | '):undefined})}
    try{
      if(res.wipe){await this.state.storage.deleteAll();this.t=new Tournament(null,this.opts)}
      else if(res.dirty){await this.state.storage.put('t',this.t.toJSON());await this.state.storage.setAlarm(this.t.expiresAt())}
    }catch(e){
      // Speichern fehlgeschlagen: Stand aus dem Speicher neu laden, damit nichts Halbes im Arbeitsspeicher bleibt
      log('error','speichern',{route:request.method+' '+path,fehler:e&&e.message});
      this.t=new Tournament((await this.state.storage.get('t'))||null,this.opts);
      return J(503,{ok:false,err:'speichern',msg:'Speichern fehlgeschlagen. Bitte noch einmal versuchen.'});
    }
    return J(res.status,res.body);
  }
  async alarm(){
    if(!this.t.exists())return;
    if(this.t.now()>=this.t.expiresAt()){await this.state.storage.deleteAll();this.t=new Tournament(null,this.opts)}
    else await this.state.storage.setAlarm(this.t.expiresAt());
  }
}
