const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(require('./paths').HTML,'utf8');
const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
const q=(w,s)=>w.document.querySelector(s);
const set=(w,id,v)=>{q(w,id).value=String(v);q(w,id).dispatchEvent(new w.Event('change',{bubbles:true}))};
(async()=>{
const [n,R,c,dur,brk]=process.argv.slice(2).map(Number);
const w=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true}).window;
set(w,'#n',n);set(w,'#r',R);set(w,'#c',c);set(w,'#dur',dur);set(w,'#brk',brk);
for(const mode of ['no','yes','wait']){
 set(w,'#ov',mode);
 if(mode==='wait')for(const sec of ['50','75','95']){const t=Date.now();set(w,'#sec',sec);console.log('--',mode,sec,(Date.now()-t)+'ms');console.log(q(w,'#sum').textContent.replace(/\s+/g,' ').slice(0,700))}
 else {console.log('--',mode);console.log(q(w,'#sum').textContent.replace(/\s+/g,' ').slice(0,300))}
}
await new Promise(r=>setTimeout(r,1500));
console.log('Vergleich:',q(w,'#ptab').textContent.replace(/\s+/g,' ').slice(0,500));console.log('Fehler',errs.length,errs[0]||'');
})();
