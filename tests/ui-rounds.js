const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('fs');
const html=fs.readFileSync(require('./paths').HTML,'utf8');
const errors=[];let fails=0;
function boot(){
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',e=>errors.push(String(e)));
  return new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true}).window;
}
const q=(w,s)=>w.document.querySelector(s),qa=(w,s)=>[...w.document.querySelectorAll(s)];
const typeScore=(w,i,v)=>{i.value=String(v);i.dispatchEvent(new w.Event('input',{bubbles:true}))};
const ok=(c,m)=>{if(!c)fails++;console.log((c?'OK     ':'FEHLER ')+m)};
const setSel=(w,id,v)=>{const e=q(w,id);e.value=String(v);e.dispatchEvent(new w.Event('change',{bubbles:true}))};
const btn=w=>q(w,'#act button:not(.quiet):not(.danger)');
function play(n,c,r){
  const w=boot();setSel(w,'#n',n);setSel(w,'#c',c);setSel(w,'#r',r);setSel(w,'#ov','yes');w.start();
  for(let g=0;g<500;g++){
    const rows=qa(w,'#cur .m').filter(x=>{const i=x.querySelectorAll('input');return i[0].value===''||i[1].value===''});
    const b=btn(w);
    if(b&&!b.disabled&&(rows.length===0||Math.random()<.4)){b.click();continue}
    if(!rows.length)break;
    const row=rows[Math.floor(Math.random()*rows.length)],x=row.querySelectorAll('input');
    let a=Math.floor(Math.random()*7),bb=Math.floor(Math.random()*7);if(a===bb)bb=a+1;
    typeScore(w,x[0],a);typeScore(w,x[1],bb);
  }
  return w;
}
// A: Vorschau mit Rundenköpfen
{
  const w=boot();setSel(w,'#n',9);setSel(w,'#c',3);setSel(w,'#r',4);setSel(w,'#ov','yes');
  const heads=qa(w,'#plan .rh').map(h=>h.textContent);
  ok(heads.length===4&&/^Runde 1/.test(heads[0])&&/Pause: 1 Spieler/.test(heads[0]),'Vorschau: 4 Rundenköpfe ('+heads.join(' | ')+')');
  const lab=qa(w,'#plan .cell').map(c=>c.textContent);
  ok(lab.length===18&&lab[0]==='Runde 1, Spiel 1'&&lab.includes('Runde 2, Zusatzspiel')&&lab.includes('Runde 4, Spiel 4'),'Vorschau-Felder beschriftet: '+lab.slice(0,4).join(' / ')+' … '+lab.filter(x=>/Zusatz/.test(x)));
  ok(qa(w,'#plan .cell.rc1').length>0&&qa(w,'#plan .rh.rc3').length===1,'Vorschau farbig nach Runde');
  setSel(w,'#n',8);setSel(w,'#r',4);
  ok(qa(w,'#plan .rh').length===4&&!/Pause/.test(q(w,'#plan .rh').textContent)&&!qa(w,'#plan .cell').some(c=>/Zusatz/.test(c.textContent)),'8 Spieler: keine Pause, kein Zusatzspiel');
}
// B: vollständige Läufe, Struktur prüfen
for(const [n,c,r] of [[9,3,4],[9,2,6],[8,2,4],[8,4,5],[12,3,4],[7,3,4],[5,2,4],[24,6,3],[15,5,6],[16,8,6]]){
  let bad=[],N=6;
  for(let t=0;t<N;t++){
    const w=play(n,c,r),S=JSON.parse(w.localStorage.getItem('padel-turnier-v2')),I=w.rollInfo(S.games,n);
    const m=Math.floor(n/2);
    for(let rd=1;rd<=r;rd++){
      const reg=I.filter(f=>f.r===rd&&!f.x).length,ex=I.filter(f=>f.r===rd&&f.x).length;
      if(reg!==m)bad.push(`R${rd} reg ${reg}`);
      if(ex!==(n%2&&rd%2===0?1:0))bad.push(`R${rd} extra ${ex}`);
      const ps=S.games.flatMap((g,i)=>I[i].r===rd&&!I[i].x?[g.a,g.b]:[]);
      if(new Set(ps).size!==ps.length)bad.push(`R${rd} Spieler doppelt`);
    }
    if(I.some(f=>f.r>r))bad.push('Runde über R');
    const heads=qa(w,'#plan .rh').length,hist=qa(w,'#hist details').length;
    if(heads!==r)bad.push('Köpfe '+heads);
    if(hist>r||hist<r-1)bad.push('Verlauf '+hist);
    if(n%2){const ph=qa(w,'#plan .rh').map(h=>h.textContent);if(ph.some(x=>/1 Spieler/.test(x)))bad.push('Pause unbekannt am Ende')}
    if(q(w,'#rh').textContent!==`Runde ${r} von ${r}`)bad.push('Titel '+q(w,'#rh').textContent);
  }
  ok(bad.length===0,`n=${n}, ${c} Plätze, ${r} Runden: ${N} Läufe mit sauberer Rundenstruktur${bad.length?' → '+[...new Set(bad)].slice(0,4).join(', '):''}`);
}
// C: laufende Anzeige
{
  const w=boot();setSel(w,'#n',9);setSel(w,'#c',3);setSel(w,'#ov','yes');w.start();
  ok(q(w,'#rh').textContent==='Runde 1 von 4','Titel zu Beginn: '+q(w,'#rh').textContent);
  ok(qa(w,'#cur .tag').map(t=>t.textContent).join('|')==='Runde 1, Spiel 1 · Platz 1|Runde 1, Spiel 2 · Platz 2|Runde 1, Spiel 3 · Platz 3','Beschriftung laufender Spiele');
  const set=(r,a,b)=>{const i=r.querySelectorAll('input');typeScore(w,i[0],a);typeScore(w,i[1],b)};
  qa(w,'#cur .m').forEach(r=>set(r,6,2));btn(w).click();
  const t=qa(w,'#cur .tag').map(x=>x.textContent);
  ok(t.some(x=>/Runde 1/.test(x))&&q(w,'#rh').textContent.length>0,'Danach: '+q(w,'#rh').textContent+' / '+t.join(' | '));
}
console.log(errors.length?'JS-FEHLER: '+errors.slice(0,3).join(' | '):'Keine JavaScript-Fehler.');
console.log(fails+' Prüfung(en) fehlgeschlagen');
