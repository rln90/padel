const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(require('./paths').HTML,'utf8');
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>errs.push(e.message));
const q=(w,s)=>w.document.querySelector(s),qa=(w,s)=>[...w.document.querySelectorAll(s)];
const set=(w,id,v)=>{q(w,id).value=String(v);q(w,id).dispatchEvent(new w.Event('change',{bubbles:true}))};
const type=(w,i,v)=>{i.value=String(v);i.dispatchEvent(new w.Event('input',{bubbles:true}))};
let found=0;
for(const mode of ['yes','no','wait'])for(const dr of [1,2,3,4]){
  const w=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true}).window;
  set(w,'#n',8);set(w,'#r',4);set(w,'#ov',mode);set(w,'#c',2);w.start();
  let step=0,dropped=false,txt='';
  for(let g=0;g<150;g++){
    qa(w,'#cur .m').forEach(r=>{const x=r.querySelectorAll('input');if(x[0]&&x[0].value===''){type(w,x[0],6);type(w,x[1],3)}});
    const t=qa(w,'#cur .note').map(e=>e.textContent).join('|');if(/nur für/.test(t))txt=t;
    if(!dropped&&++step===dr*2&&q(w,'#dropsel')){q(w,'#dropsel').value='3';const b=()=>qa(w,'#outc button')[0];b().click();b().click();dropped=true;continue}
    const b=qa(w,'#act button').find(b=>/Nächste|ansetzen|erstellen/i.test(b.textContent)&&!b.disabled);if(!b)break;b.click();
  }
  if(txt){found++;console.log(mode,dr,'→',txt)}
}
console.log('Fälle mit Zusatzspiel-Hinweis:',found,'JS-Fehler:',errs.length);
