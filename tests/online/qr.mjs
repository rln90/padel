// QR-Code: wird er angezeigt, und liest ein Scanner genau den Spielerlink? (jsQR liest das gerenderte Bild, hell und dunkel)
// PADEL_URL=http://localhost:8787 PADEL_KEY=geheim node tests/online/qr.mjs
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('playwright');const jsQR=require('jsqr');
const B=process.env.PADEL_URL||'http://localhost:8787',KEY=process.env.PADEL_KEY||'geheim';let f=0,n=0;const ok=(c,m,x)=>{n++;if(!c){f++;console.log('FEHLER',m,x===undefined?'':JSON.stringify(x))}};
const br=await chromium.launch();
const blank=await (await br.newContext()).newPage();await blank.goto('about:blank');
// Bild (data-URL) in leerer Seite zeichnen und Pixel lesen, dann mit jsQR dekodieren
const decode=async(dataUrl)=>{const px=await blank.evaluate(async u=>{const im=new Image();await new Promise((r,j)=>{im.onload=r;im.onerror=j;im.src=u});const s=Math.max(im.width,400),c=document.createElement('canvas');c.width=c.height=s;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,s,s);x.drawImage(im,0,0,s,s);return{w:s,d:Array.from(x.getImageData(0,0,s,s).data)}},dataUrl);
  const r=jsQR(Uint8ClampedArray.from(px.d),px.w,px.w);return r&&r.data};
const svgUrl=s=>'data:image/svg+xml;base64,'+Buffer.from(s.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" ')).toString('base64');
const shotUrl=async el=>'data:image/png;base64,'+(await el.screenshot()).toString('base64');
const mkp=async(scheme)=>{const c=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,colorScheme:scheme});return c.newPage()};
for(const scheme of ['light','dark']){
  const A=await mkp(scheme),errs=[];A.on('pageerror',e=>errs.push(String(e)));
  await A.goto(B+'/');await A.waitForSelector('#codeIn');await A.click('#newT summary');await A.fill('#ckey',KEY);await A.click('[data-act=create]');await A.waitForSelector('text=Warteraum');
  const code=(await A.textContent('h2')).trim().replace(/^.*Turnier\s+/,'').slice(0,6),want=B+'/#'+code;
  await A.waitForSelector('svg.qr');
  ok((await A.$$('svg.qr')).length===1,scheme+': genau ein QR-Code im Warteraum');
  ok((await decode(svgUrl(await A.$eval('svg.qr',e=>e.outerHTML))))===want,scheme+': QR (Vektor) enthält den Spielerlink');
  ok((await decode(await shotUrl(await A.$('svg.qr'))))===want,scheme+': QR (Bildschirmfoto) enthält den Spielerlink');
  const box=await A.$eval('svg.qr',e=>{const r=e.getBoundingClientRect();return{w:r.width,l:r.left,r:r.right}});ok(box.w>=180&&box.l>=0&&box.r<=390,scheme+': QR groß genug und im Bild ('+Math.round(box.w)+' px)');
  // Spieler sieht ihn auch
  const P=await mkp(scheme);await P.goto(B+'/#'+code);await P.waitForSelector('#nameIn');ok((await P.$$('svg.qr')).length===1,scheme+': Spieler sieht den QR-Code');
  // laufendes Turnier: im Organisator-Bereich
  if(scheme==='light'){
    const adm=await A.evaluate(()=>JSON.parse(localStorage.getItem('padel-online-'+location.hash.slice(1).split('/')[0])||'{}'));const key=adm.a||adm.admin||Object.values(adm).find(v=>typeof v==='string'&&v.startsWith('a_'));
    ok(!!key,'Organisator-Schlüssel im Browser gefunden');
    for(const nm of ['Anna','Ben','Cem','Dora'])await fetch(B+'/api/t/'+code+'/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:nm})});
    const st=await fetch(B+'/api/t/'+code+'/admin/start',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key},body:'{}'});ok(st.status===200,'Turnier gestartet ('+st.status+')');
    await A.waitForSelector('#tab table',{timeout:15000});
    ok((await A.$$('details[data-k=qr] svg.qr')).length===1,'Laufend: QR-Code im Organisator-Bereich');
    await A.click('details[data-k=qr] summary');
    ok((await decode(await shotUrl(await A.$('details[data-k=qr] svg.qr'))))===want,'Laufend: QR enthält den Spielerlink');
  }
  ok(errs.length===0,scheme+': keine JS-Fehler',errs);
}
await br.close();console.log(f?`FEHLER gesamt ${f} von ${n}`:`ALLES OK (${n} Prüfungen)`);process.exit(f?1:0);
