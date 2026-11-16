// Schutz beim Anlegen von Turnieren (reine Logik, ohne Cloudflare).
// Zählt pro IP: falsche Schlüssel (Raten) und angelegte Turniere. Der Zustand liegt nur im Arbeitsspeicher
// einer einzigen Instanz; wird sie neu gestartet, beginnt die Zählung von vorn (genügt gegen Raten und Missbrauch).
export const LIMITS={failMax:8,failWindow:15*60e3,createMax:30,createWindow:60*60e3,maxIps:2000};

export class Limiter{
  constructor(now=Date.now){this.now=now;this.fails=new Map();this.creates=new Map()}
  _recent(map,ip,win){
    const t=this.now(),a=(map.get(ip)||[]).filter(x=>x>t-win);
    if(a.length)map.set(ip,a);else map.delete(ip);
    return a;
  }
  _push(map,ip,a){
    a.push(this.now());map.set(ip,a);
    if(map.size>LIMITS.maxIps)for(const k of map.keys()){map.delete(k);break}
  }
  /* Ein Anlege-Versuch. keyOk: war der Schlüssel richtig? Gibt {allowed,reason} zurück.
     Wer zu oft falsch geraten hat, wird gesperrt, auch mit richtigem Schlüssel (sonst ließe sich der Schlüssel erraten). */
  attempt(ip,keyOk){
    const f=this._recent(this.fails,ip,LIMITS.failWindow);
    if(f.length>=LIMITS.failMax)return{allowed:false,reason:'gesperrt'};
    if(!keyOk){this._push(this.fails,ip,f);return{allowed:false,reason:'schluessel'}}
    const c=this._recent(this.creates,ip,LIMITS.createWindow);
    if(c.length>=LIMITS.createMax)return{allowed:false,reason:'zu_viele'};
    this._push(this.creates,ip,c);
    return{allowed:true};
  }
}
