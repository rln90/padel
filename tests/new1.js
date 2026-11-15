const setNames=(w,l)=>{const ins=[...w.document.querySelectorAll('#nf input[data-k="p"]')];ins.forEach(i=>{i.value='';i.dispatchEvent(new w.Event('input',{bubbles:true}))});l.forEach((v,i)=>{if(ins[i]){ins[i].value=v;ins[i].dispatchEvent(new w.Event('input',{bubbles:true}))}})};
// Neue Testarten: (A) Invarianten über komplette Turniere, (B) Speichern/Laden-Metamorphose, (C) Namens-Injektion, (D) Fuzzing des Speicherstands
const load=require('./harness2.js');const A=load(require('./paths').HTML);
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(require('./paths').HTML,'utf8');
const rnd=n=>Math.floor(Math.random()*n);const key=(a,b)=>a<b?a+'-'+b:b+'-'+a;
const res={};const bad=(k,m)=>{res[k]=res[k]||{n:0,ex:m};res[k].n++};
function sc(draw){const k=rnd(10);if(k<3)return[6,rnd(2)?0:5];if(k<5)return[rnd(2)?0:5,6];const a=rnd(7);if(!draw){return[a,(a+1+rnd(6))%8]}return[a,a]}
// A + B
let turn=0,statesChecked=0;
for(const mode of ['yes','wait']){for(let t=0;t<350;t++){
  const n=4+rnd(17),R=A.validR(n,3+rnd(5)),c=1+rnd(Math.floor(n/2)),draw=rnd(2)===0;
  A.S={n,R,names:[...Array(n).keys()].map(i=>'P'+i),lim:true,courts:c,dur:20,brk:5,draw,ov:true,wait:mode==='wait',games:[],rk:Array.from({length:n},Math.random)};A.justDone.clear();
  const G=A.totalGames(n,R);let guard=0;
  const inv=()=>{statesChecked++;
    const run=A.S.games.filter(m=>!m.fin&&!A.done(m));
    if(run.length>c)bad('A1 mehr laufende Spiele als Plätze',{n,c,run:run.length});
    const seen=new Set();for(const m of run){if(m.a===m.b)bad('A2 Spieler gegen sich selbst',{n});for(const p of [m.a,m.b]){if(seen.has(p))bad('A3 Spieler in zwei laufenden Spielen',{n,p});seen.add(p)}}
    const cs=run.map(m=>m.c);if(new Set(cs).size!==cs.length)bad('A4 zwei laufende Spiele auf einem Platz',{n,cs});
    const cnt=Array(n).fill(0);A.S.games.forEach(m=>{cnt[m.a]++;cnt[m.b]++});if(Math.max(...cnt)>R)bad('A5 Spieler hat mehr als R Spiele',{n,R,cnt});
    // B: Speichern/Laden ändert nichts an der nächsten Ansetzung
    const snap=JSON.stringify(A.S),p1=JSON.stringify(A.rollPick(A.rollState(),Math.max(0,c-run.length)));
    const keep=A.S;A.S=JSON.parse(snap);const p2=JSON.stringify(A.rollPick(A.rollState(),Math.max(0,c-run.length)));A.S=keep;
    if(p1!==p2)bad('B Speichern/Laden ändert Ansetzung',{n,c});
    // Idempotenz: sofortiges zweites rollAdd ohne neue Ergebnisse darf nichts ändern
    const L=A.S.games.length;A.rollAdd();const L2=A.S.games.length;A.rollAdd();if(A.S.games.length!==L2)bad('A6 rollAdd nicht idempotent',{n,c});
  };
  A.rollAdd();inv();
  while(guard++<3000){const l=A.S.games.filter(m=>!m.fin&&!A.done(m));
    if(!l.length){if(A.S.games.length>=G)break;A.rollAdd();inv();if(!A.S.games.some(m=>!m.fin&&!A.done(m)))break;continue}
    const m=l[rnd(l.length)];const s=sc(draw);m.sa=s[0];m.sb=s[1];A.rollAdd();inv()}
  turn++;
  if(A.S.games.length!==G)bad('A7 Turnier nicht vollständig ('+A.S.games.length+'/'+G+')',{n,R,c,mode});
  else{const cnt=Array(n).fill(0);A.S.games.forEach(m=>{cnt[m.a]++;cnt[m.b]++});
    const lo=Math.min(...cnt),hi=Math.max(...cnt);if(n%2===0&&(lo!==R||hi!==R))bad('A8 ungleiche Spielzahl (gerade n)',{n,R,cnt});
    if(n%2===1){/* ungerade: Zusatzspiel-Regel, Abweichung höchstens 1 */ if(hi-lo>1)bad('A8 Abweichung >1 bei ungeraden n',{n,R,cnt})}}
}}
console.log('A/B: Turniere',turn,'Zustände geprüft',statesChecked,'Verstöße',JSON.stringify(res));
// C Namens-Injektion
const evil=['<img src=x onerror="window.__pwn=1">','"><script>window.__pwn=2</script>','&lt;b&gt;','A\'B"C','😀 Ünï','x'.repeat(200),'</td><td>','<svg onload=window.__pwn=3>'];
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>errs.push(e.message));
const w=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true}).window;
const q=s=>w.document.querySelector(s);
try{
  q('#n').value='8';q('#n').dispatchEvent(new w.Event('change',{bubbles:true}));
  setNames(w,evil);console.log('Felder da:',w.document.querySelectorAll('#nf input').length)
  w.start();
  const fillAll=()=>[...w.document.querySelectorAll('#cur .m')].forEach((r,i)=>{const x=r.querySelectorAll('input');x[0].value='3';x[0].dispatchEvent(new w.Event('input',{bubbles:true}));x[1].value='2';x[1].dispatchEvent(new w.Event('input',{bubbles:true}))});
  fillAll();
}catch(e){errs.push('Ausnahme: '+e.message)}
const injected=w.document.querySelectorAll('img[src="x"],svg[onload],script:not([src])').length;
const pwn=w.__pwn;
const anyImg=[...w.document.querySelectorAll('img')].length;
console.log('C: Skripte/Bilder aus Namen entstanden:',[...w.document.querySelectorAll('body img, body svg[onload]')].length,'| __pwn:',pwn,'| Fehler:',errs.length,errs.slice(0,2).join(' / '));
console.log('C: Namen als Text sichtbar:',evil.slice(0,2).every(e=>w.document.body.textContent.includes(e)));
// D Fuzzing des Speicherstands
const saved=w.localStorage.getItem('padel-turnier-v2');
function mut(o,d=0){if(Array.isArray(o)){const a=o.map(x=>mut(x,d+1));if(rnd(8)===0)a.splice(rnd(a.length+1),rnd(3));return a}
  if(o&&typeof o==='object'){const r={};for(const k of Object.keys(o)){if(rnd(10)===0)continue;r[k]=mut(o[k],d+1)}if(rnd(12)===0)r.junk=[1];return r}
  const z=rnd(14);if(z===0)return null;if(z===1)return 'x';if(z===2)return -1;if(z===3)return 1e9;if(z===4)return undefined;if(z===5)return NaN;if(z===6)return [];return o}
let fz=0,fzBad=0;const fzEx=[];
if(saved){const base=JSON.parse(saved);
for(let i=0;i<300;i++){const s=JSON.stringify(mut(base));const e2=[];const vc2=new VirtualConsole();vc2.on('jsdomError',e=>e2.push(e.message));
  let w2;try{w2=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc2,pretendToBeVisual:true,beforeParse(x){x.localStorage.setItem('padel-turnier-v2',s)}}).window}catch(e){e2.push('Konstruktor: '+e.message)}
  fz++;const ok=w2&&w2.document.body&&w2.document.body.textContent.length>20;if(e2.length||!ok){fzBad++;if(fzEx.length<3)fzEx.push((e2[0]||'leer').slice(0,120)+' | '+s.slice(0,80))}
  try{w2&&w2.close()}catch(e){}}}
console.log('D: Fuzz-Speicherstände',fz,'mit Fehler/leerer Seite',fzBad,fzEx.join('\n   '));
