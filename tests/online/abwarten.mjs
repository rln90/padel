// Phase 15 (Browser): Bei „Abwarten“ erscheint „Trotzdem jetzt ansetzen“ nur, wenn ein Platz frei ist und Abwarten nichts ansetzt.
import {createRequire} from 'node:module';const require=createRequire(new URL('../../package.json',import.meta.url));const {chromium}=require('playwright');
const BASE=process.env.BASE||'http://localhost:8787';let n=Math.floor(Math.random()*30000)+10000;const ip=()=>'91.0.'+((n>>8)&255)+'.'+(n++&255);
async function api(m,p,o={}){const h={'cf-connecting-ip':ip()};if(o.t)h.authorization='Bearer '+o.t;if(o.key)h['x-create-key']=o.key;if(o.b!==undefined)h['content-type']='application/json';
  const r=await fetch(BASE+p,{method:m,headers:h,body:o.b!==undefined?JSON.stringify(o.b):undefined});return await r.json()}
let f=0,k=0;const ok=(c,m)=>{k++;if(!c){f++;console.log('FEHLER',m)}};
const br=await chromium.launch();let seenBtn=0,checked=0,wrongShown=0;
for(let run=0;run<6&&!seenBtn;run++){
  const c=await api('POST','/api/t',{key:'geheim',b:{cfg:{R:4,courts:3,ov:'wait',draw:true,auto:'reported'}}});
  for(const nm of ['Anna','Ben','Cem','Dora','Emil','Fritz','Gerda','Hanna','Ida'])await api('POST','/api/t/'+c.code+'/join',{b:{name:nm}});
  await api('POST','/api/t/'+c.code+'/admin/start',{t:c.adminKey,b:{}});
  const ctx=await br.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(BASE+'/#'+c.code+'/'+c.adminKey);await p.waitForSelector('.panel.adm',{timeout:15000});
  for(let step=0;step<60;step++){
    const st=await api('GET','/api/t/'+c.code+'/state',{t:c.adminKey});
    const live=st.S.games.filter(g=>!g.fin&&g.sa==null);if(!live.length&&st.S.games.length>=18)break;
    await p.reload();await p.waitForSelector('.panel.adm',{timeout:15000});await p.waitForTimeout(150);
    const info=await p.evaluate(()=>{const st=rollState(),fr=S.courts-st.courts.size;const peek=fr>0?rollPick(st,fr).length:0;const btn=[...document.querySelectorAll('.panel.adm button')].some(b=>/Trotzdem jetzt ansetzen/.test(b.textContent));return{fr,peek,left:rollLeft()+helpLeft(),btn}});
    checked++;
    const should=info.fr>0&&info.left>0&&info.peek===0;
    if(info.btn&&!should)wrongShown++;
    if(info.btn){seenBtn++;
      // Klick: zweistufig
      const before=st.S.games.length;
      await p.click('.panel.adm button:has-text("Trotzdem jetzt ansetzen")');await p.waitForTimeout(200);
      const t2=await p.locator('.panel.adm button:has-text("wirklich")').count();ok(t2===1,'zweite Stufe „wirklich?“ sichtbar');
      await p.click('.panel.adm button:has-text("wirklich")');await p.waitForTimeout(1200);
      const s2=await api('GET','/api/t/'+c.code+'/state',{t:c.adminKey});ok(s2.S.games.length>before,'Spiele angesetzt ('+before+' → '+s2.S.games.length+')');
      ok(s2.cfg.ov==='wait','Modus bleibt Abwarten');
      const after=await p.evaluate(()=>[...document.querySelectorAll('.panel.adm button')].some(b=>/Trotzdem jetzt ansetzen/.test(b.textContent)));
      break;
    }
    if(!live.length)break;
    const g=live[0];await api('POST','/api/t/'+c.code+'/admin/result',{t:c.adminKey,b:{gid:g.gid,sa:g.gid%2?6:3,sb:g.gid%2?2:6,force:true}});
  }
  ok(errs.length===0,'keine JS-Fehler '+errs.join('|'));await ctx.close();
}
ok(wrongShown===0,'Knopf nie zu Unrecht gezeigt');ok(seenBtn>0,'Knopf mindestens einmal gesehen (Prüfungen '+checked+')');
await br.close();console.log(f?`FEHLER ${f} von ${k}`:`ALLES OK (${k} Prüfungen)`);process.exit(f?1:0);
