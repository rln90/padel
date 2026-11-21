// Einmal-Fix 21.11.: Lage nachgestellt (Spielverlauf wie im Screenshot), Fix setzt Chef–Invalide und Robin–Papa an
import {makeEnv,client} from './harness.mjs';
let f=0,n=0;const ok=(c,m)=>{n++;if(!c){f++;console.log('FEHLER '+m)}};
const env=makeEnv(),c=client(env),T=x=>`/api/t/${x}`;
const NM=['Chefschamlar','Polnischer Oger','Alge','LanglebePapa','Porno Padel Peter 69','Invalide','Robin'];
async function build(){
  const r=await c('POST','/api/t',{headers:{'x-create-key':'geheim'},body:{cfg:{R:5,courts:3,ov:'wait',draw:true,auto:'reported'}}});const code=r.json.code,adm=r.json.adminKey;
  for(const x of NM)await c('POST',T(code)+'/join',{body:{name:x}});
  await c('POST',T(code)+'/admin/start',{token:adm});
  return {code,adm};
}
// Weg 1: echtes Turnier, Spiele direkt so setzen wie im Screenshot (über das gespeicherte S)
const {code,adm}=await build();
const st0=(await c('GET',T(code)+'/state',{token:adm})).json;ok(st0.S.n===7,'7 Spieler');
// Zustand über den Durable Object direkt setzen
const I=x=>NM.indexOf(x);
const G=[[0,'Chefschamlar','Polnischer Oger',6,2,0],[0,'Alge','LanglebePapa',3,1,1],[0,'Porno Padel Peter 69','Invalide',1,6,2],
 [1,'Robin','Chefschamlar',3,3,0],[1,'Alge','Polnischer Oger',6,0,1],[1,'Invalide','LanglebePapa',8,0,2],
 [2,'Porno Padel Peter 69','Robin',6,2,0,1],[2,'Alge','Chefschamlar',3,1,1],[2,'LanglebePapa','Polnischer Oger',3,1,2],
 [3,'Invalide','Robin',6,0,0],[3,'Porno Padel Peter 69','Alge',5,2,1],[3,'Chefschamlar','LanglebePapa',4,1,2],
 [4,'Porno Padel Peter 69','Polnischer Oger',null,null,1,1]];
// gespeicherten Stand umschreiben und Instanz verwerfen (wie nach einem Deploy: neu aus dem Speicher geladen)
const store=env._stores.get(code),d=store.get('t');
d.S.games=G.map(([k,a,b,sa,sb,cc,h],i)=>{const m={a:I(a),b:I(b),sa,sb,c:cc,k,gid:i+1};if(h)m.h=1;if(k<4)m.fin=k+1;return m});
d.res={};d.nextGid=G.length+1;delete d.fix1;store.set('t',d);env._inst.delete(code);
{const s0=(await c('GET',T(code)+'/state',{token:adm})).json;void s0}
const s1=(await c('GET',T(code)+'/state',{token:adm})).json;
const live=s1.S.games.filter(g=>g.sa==null).map(g=>NM[g.a]+'-'+NM[g.b]+'@'+g.c).sort();
console.log('laufend:',live.join(' | '));
ok(live.includes('Chefschamlar-Invalide@0'),'Chef–Invalide auf A');ok(live.includes('Robin-LanglebePapa@2'),'Robin–Papa auf C');ok(live.length===3,'genau 3 laufend');
ok(new Set(s1.S.games.map(g=>g.gid)).size===s1.S.games.length,'gids eindeutig');
env._inst.delete(code);
// zweiter Zugriff (nach erneutem Laden): nichts Neues, Stand gespeichert
const s2=(await c('GET',T(code)+'/state',{token:adm})).json;ok(s2.S.games.length===s1.S.games.length,'einmalig');
// Spieler melden Ergebnis
const gi=s2.S.games.find(g=>g.sa==null&&NM[g.a]==='Robin');
const joinTok=null; // Spieler-Token per Admin nicht abrufbar: Admin trägt ein
const r=await c('POST',T(code)+'/admin/result',{token:adm,body:{gid:gi.gid,sa:6,sb:3,force:true}});ok(r.status===200,'Ergebnis eintragbar');
// Weg 2: frisches Turnier mit denselben Namen: Fix greift NICHT (zu wenige Ergebnisse)
const b=await build();const s3=(await c('GET',T(b.code)+'/state',{token:b.adm})).json;
ok(!s3.S.games.some(g=>g.sa==null&&((NM[g.a]==='Chefschamlar'&&NM[g.b]==='Invalide'))&&s3.S.games.length>3),'frisches Turnier unberührt');
console.log(f?`FEHLER ${f} von ${n}`:`ALLES OK (${n} Prüfungen)`);process.exit(f?1:0);
