const fs=require('fs');
module.exports=function load(file){
  const html=fs.readFileSync(file,'utf8');
  const js=html.split('<script>')[1].split('</script>')[0].replace(/\nrender\(\);\s*$/,'\n');
  const dummy=()=>new Proxy(function(){}, {get:(t,k)=>k==='querySelector'?dummy:(k in t?t[k]:''),set:(t,k,v)=>{t[k]=v;return true},apply:()=>dummy()});
  const ls={getItem:()=>null,setItem(){},removeItem(){}};
  return new Function('document','localStorage',js+';return {ranking,soBlocks,isOver,syncSO,waitBlocks,plan,get simFast(){return simFast},set simFast(v){simFast=v},waitCache,makeRound,pair,get S(){return S},set S(v){S=v},rollAdd,rollState,rollPick,rollInfo,rollPauses,rollView,done,stats,validR,totalGames,roundOpts,justDone,MINN,MAXN}')({querySelector:()=>dummy(),querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},documentElement:{}},ls);
}
