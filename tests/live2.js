// Test der Live-Ansicht mit einer simulierten db (gemeinsamer Speicher zwischen zwei Seiten)
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(require('./paths').HTML,'utf8');
const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'OK     ':'FEHLER ')+m)};
const q=(w,s)=>w.document.querySelector(s),qa=(w,s)=>[...w.document.querySelectorAll(s)];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// gemeinsame Fake-db
const store={};const subs=[];
const fakeDb={doc:path=>({
  set:async d=>{store[path]=d;subs.filter(s=>s.path===path).forEach(s=>s.fn({exists:true,data:()=>d}))},
  delete:async()=>{delete store[path];subs.filter(s=>s.path===path).forEach(s=>s.fn({exists:false,data:()=>undefined}))},
  onSnapshot:fn=>{subs.push({path,fn});setTimeout(()=>fn({exists:path in store,data:()=>store[path]}),0);return()=>{}}})};
const mk=(canEdit,pre)=>{const w=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true,beforeParse(w){
  if(pre)w.localStorage.setItem('padel-turnier-v2',pre);
  w.claude={use:async n=>n==='db'?fakeDb:n==='user'?{canEdit:()=>canEdit}:null}}}).window;return w};
(async()=>{
  const org=mk(true);await wait(50);
  ok(q(org,'#livebar').textContent==='','Organisator ohne Turnier: keine Leiste');
  const set=(w,id,v)=>{q(w,id).value=String(v);q(w,id).dispatchEvent(new w.Event('change',{bubbles:true}))};
  set(org,'#n',6);set(org,'#r',3);set(org,'#ov','yes');org.start();await wait(900);
  ok('live/state' in store,'Organisator: Stand wurde bereitgestellt');
  ok(/Live-Ansicht aktiv/.test(q(org,'#livebar').textContent),'Organisator sieht Hinweis "aktiv"');
  const early=mk(false);await wait(60);
  ok(/Noch kein Turnier|Es läuft|Live/.test(q(early,'#app').textContent+q(early,'#livebar').textContent),'Zuschauer früh: kein Setup-Formular zu sehen='+!q(early,'#n'));
  const viewer=mk(false);await wait(80);
  ok(!q(viewer,'#n'),'Zuschauer sieht kein Einrichtungsformular');
  ok(!!q(viewer,'#vcur'),'Zuschauer landet automatisch in der Live-Ansicht');
  ok(/Live/.test(q(viewer,'#livebar').textContent)&&/Stand \d\d:\d\d/.test(q(viewer,'#livebar').textContent),'Leiste mit Stand-Uhrzeit: '+q(viewer,'#livebar').textContent);
  ok(!qa(viewer,'#app button').some(e=>/Beenden|ansetzen|ausscheiden|Ausscheiden|Zurück/i.test(e.textContent)),'Keine Admin-Knöpfe');
  ok(qa(viewer,'#vcur input').length===0&&!q(viewer,'#so')&&!/Spieler scheidet aus/.test(q(viewer,'#app').textContent),'Keine Eingabefelder, kein Ausscheiden-Block');
  const enabled=qa(viewer,'#app input,#app select,#app button').filter(e=>!e.disabled&&!/copyTable|toggleCols/.test(e.getAttribute('onclick')||'')&&e.id!=='mineSel');
  ok(enabled.length===0,'Zuschauer: alle Bedienelemente gesperrt ('+enabled.length+' aktiv)');
  ok(/Runde 1 von 3/.test(q(viewer,'#rh').textContent),'Zuschauer sieht Runde: '+q(viewer,'#rh').textContent);
  ok(qa(viewer,'#vcur .mw').length>=1&&/Platz/.test(q(viewer,'#vcur').textContent),'Laufende Spiele mit Platz');
  ok(!!q(viewer,'#tab table')&&!!q(viewer,'#plan .plan'),'Tabelle und Spielplan vorhanden');
  ok(viewer.localStorage.getItem('padel-turnier-v2')===null,'Zuschauer schreibt nichts in den eigenen Speicher');
  q(viewer,'#mineSel').value='0';q(viewer,'#mineSel').dispatchEvent(new viewer.Event('change',{bubbles:true}));
  ok(/Nächstes Spiel|Noch nicht angesetzt|Alle Spiele/.test(q(viewer,'#mine').textContent),'Ich bin: '+q(viewer,'#mine').textContent.replace(/\s+/g,' '));
  const ins=qa(org,'#cur .m input');ins[0].value='6';ins[0].dispatchEvent(new org.Event('input',{bubbles:true}));ins[1].value='2';ins[1].dispatchEvent(new org.Event('input',{bubbles:true}));
  await wait(900);
  const vs=qa(viewer,'#vcur .vs').map(e=>e.textContent);
  ok(vs[0]==='6'&&vs[1]==='2','Zuschauer sieht neues Ergebnis live: '+vs.slice(0,2));
  ok(qa(viewer,'#tab tbody tr').length===6&&/6:2|6 : 2|\+4/.test(q(viewer,'#tab').textContent),'Tabelle aktualisiert');
  ok(!/Hier weiterführen|Beenden/.test(q(viewer,'#livebar').textContent),'Zuschauer ohne Bearbeitungsrecht: keine Knöpfe in Leiste');
  ok(!/undefined|NaN/.test(q(viewer,'#app').textContent),'Zuschauer: kein undefined/NaN');
  // Vorschau beim Organisator
  qa(org,'#livebar button').find(b=>/So sehen es die Spieler/.test(b.textContent)).click();
  ok(!!q(org,'#vcur')&&/Beenden/.test(q(org,'#livebar').textContent),'Organisator-Vorschau mit Beenden');
  qa(org,'#livebar button').find(b=>/Beenden/.test(b.textContent)).click();
  ok(!!q(org,'#cur')&&!!q(org,'#cur input'),'Organisator zurück in der Bearbeitung');
  // anderes Gerät eines Bearbeiters
  const dev2=mk(true);await wait(60);
  ok(/Hier weiterführen/.test(q(dev2,'#livebar').textContent),'Zweites Gerät des Bearbeiters: "Hier weiterführen"');
  qa(dev2,'#livebar button').find(b=>/weiterführen/.test(b.textContent)).click();
  ok(!!q(dev2,'#cur')&&dev2.localStorage.getItem('padel-turnier-v2')!==null,'Weiterführen übernimmt den Stand lokal');
  // Zurücksetzen löscht den Live-Stand
  await wait(900);
  const rb=qa(org,'#topbtns button')[0];rb.click();rb.click();await wait(900);
  ok(!('live/state' in store),'Zurücksetzen entfernt den Live-Stand');
  await wait(100);
  ok(/Noch kein Turnier/.test(q(viewer,'#app').textContent),'Nach Zurücksetzen: Zuschauer sieht Wartehinweis');
  // ohne db: normal
  const plain=new JSDOM(html,{runScripts:'dangerously',url:'https://padel.test/',virtualConsole:vc,pretendToBeVisual:true}).window;await wait(30);
  ok(!!q(plain,'#n')&&q(plain,'#livebar').textContent==='','Ohne db: Seite normal, keine Leiste');
  console.log('Fehler:',fails,'JS-Fehler:',errs.length,errs[0]||'');process.exit(0);
})();
