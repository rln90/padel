// Fuzz: zufällige/bösartige Eingaben dürfen nie 5xx erzeugen; abgelehnte Aufrufe ändern den Zustand nicht.
import {makeEnv,client,seeded} from './harness.mjs';
const N=+process.argv[2]||40;let bad=0,calls=0,rej=0;const ex=[];
const fail=(m,i)=>{bad++;if(ex.length<8)ex.push({m,i})};
for(let seed=1;seed<=N;seed++){
  const rng=seeded(seed*31+7),ri=n=>Math.floor(rng()*n),pick=a=>a[ri(a.length)];Math.random=seeded(seed);
  const env=makeEnv({evict:.3,evictRng:seeded(seed)}),call=client(env);
  const cr=await call('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{cfg:{R:4,courts:2,auto:'confirmed'}}});
  const code=cr.json.code,adm=cr.json.adminKey,P=`/api/t/${code}`,toks=[];
  for(let i=0;i<6;i++)toks.push((await call('POST',P+'/join',{body:{name:'P'+i}})).json.token);
  await call('POST',P+'/admin/start',{token:adm});
  const big='x'.repeat(100000),weird=[null,undefined,NaN,Infinity,-1,1e99,0.5,'','0','<script>',big,[],{},[1,2],{__proto__:{a:1}},true,'‮ \ud800',-0,2**53,'9'.repeat(400)];
  const paths=['state','result','confirm','dispute','drop-request','join','admin/start','admin/result','admin/assign','admin/undo','admin/drop','admin/rename','admin/kick','admin/finish','nope','../x','','%00','admin/'];
  const gen=d=>d>2?pick(weird):pick([()=>pick(weird),()=>({}),()=>{const o={};for(let i=0;i<ri(5);i++)o[pick(['gid','sa','sb','pid','name','force','confirm','token','cfg','R','__proto__','constructor','auto'])]=gen(d+1);return o},()=>[gen(d+1)]])();
  for(let k=0;k<400;k++){
    const before=JSON.stringify((await call('GET',P+'/state',{token:adm})).json);
    let tk=pick([adm,pick(toks),'x',null,'a_'+'A'.repeat(24),'p_'+'A'.repeat(24),big.slice(0,5000)]);
    const m0=pick(['GET','POST','POST','POST','PUT','DELETE','OPTIONS','PATCH']);let p=pick(paths);
    let body=gen(0);let m=m0;if(rng()<.1)body=pick(['{bad','null','[]','1','"s"']);
    if(rng()<.5){m='POST'; // gezielt: echte Spielnummer, gültige Marke, böse Werte
      const V=(await call('GET',P+'/state',{token:adm})).json,S=V.S,G=(S.ov?S.games:S.rounds.flatMap(r=>r.m)).concat(S.so||[]);
      if(G.length){const g=pick(G);body={gid:rng()<.8?g.gid:pick(weird),sa:rng()<.5?ri(8):pick(weird),sb:rng()<.5?ri(8):pick(weird),force:pick([true,false,'1',undefined]),pid:pick(weird)};
        if(rng()<.7)tk=pick([adm,toks[g.a],toks[g.b],toks[ri(6)]]);
        p=pick(['result','result','confirm','dispute','admin/result','admin/drop','admin/rename'])}}
    let r;try{r=await call(m,P+'/'+p,{token:tk,body,raw:typeof body==='string'?body:undefined})}catch(e){fail('Ausnahme '+e.message,{m,p});continue}
    calls++;
    if(r.status>=500)fail('5xx '+r.status,{m,p,t:r.text.slice(0,150)});
    if(r.status>=400){rej++;const after=JSON.stringify((await call('GET',P+'/state',{token:adm})).json);if(after!==before)fail('Abgelehnter Aufruf änderte Zustand '+r.status,{m,p,body:JSON.stringify(body)?.slice(0,100)})}
  }
  for(const p of ['/api/t','/api/t/ABC','/api/t/'+'A'.repeat(5000),'/api/zzz','/','/api/t/%ZZ']){
    for(const m of ['GET','POST']){const r=await call(m,p,{body:gen(0)});calls++;if(r.status>=500)fail('5xx '+r.status,{m,p})}}
}
console.log(JSON.stringify({seeds:N,aufrufe:calls,abgelehnt:rej,verstoesse:bad,beispiele:ex}));
process.exit(bad?1:0);
