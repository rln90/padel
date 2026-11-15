const pw=require('playwright');
const modes=['no','yes','wait'];let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
const fails=[];const bad=(m)=>{fails.push(m);};
(async()=>{
 const engines=[];for(const e of ['chromium','firefox','webkit']){try{const b=await pw[e].launch();engines.push([e,b])}catch(x){console.log('Engine fehlt:',e)}}
 let runs=0,rel=0;
 for(const [en,b] of engines){
  const nRuns=en==='chromium'?60:6;
  for(let t=0;t<nRuns;t++){
   const n=[4,5,6,7,8,9,10,11,12,16,24][Math.floor(rnd()*11)],mx=Math.floor(n/2),c=1+Math.floor(rnd()*Math.min(mx,6)),mode=modes[Math.floor(rnd()*3)];
   const ctx=await b.newContext({viewport:{width:[360,390,768][t%3],height:900}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
   await p.goto('file://'+require('./paths').HTML);
   try{
    await p.selectOption('#n',''+n);const rs=await p.$$eval('#r option',o=>o.map(x=>+x.value));const R=rs[Math.floor(rnd()*rs.length)];await p.selectOption('#r',''+R);
    const cs=await p.$$eval('#c option',o=>o.map(x=>+x.value));await p.selectOption('#c',''+Math.min(c,Math.max(...cs)));await p.selectOption('#ov',mode);
    await p.evaluate(()=>start());
    // Monkey: zufällig ansetzen/Ergebnisse eintragen/zurücknehmen, dazwischen Reload
    const st=async()=>p.evaluate(()=>S.ov?{ov:1,g:S.games.length,done:S.games.filter(done).length,tot:totalGames(S.n,S.R)}:{ov:0,r:S.rounds.length,R:S.R});
    for(let step=0;step<400;step++){
     const s=await st();
     if(s.ov){
      if(s.done===s.tot)break;
      const a=rnd();
      if(a<.55)await p.evaluate(()=>{const i=S.games.findIndex(m=>m.sa==null||m.sb==null);if(i>=0){const w=Math.floor(Math.random()*7);rollScore(i,'a',String(w));rollScore(i,'b',String(Math.floor(Math.random()*7)))}});
      else if(a<.9)await p.evaluate(()=>{if(S.games.length<totalGames(S.n,S.R))rollGo()});
      else if(a<.95)await p.evaluate(()=>{if(lastBlock()>=1&&S.games.some(m=>m.k===lastBlock()&&m.sa==null))rollUndo()});
      else {await p.reload();rel++}
     } else break;
    }
    // Zu Ende bringen (Overlap)
    const fin=await p.evaluate(()=>{ if(!S.ov)return null; for(let g=0;g<500;g++){const i=S.games.findIndex(m=>!done(m)); if(i>=0){rollScore(i,'a','6');rollScore(i,'b',String(g%6))} else if(S.games.length<totalGames(S.n,S.R)) rollGo(); else break;}
      const cnt=Array(S.n).fill(0),pair={};S.games.forEach(m=>{cnt[m.a]++;cnt[m.b]++;const k=Math.min(m.a,m.b)+'-'+Math.max(m.a,m.b);pair[k]=(pair[k]||0)+1});
      return{games:S.games.length,tot:totalGames(S.n,S.R),eq:new Set(cnt).size===1,cnt:cnt.join(','),self:S.games.some(m=>m.a===m.b),maxrep:Math.max(...Object.values(pair)),alldone:S.games.every(done)}});
    if(fin){ if(fin.games!==fin.tot||!fin.eq||fin.self||!fin.alldone)bad(`${en} n=${n} R? mode=${mode}: ${JSON.stringify(fin)}`);
      // Reload-Konsistenz
      const before=await p.evaluate(()=>JSON.stringify(S));await p.reload();const after=await p.evaluate(()=>JSON.stringify(S));if(before!==after)bad(`${en} Reload verändert Zustand n=${n}`);
      const ov=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(ov)bad(`${en} Überlauf n=${n}`);
      // Tabelle: Summe Punkte = 3? konsistent -> Platzierungen 1..n vorhanden
      const rows=await p.evaluate(()=>document.querySelectorAll('#tab tbody tr, table.tbl tbody tr').length);
    }
    runs++;
   }catch(e){bad(`${en} n=${n} mode=${mode} Ausnahme: ${e.message.split('\n')[0]}`)}
   if(errs.length)bad(`${en} JS-Fehler: ${errs[0]}`);
   await ctx.close();
  }
 }
 // Tastaturbedienung: Tab-Reihenfolge erreicht Start-Button, Enter startet
 {const b=engines[0][1];const ctx=await b.newContext();const p=await ctx.newPage();await p.goto('file://'+require('./paths').HTML);
  let reached=false;for(let i=0;i<60;i++){await p.keyboard.press('Tab');const t=await p.evaluate(()=>document.activeElement.textContent||'');if(/Turnier starten|Starten/i.test(t)){reached=true;await p.keyboard.press('Enter');break}}
  const started=await p.evaluate(()=>!!S);if(!reached||!started)bad('Tastatur: Start nicht erreichbar/ausführbar');await ctx.close()}
 console.log('Läufe:',runs,'Reloads mitten im Spiel:',rel,'Engines:',engines.map(e=>e[0]).join(','));
 console.log(fails.length?'FEHLER:\n'+fails.slice(0,15).join('\n'):'Keine Fehler');
 for(const [,b] of engines)await b.close();
})();
