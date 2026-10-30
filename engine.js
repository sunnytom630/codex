(function(root){
 'use strict';
 function classify(candidate,cutoff){const ratio=candidate/cutoff;return ratio>1.25||ratio<.65?null:ratio>1?'冲':ratio>.83?'稳':'保';}
 function recommend(data,options){
  const {score,year,rank,keyword='',ownership='',coop=false,unknown=false}=options;
  if(!Number.isInteger(score)||score<400||score>690)throw Error('请输入 400–690 之间的整数分数。');
  const band=data.ranks[year]?.[score];if(!band)throw Error('此分数缺少经过核验的历史位次，暂不能生成。');
  const position=rank==null?band[1]:rank;
  const max=data.ranks[year]['400'][1];
  if(!Number.isInteger(position)||position<1||position>max)throw Error('参考位次超出已核验的 400–690 分数据范围，请检查输入。');
  if(position<data.ranks[year]['690'][0])throw Error('参考位次高于已核验范围，请使用 400–690 分段内位次。');
  const prior=new Map();if(+year===2026)for(const r of data.records.filter(r=>r.year===2025)){let k=r.schoolFull+'|'+r.major;prior.set(k,prior.has(k)?null:r);}
  const items=[];
  for(const r of data.records){
   if(r.year!==+year||!r.rank||r.subjectStatus==='选科不符'||(!r.eligible&&!unknown)||(!coop&&r.cooperation)||(ownership&&r.ownership!==ownership))continue;
   if(keyword&&!`${r.schoolFull} ${r.major}`.includes(keyword.trim()))continue;
   const risk=classify(position,r.rank[1]);if(!risk)continue;
   const previous=prior.get(r.schoolFull+'|'+r.major)||null;
   const priorRisk=previous?.rank?classify(position,previous.rank[1]):null;
   const worsening=!!previous?.rank&&position/previous.rank[1]>position/r.rank[1]*1.15;
   items.push({...r,risk,previous,priorRisk,worsening,distance:Math.abs(Math.log(position/r.rank[1]))});
  }
  items.sort((a,b)=>a.distance-b.distance||a.school.localeCompare(b.school,'zh')||a.major.localeCompare(b.major,'zh'));
  return {items,position,band,options:{...options,rank},counts:Object.fromEntries(['冲','稳','保'].map(t=>[t,items.filter(r=>r.risk===t).length]))};
 }
 const api={classify,recommend};if(typeof module!=='undefined')module.exports=api;else root.AdmissionsEngine=api;
})(typeof window==='undefined'?globalThis:window);
