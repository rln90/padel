// Test-Harness: Worker und Durable Object in Node, mit nachgebautem Speicher (kein Cloudflare nötig).
import worker,{TournamentDO,LimiterDO,DirectoryDO} from '../../server/worker.mjs';

// Das Fehlerprotokoll des Servers soll die Testausgabe nicht füllen (mit PADEL_LOGS=1 sichtbar)
if(!process.env.PADEL_LOGS){console.warn=()=>{};console.error=()=>{};console.info=()=>{}}
export function seeded(seed){return()=>{seed=(seed+0x6D2B79F5)>>>0;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}

export function makeEnv(opts={}){
  const stores=new Map(),inst=new Map(),alarms=new Map();
  const env={CREATE_KEY:('createKey' in opts)?opts.createKey:'geheim',ALLOW_OPEN_CREATE:opts.open?'1':undefined,NOW:opts.now||(()=>env.clock),clock:1.7e12,
    RAND:opts.rand,
    stats:{evictions:0,puts:0},
    TOURNAMENT:{
      idFromName:n=>n,
      get(name){
        return{async fetch(url,init){
          const req=url instanceof Request?url:new Request(url,init);
          if(!stores.has(name))stores.set(name,new Map());
          const st=stores.get(name);
          if(opts.evict&&inst.has(name)&&(opts.evictRng||Math.random)()<opts.evict){inst.delete(name);env.stats.evictions++}
          let o=inst.get(name);
          if(!o){
            const state={storage:{
              async get(k){const v=st.get(k);return v===undefined?undefined:structuredClone(v)},
              async put(k,v){if(opts.failPut&&opts.failPut()){throw new Error('put fail')}st.set(k,structuredClone(v));env.stats.puts++},
              async deleteAll(){st.clear()},
              async setAlarm(t){alarms.set(name,t)},async deleteAlarm(){alarms.delete(name)},async getAlarm(){return alarms.get(name)||null}},
              async blockConcurrencyWhile(f){return f()}};
            o=new TournamentDO(state,env);inst.set(name,o);
            await state.blockConcurrencyWhile(async()=>{}); // Konstruktor-Ladevorgang abwarten
            await new Promise(r=>setTimeout(r,0));
          }
          return o.fetch(req);
        }}
      }},
    async alarmAll(){for(const [name,t] of alarms)if(t<=env.NOW()){const o=inst.get(name);if(o)await o.alarm();else{/* geladen nötig */ }}},
    _stores:stores,_inst:inst,_alarms:alarms,
  };
  if(!opts.noLimiter){const lo=new LimiterDO({},env);env.LIMITER={idFromName:n=>n,get(){return{fetch:(u,i)=>lo.fetch(u instanceof Request?u:new Request(u,i))}}}}
  if(!opts.noDirectory){
    const ds=new Map(),state={storage:{async get(k){const v=ds.get(k);return v===undefined?undefined:structuredClone(v)},async put(k,v){ds.set(k,structuredClone(v));env.stats.dirPuts=(env.stats.dirPuts||0)+1},async delete(k){return ds.delete(k)},
      async list({prefix}={}){return new Map([...ds].filter(([k])=>!prefix||k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]))}}};
    const dd=new DirectoryDO(state,env);env._dir=ds;
    env.VERZEICHNIS={idFromName:n=>n,get(){return{fetch:(u,i)=>{if(opts.dirFail&&opts.dirFail())return Promise.reject(new Error('Verzeichnis nicht erreichbar'));return dd.fetch(u instanceof Request?u:new Request(u,i))}}}};
  }
  return env;
}
export function client(env,log){
  const call=async(method,path,{token,body,raw,headers}={})=>{
    const init={method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(headers||{})}};
    if(method==='POST'){init.body=raw!==undefined?raw:JSON.stringify(body||{});init.headers['content-type']='application/json'}
    const res=await worker.fetch(new Request('https://padel.test'+path,init),env);
    const text=await res.text();let json=null;try{json=JSON.parse(text)}catch(e){}
    if(log)log(text);
    return{status:res.status,json,text};
  };
  return call;
}
