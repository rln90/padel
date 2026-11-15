// Erzeugt server/engine.gen.mjs: die Engine (src/engine.js) als Modul für den Worker.
// Jeder Aufruf von createEngine() liefert eine eigene Engine mit eigenem Zustand S.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src','engine.js'),'utf8');
const names=['createTournament','scoreClassic','scoreRoll','scoreSO','canAdvance','advanceRound','undoClassic','undoRoll','assignGames','doDrop','canDrop','isOver','isOut','done','ranking','stats','syncSOcore','allM','rollLeft','helpLeft','lastBlock','extraRound','validR','totalGames','okState','nextOf','classicSlots'];
const consts=['MINN','MAXN','MINR','MAXR','DURS','BRKS'];
const out=`// GENERIERT von tools/build-server.js aus src/engine.js. Nicht von Hand ändern.
export function createEngine(){
${src}
return {get S(){return S},set S(v){S=v},${names.join(',')},${consts.join(',')}};
}
`;
const target=path.join(root,'server','engine.gen.mjs');
if(process.argv.includes('--check')){
  const cur=fs.existsSync(target)?fs.readFileSync(target,'utf8'):'';
  if(cur!==out){console.error('server/engine.gen.mjs ist veraltet: npm run build:server');process.exit(1)}
  console.log('server/engine.gen.mjs aktuell');
}else{fs.writeFileSync(target,out);console.log('server/engine.gen.mjs',out.length,'Zeichen')}
