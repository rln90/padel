// Baut dist/padel-turnier.html: eine Datei mit Engine und Oberfläche.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const rd=f=>fs.readFileSync(path.join(root,f),'utf8');
let html=rd('src/template.html');
const eng=rd('src/engine.js'),ui=rd('src/ui.js');
for(const [m,t] of [['/*@@ENGINE@@*/',eng],['/*@@UI@@*/',ui]]){
  if(!html.includes(m))throw new Error('Marker fehlt: '+m);
  html=html.replace(m,()=>t.replace(/\s+$/,''));
}
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.writeFileSync(path.join(root,'dist','padel-turnier.html'),html);
console.log('dist/padel-turnier.html',html.length,'Zeichen');
