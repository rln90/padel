const {chromium}=require('playwright');
const URL='file://'+require('./paths').HTML;
const lum=c=>{const [r,g,b]=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*b};
const cr=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
(async()=>{const b=await chromium.launch();
for(const scheme of ['light','dark']){
 for(const mode of ['no','yes']){
  const ctx=await b.newContext({viewport:{width:390,height:844},colorScheme:scheme});const p=await ctx.newPage();
  await p.goto(URL);
  await p.selectOption('#ov',mode);await p.selectOption('#n','9');await p.selectOption('#c','3');
  await p.evaluate(()=>start());
  await p.evaluate(()=>{document.querySelectorAll('#cur .m').forEach(r=>{const x=r.querySelectorAll('input');x[0].value=6;x[0].dispatchEvent(new Event('input',{bubbles:true}));x[1].value=3;x[1].dispatchEvent(new Event('input',{bubbles:true}))})});
  const g=await p.$('#act button:not(.quiet):not([disabled])');if(g)await g.click();
  const res=await p.evaluate(()=>{
    const out={low:[],small:[],noname:[],tiny:[]};
    const parse=s=>(s.match(/[\d.]+/g)||[]).slice(0,4).map(Number);
    const bgOf=el=>{while(el){const c=getComputedStyle(el).backgroundColor;const v=parse(c);if(c&&!(v.length===4&&v[3]===0)&&c!=='rgba(0, 0, 0, 0)')return v.slice(0,3);el=el.parentElement}return [255,255,255]};
    document.querySelectorAll('body *').forEach(el=>{
      if(!el.childNodes.length)return;const t=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(' ');
      if(!t)return;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none'||el.offsetParent===null&&cs.position!=='fixed')return;
      const fg=parse(cs.color).slice(0,3),bg=bgOf(el);
      out.low.push({t:t.slice(0,30),fg,bg,fs:parseFloat(cs.fontSize),el:el.tagName+'.'+el.className});
    });
    document.querySelectorAll('button,select,input,summary').forEach(el=>{const r=el.getBoundingClientRect();if(r.width&&(r.height<36))out.small.push(el.tagName+' '+(el.className||el.id)+' '+Math.round(r.height));
      if(el.tagName==='INPUT'&&parseFloat(getComputedStyle(el).fontSize)<16)out.tiny.push('input '+getComputedStyle(el).fontSize);
      if(!(el.textContent.trim()||el.getAttribute('aria-label')||el.labels&&el.labels.length||el.title))out.noname.push(el.tagName+' '+(el.id||el.className))});
    return out});
  const low=res.low.map(o=>({...o,cr:+cr(o.fg,o.bg).toFixed(2)})).filter(o=>o.cr<(o.fs>=18?3:4.5));
  console.log(scheme,mode,'| Kontrast <4.5:',low.length,low.slice(0,6).map(o=>`${o.t}(${o.cr},${o.fs}px)`).join('; '),'| kleine Ziele:',[...new Set(res.small)].slice(0,6).join(','),'| Input<16px:',res.tiny.length,'| ohne Namen:',res.noname.join(','));
  await ctx.close();}
}
await b.close()})();
