const {chromium}=require('playwright');
const SET=`(r,a,b)=>{const i=r.querySelectorAll('input');i[0].value=a;i[0].dispatchEvent(new Event('input',{bubbles:true}));i[1].value=b;i[1].dispatchEvent(new Event('input',{bubbles:true}))}`;
(async()=>{
  const b=await chromium.launch();let bad=0;
  for(const w of [320,360,390,768]){
    for(const [ov,c,n,state] of [['no',3,9,'setup'],['wait',4,9,'setup'],['yes',4,9,'setup'],['no',3,9,'run'],['wait',3,9,'run'],['yes',3,9,'run'],['yes',4,12,'run'],['yes',3,9,'end']]){
      const ctx=await b.newContext({viewport:{width:w,height:800}});const p=await ctx.newPage();
      await p.goto('file://'+require('./paths').HTML);
      await p.selectOption('#n',String(n));await p.selectOption('#c',String(c));await p.selectOption('#ov',ov);
      await p.evaluate(()=>document.querySelector('details.cmp').open=true);
      if(state!=='setup'){
        await p.evaluate(()=>start());
        const loops=state==='end'?80:4;
        for(let k=0;k<loops;k++){
          await p.evaluate(`(()=>{const set=${SET};[...document.querySelectorAll('#cur .m')].forEach((r,i)=>{const x=r.querySelectorAll('input');if(x[0].value==='')set(r,6,2+i%3)})})()`);
          const bt=await p.$('#act button:not(.quiet):not(.danger):not([disabled])');if(bt)await bt.click();else if(state==='end')break;
        }
      }
      const r=await p.evaluate(()=>({doc:document.documentElement.scrollWidth,win:window.innerWidth,wraps:[...document.querySelectorAll('.wrap')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.id||e.className)}));
      const flag=r.doc>r.win;if(flag)bad++;
      console.log(`${String(w).padEnd(4)} ov=${ov} c=${c} n=${n} ${state.padEnd(5)} Seitenüberlauf:${flag?'JA':'nein'} scrollende Bereiche: ${r.wraps.join(',')||'-'}`);
      await ctx.close();
    }
  }
  console.log('Seitenüberlauf in',bad,'Fällen');
  await b.close();
})();
