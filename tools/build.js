// Baut zwei Dateien aus denselben Quellen:
//   dist/padel-turnier.html  Einzeldatei zum Offline-Gebrauch (Engine + Oberfläche)
//   public/index.html        Online-Seite, die der Worker ausliefert (zusätzlich online.js und online.css)
// `node tools/build.js --check` prüft nur, ob public/index.html zum Quellcode passt.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const rd=f=>fs.readFileSync(path.join(root,f),'utf8');
const tpl=rd('src/template.html'),eng=rd('src/engine.js'),ui=rd('src/ui.js'),onl=rd('src/online.js'),css=rd('src/online.css');
function fill(h,o){
  for(const k of Object.keys(o)){if(!h.includes(k))throw new Error('Marker fehlt: '+k);h=h.replace(k,()=>o[k])}
  return h;
}
const trim=t=>t.replace(/\s+$/,'');
const offline=fill(tpl,{'/*@@ENGINE@@*/':trim(eng),'/*@@UI@@*/':trim(ui),'/*@@CSS@@*/':'','<!--@@TOP@@-->':'','<!--@@BOT@@-->':''});
const online=fill(tpl,{
  '/*@@ENGINE@@*/':trim(eng),
  '/*@@UI@@*/':trim(ui)+'\n'+trim(onl),
  '/*@@CSS@@*/':trim(css),
  '<!--@@TOP@@-->':'<div id="onl"></div>',
  '<!--@@BOT@@-->':'<div id="onl2"></div>',
});
if(process.argv.includes('--check')){
  const cur=fs.existsSync(path.join(root,'public/index.html'))?rd('public/index.html'):'';
  console.log(cur===online?'public/index.html aktuell':'public/index.html VERALTET (npm run build)');
  process.exit(cur===online?0:1);
}
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.writeFileSync(path.join(root,'dist','padel-turnier.html'),offline);
fs.writeFileSync(path.join(root,'public','index.html'),online);
console.log('dist/padel-turnier.html',offline.length,'Zeichen; public/index.html',online.length,'Zeichen');
