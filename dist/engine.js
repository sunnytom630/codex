import {majors,dimensions,tasks,strengths} from './majors.js';
export const SUBJECTS=['物理','历史','化学','生物','思想政治','地理'];
export function checkRequirement(requirement,selected){
 if(!requirement || typeof requirement!=='string') return null;
 if(requirement==='不提科目要求') return true;
 const names=SUBJECTS.filter(s=>requirement.includes(s));
 if(!names.length) return null;
 // 本内置表21类要求均为全部指定科目须选考；兼容显式“或”。
 return /或|至少.*1门|其中.*1门/.test(requirement)?names.some(s=>selected.includes(s)):names.every(s=>selected.includes(s));
}
export function subjectSelectionValid(p){return ['物理','历史'].includes(p.first)&&Array.isArray(p.electives)&&p.electives.length===2&&new Set(p.electives).size===2&&p.electives.every(x=>['化学','生物','思想政治','地理'].includes(x));}
export function buildIndex(data){
 const index=new Map();
 data.records.forEach((r,i)=>{if(data.levels[r[3]]!=='本科')return;const name=r[2].trim();if(!index.has(name))index.set(name,[]);index.get(name).push(i);});
 return index;
}
export function assessMajor(m,p,data,index){
 const interest=p.interests||{},answers=Object.entries(m.weights).filter(([k])=>Number.isFinite(interest[k]));
 const allWeight=Object.values(m.weights).reduce((a,b)=>a+b,0),knownWeight=answers.reduce((a,[,w])=>a+w,0);
 const interestFit=knownWeight?answers.reduce((sum,[k,w])=>sum+interest[k]/4*w,0)/knownWeight:0;
 let weights=70,total=interestFit*70;
 if(p.strengths?.length){total+=20*m.ability.filter(s=>p.strengths.includes(s)).length/m.ability.length;weights+=20;}
 if(p.goals?.length){total+=10*m.goals.filter(g=>p.goals.includes(g)).length/m.goals.length;weights+=10;}
 const score=Math.max(0,Math.round(total/weights*100)-(p.grad==='no'&&m.grad===2?10:0));
 const positive=answers.filter(([k])=>interest[k]>=3).sort((a,b)=>b[1]-a[1]).map(([k])=>dimensions.find(d=>d[0]===k)[1]);
 const negative=answers.filter(([k,w])=>interest[k]<=1 && w>=2).map(([k])=>dimensions.find(d=>d[0]===k)[1]);
 const hard=m.core.filter(t=>p.veto?.includes(t)).map(t=>`核心学习任务与你的底线冲突：${tasks[t]}`);
 if(p.maxYears==='4'&&m.years>4)hard.push(`本样本按${m.years}年本科路径整理，超过你选择的4年上限`);
 const rows=index.get(m.name)||[],sel=[p.first,...(p.electives||[])];
 const valid=subjectSelectionValid(p),matching=valid?rows.filter(i=>checkRequirement(data.requirements[data.records[i][4]],sel)===true):[];
 const unknown=rows.filter(i=>checkRequirement(data.requirements[data.records[i][4]],sel)===null);
 let eligibility='pending';
 if(valid&&rows.length&&!unknown.length){eligibility=matching.length?'matched':'blocked';if(!matching.length)hard.push('内置2027选科表中，同名专业记录均不满足你的科目组合');}
 const warnings=[];
 if(p.grad==='no'&&m.grad===2)warnings.push('你希望本科就业；此方向部分目标岗位常需深造，应先核查本科出口。');
 if(negative.length)warnings.push(`你对“${negative.join('、')}”兴趣较低，建议先体验对应课程。`);
 if(m.field==='艺术与体育')warnings.push('需要另外核对艺术或体育考试、文化成绩、体检及报名资格。');
 if(p.health==='review')warnings.push('你选择了有体检受限项：系统不自动判断医学限制，须逐校核对体检结论与章程。');
 if(m.years>4)warnings.push(`本样本常见本科路径为${m.years}年，实际学制以学校为准。`);
 if(!rows.length)warnings.push('内置表未找到完全同名的专业记录，不能据此判断可报；请另查专业类或当年计划。');
 return {...m,score,positive,negative,hard,warnings,eligibility,rows,matching,coverage:Math.round(knownWeight/allWeight*100),hasSignal:positive.length>0};
}
export function rankMajors(p,data,index){return majors.map(m=>assessMajor(m,p,data,index)).sort((a,b)=>a.hard.length-b.hard.length||b.score-a.score||a.name.localeCompare(b.name,'zh'));}
export function filterRecords(data,p,{school='',major='',level='本科',onlyEligible=true}={}){
 const sel=[p.first,...(p.electives||[])],valid=subjectSelectionValid(p);
 return data.records.map((r,i)=>({r,i})).filter(({r})=>(!level||data.levels[r[3]]===level)&&(!school||`${data.schools[r[0]]} ${r[0]}`.includes(school.trim()))&&(!major||r[2].includes(major.trim()))&&(!onlyEligible||(valid&&checkRequirement(data.requirements[r[4]],sel)===true)));
}
export function parseCSV(text){
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quote=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}else if(ch===','&&!quote){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=ch;}
 if(quote)throw Error('CSV中有未闭合的双引号。');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export function validateHistory(text){
 const rows=parseCSV(text),header=rows.shift()?.map(x=>x.trim());
 const required=['学校','专业','年份','科类','最低位次','来源'];
 if(!header||required.some(x=>!header.includes(x)))throw Error('缺少列：学校、专业、年份、科类、最低位次、来源。');
 if(rows.length>50000)throw Error('一次最多导入50000行。');
 const records=[],seen=new Set();
 for(let i=0;i<rows.length;i++){
  const r=Object.fromEntries(header.map((k,j)=>[k,(rows[i][j]||'').trim()]));
  if(!r.学校||!r.专业||!r.来源||!['物理','历史'].includes(r.科类)||!/^20\d{2}$/.test(r.年份)||+r.年份<2021||+r.年份>2026||!/^\d+$/.test(r.最低位次)||+r.最低位次<1)throw Error(`第${i+2}行不完整或不合法：年份应为2021—2026，科类应为物理或历史，最低位次须为正整数，并注明来源。`);
  const key=[r.学校,r.专业,r.科类,r.年份].join('|');if(seen.has(key))throw Error(`第${i+2}行与已有行重复，请先核实是否混入不同校区、专项或项目。`);seen.add(key);
  records.push({school:r.学校,major:r.专业,year:+r.年份,category:r.科类,rank:+r.最低位次,source:r.来源});
 }
 if(!records.length)throw Error('没有可导入的数据行。');return records;
}
export function compareRank(history,school,major,p){
 const rows=history.filter(h=>h.school===school&&h.major===major&&h.category===p.first).sort((a,b)=>b.year-a.year).slice(0,3);
 const rank=+p.rank;
 if(!rank)return {label:'未填写个人位次',rows};
 if(rows.length<3)return {label:rows.length?'历史样本不足3年':'未接入该专业历史位次',rows};
 if(rows[0].year!==2026||rows[1].year!==2025||rows[2].year!==2024)return {label:'缺少连续2024—2026年数据',rows};
 const ranks=rows.map(x=>x.rank),min=Math.min(...ranks),max=Math.max(...ranks);
 return {label:rank<=min?'你的位次优于或等于近三年线':rank<=max?'你的位次处于近三年线波动区':'你的位次弱于近三年线',rows};
}
export function csvCell(value){let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
