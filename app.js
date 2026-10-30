'use strict';
const data=window.ADMISSIONS_DATA,$=id=>document.getElementById(id),fmt=n=>Number(n).toLocaleString('zh-CN'),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let saved=[];try{const s=JSON.parse(localStorage.getItem('hebei-2027-saved')||'[]');if(Array.isArray(s))saved=s.filter(x=>typeof x==='string'&&data.records.some(r=>r.id===x));}catch{}
let current,tab='all',limit=24;
const toast=s=>{$('toast').textContent=s;$('toast').classList.add('visible');setTimeout(()=>$('toast').classList.remove('visible'),2300);};
function options(){return{score:Number($('score').value),year:Number($('year').value),rank:$('rankInput').value?Number($('rankInput').value):null,keyword:$('keyword').value,ownership:$('ownership').value,coop:$('coop').checked,unknown:$('unknown').checked};}
function generate(){try{current=AdmissionsEngine.recommend(data,options());$('error').textContent='';limit=24;render();}catch(e){$('error').textContent=e.message;}}
function render(){
 const {items,position,band,options:o,counts}=current;
 $('resultTitle').textContent=`${o.score} 分的志愿参考`;
 $('summary').innerHTML=`<div class="summary-grid"><div class="stat"><small>${o.year} 年${o.rank?'自填参考位次':'同分段累计位次'}</small><strong>${fmt(position)}</strong><span>${o.rank?'已使用自填参考位次':`同分段 ${fmt(band[0])}–${fmt(band[1])} 名`}</span></div><div class="stat"><small>符合筛选的专业＋学校</small><strong>${fmt(items.length)}</strong><span>包括待核实项时需另行确认</span></div><div class="stat"><small>涉及学校</small><strong>${fmt(new Set(items.map(r=>r.school)).size)}</strong><span>按当前偏好筛选</span></div></div>`;
 const text=o.score<480?'逐项比较公办、民办与合作办学的选择，优先确认学费和可接受的专业。':o.score<520?'把专业适配度、办学地点和费用一起考虑，避免只追学校名称。':o.score<560?'重点比较同一学校不同专业的历史位次，观察热门专业的门槛差异。':o.score<580?'把目标专业放在具体院校中比较，并留意两年位次变化和招生计划调整。':'同时准备专业优先与学校优先的备选，注意校区、培养方向和特殊要求。';
 $('scenario').innerHTML=`<h3>${o.score>=460&&o.score<=600?'460–600 分重点分析':'分数变化对照'}</h3><p>${text} 下方按历史同分位次比较，不使用自填位次。</p><div class="scenario-row">${[-10,0,10].map(d=>{const score=o.score+d;if(score<400||score>690)return '';const s=AdmissionsEngine.recommend(data,{...o,score,rank:null});return `<button data-scenario="${score}"><b>${score} 分</b>冲 ${s.counts['冲']} · 稳 ${s.counts['稳']} · 保 ${s.counts['保']}</button>`;}).join('')}</div>`;
 $('savedCount').textContent=saved.length;
 document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.querySelector('b').textContent=b.dataset.tab==='all'?items.length:b.dataset.tab==='saved'?saved.length:counts[b.dataset.tab];});
 let list=tab==='saved'?saved.map(id=>{const match=items.find(r=>r.id===id);return match||{...data.records.find(r=>r.id===id),risk:null};}).filter(r=>r.id):tab==='all'?items:items.filter(r=>r.risk===tab);
 $('listNote').textContent=tab==='saved'?`备选共 ${list.length} 条；可调整顺序。超出当前筛选条件的项目保留，但不显示当前分档。`:`共 ${list.length} 条，按与参考位次的接近程度排序。冲稳保为经验分档，不是录取概率。`;
 $('cards').innerHTML=list.length?list.slice(0,limit).map(card).join(''):'<div class="empty">暂无符合条件的项目。<br>可以更换关键词、办学性质，或查看其他分档。</div>';
 $('more').hidden=list.length<=limit;
}
function card(r){
 const chosen=saved.includes(r.id),yr=r.year,source=data.sources[yr===2026?0:1],rank=r.rank,prev=r.previous;
 return `<article class="card"><div class="card-top"><div><h3 class="school">${esc(r.school)}</h3><p class="major">${esc(r.major)}</p><div class="chips"><span>${esc(r.ownership)}</span><span>${yr} 本科批物理类</span>${r.cooperation?'<span>中外合作</span>':''}<span>${esc(r.subjectStatus)}</span></div></div>${r.risk?`<span class="risk risk-${r.risk}">${r.risk}一${r.risk}</span>`:'<span class="risk">待重新评估</span>'}</div><div class="card-metrics"><div><small>${yr} 投档最低分</small><strong>${r.score}</strong><span>分</span></div><div><small>投档分对应累计位次</small><strong>${rank?fmt(rank[1]):'未提取'}</strong></div><div><small>2025 同名项目投档分</small><strong>${yr===2025?'本年':prev?prev.score:'—'}</strong><span>${prev?'分':'不强行匹配'}</span></div></div><div class="card-bottom"><span>${r.worsening?'<span class="warning">2025 同名专业门槛更高，需谨慎。</span>':r.eligible?'选科条件已匹配；2027 招生计划仍待核实。':'选科匹配未完成，请先核对官方要求。'}</span><button class="save ${chosen?'selected':''}" data-save="${r.id}">${chosen?'已加入 · 移除':'＋ 加入备选'}</button></div><details><summary>查看数据、选科要求与风险说明</summary><p>原表名称：${esc(r.schoolFull)}。院校代号 ${esc(r.schoolCode)}，专业代号 ${esc(r.majorCode)}（均为 ${yr} 年代号，不能直接用于 2027 填报）。</p><p>已公布的 2027 选科要求：${esc(r.subject||'尚未通过学校及专业全名唯一匹配，不能确认可报。')}</p><p>${yr} 投档分 ${r.score} 对应物理类同分段 ${rank?fmt(rank[0])+'–'+fmt(rank[1])+' 名':'未提取'}。此区间不等于该专业的精确投档位次；同分考生还有排序规则。</p>${prev?`<p>2025 同名项目：${prev.score} 分；对应累计位次 ${prev.rank?fmt(prev.rank[1]):'未提取'}。按当前参考位次对照分档：${r.priorRisk||'超出筛选区间'}。未按招生人数变化校正。</p>`:''}<p>来源：<a href="${source.url}" target="_blank" rel="noopener">河北省教育考试院原始投档表</a>，Sheet1 第 ${r.row} 行。${r.note?'原表备注：'+esc(r.note):''}</p><p>学费、招生人数、办学校区、体检、单科成绩及外语限制均需查 2027 招生计划与章程。投档不等于最终录取，“保”不等于保录。</p></details>${tab==='saved'?`<div style="margin-top:10px"><button class="outline" data-move="${r.id}" data-direction="-1" ${saved.indexOf(r.id)===0?'disabled':''}>上移</button> <button class="outline" data-move="${r.id}" data-direction="1" ${saved.indexOf(r.id)===saved.length-1?'disabled':''}>下移</button></div>`:''}</article>`;
}
function persist(){try{localStorage.setItem('hebei-2027-saved',JSON.stringify(saved));}catch{toast('浏览器未允许保存，备选仅保留在本次页面中。');}}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.score){$('score').value=b.dataset.score;$('rankInput').value='';generate();}
 if(b.dataset.scenario){$('score').value=b.dataset.scenario;$('rankInput').value='';generate();}
 if(b.dataset.tab){tab=b.dataset.tab;limit=24;render();}
 if(b.dataset.save){saved=saved.includes(b.dataset.save)?saved.filter(x=>x!==b.dataset.save):[...saved,b.dataset.save];persist();render();}
 if(b.dataset.move){const i=saved.indexOf(b.dataset.move),j=i+Number(b.dataset.direction);if(j>=0&&j<saved.length){[saved[i],saved[j]]=[saved[j],saved[i]];persist();render();}}
});
$('profile').addEventListener('submit',e=>{e.preventDefault();generate();});
$('more').onclick=()=>{limit+=24;render();};
$('savedNav').onclick=()=>{tab='saved';limit=24;render();$('results').scrollIntoView({behavior:'smooth'});};
$('export').onclick=()=>{
 if(!saved.length){toast('先将感兴趣的学校和专业加入备选。');return;}
 const safe=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const rows=[['顺序','学校','专业','历史年份','历史投档分','同分段首位','同分段末位','当前经验分档','2027选科要求','选科状态','源表行','来源','参考分数','参考位次','说明']];
 saved.forEach((id,i)=>{const r=data.records.find(r=>r.id===id),match=current.items.find(x=>x.id===id);rows.push([i+1,r.schoolFull,r.major,r.year,r.score,r.rank?.[0],r.rank?.[1],match?.risk||'待重新评估',r.subject||'待核实',r.subjectStatus,r.row,data.sources[r.year===2026?0:1].url,current.options.score,current.position,'2027备考参考；2027招生计划、学费和体检等条件待核实；非正式填报表，分档不保证录取']);});
 const blob=new Blob(['\ufeff'+rows.map(r=>r.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='河北2027志愿备选参考表.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出备选表，可用表格软件打开。');
};
$('sourceLinks').innerHTML=data.sources.map(s=>`<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.label)} ↗</a></li>`).join('');
$('dataStats').textContent=`历史有效投档记录 ${fmt(data.records.length)} 条；460–600 分段 ${fmt(data.records.filter(r=>r.score>=460&&r.score<=600).length)} 条（两年合计）。数据核对日期 ${data.asOf}。`;
generate();
