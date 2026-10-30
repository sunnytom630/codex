import {checkRequirement,subjectSelectionValid,parseCSV} from './engine.js';
import {explorationConstraint,selectionFingerprint} from './planning-helpers.js';

export const PLANNER_VERSION='2.1.0';
export const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').replace(/\[(公办|民办|独立学院)\]/g,'').replace(/\([^()]*(?:市|县)\)/g,'');
export const historyKey=(school,major,category)=>[normalize(school),normalize(major),category].join('|');
export const stablePlanKey=r=>[r.year,r.province,r.category,r.batch,r.planType,r.schoolCode,r.majorCode,r.campus].join('|');
export function buildHistoricalIndex(data){
 const result=new Map();for(const r of data.cutoffs){const k=historyKey(r.school,r.major,r.category);if(!result.has(k))result.set(k,[]);result.get(k).push(r);}return result;
}
export function historyFor(index,school,major,category,year){
 const rows=index.get(historyKey(school,major,category))||[],result=[],ambiguous=[];
 for(let y=year-3;y<year;y++){const matching=rows.filter(r=>r.year===y&&r.score!==null);if(matching.length===1)result.push(matching[0]);else if(matching.length>1)ambiguous.push(y);}
 return {rows:result.sort((a,b)=>a.year-b.year),ambiguous};
}
export function describeRisk(rows,rank){
 if(rows.length<3||rows.some(r=>!Number.isFinite(r.rankLow)||!Number.isFinite(r.rankHigh)))return {label:'历史证据不足',band:'unknown',gap:null};
 const min=Math.min(...rows.map(r=>r.rankLow)),max=Math.max(...rows.map(r=>r.rankHigh)),median=rows.map(r=>(r.rankLow+r.rankHigh)/2).sort((a,b)=>a-b)[1];
 let band=rank<=min*.85?'margin':rank<=min?'ahead':rank<=max?'within':'reach';
 return {label:{margin:'历史余量较大',ahead:'位次在历史区间前',within:'位次落在历史波动区',reach:'位次弱于历史区间'}[band],band,gap:rank/median,min,max,median};
}
export function planMissing(r){
 const missing=[];
 for(const [k,label] of [['schoolCode','当年院校代号'],['majorCode','当年专业代号'],['campus','实际校区'],['source','计划来源'],['charter','章程来源'],['published','公布日期'],['requirement','选科要求'],['language','语种要求'],['healthRule','体检及单科规则']])if(!String(r[k]??'').trim())missing.push(label);
 if(!Number.isInteger(r.seats)||r.seats<1)missing.push('招生人数');
 if(!Number.isInteger(r.years)||r.years<3||r.years>8)missing.push('学制');
 if(!Number.isFinite(r.tuition)||r.tuition<0)missing.push('完整年学费');
 if(r.planStatus!=='正式')missing.push('当年正式计划状态');
 return missing;
}
export function programFingerprint(r){return JSON.stringify([stablePlanKey(r),r.seats,r.years,r.tuition,r.requirement,r.language,r.healthRule,r.source,r.charter,r.reviewRevision]);}
export function assessProject(project,{profile,settings,histIndex,subjects,qualified={},year}){
 const exclusions=[],pending=[],notes=[];
 const exploration=explorationConstraint(project.major,profile);
 exclusions.push(...exploration.excluded);pending.push(...exploration.pending);
 if(exploration.pending.length&&!settings.allowUnknownTasks)exclusions.push('无法核实学习任务底线，未放行待核专业');
 const formal=settings.mode==='formal';
 if(checkRequirement(project.requirement,subjects)!==true)exclusions.push('选科不匹配或科目要求无法识别');
 if(project.category!==profile.first)exclusions.push('科类不一致');
 if(formal){
  if(project.year!==year||project.province!=='河北'||project.batch!=='本科批'||project.planType!=='普通')exclusions.push('年份、河北普通本科批或计划性质不符');
  const missing=planMissing(project);if(missing.length)exclusions.push('项目信息未完整：'+missing.join('、'));
  if(!project.reviewed)exclusions.push('招生项目未经本机人工复核');
  if(qualified[project.id]!==programFingerprint(project))pending.push('本人尚未逐项确认体检、语种和单科等资格');
 }else pending.push('未核当年实际招生计划、年度填报代号及完整资格');
 const provinces=settings.provinces||[];
 if(provinces.length&&!provinces.includes(project.schoolProvince))exclusions.push(project.schoolProvince?'不在接受的学校所在省份内':'学校所在地未核实');
 if(!settings.allowPrivate&&(!project.nature||project.nature==='民办'))exclusions.push(project.nature?'不接受民办院校':'无法核实办学性质');
 if(!settings.allowCooperation&&(/合作/.test(project.nature||'')||/中外合作|中美合作|中法合作|中英合作|中澳合作|中加合作|中俄合作|国际本科|高收费/.test(project.major+' '+(project.note||''))))exclusions.push('不接受合作或高收费项目');
 const terms=(settings.majors||'').split(/[,，;；\n]/).map(s=>s.trim()).filter(Boolean);
 let preference=0;
 if(terms.length){const pos=terms.findIndex(t=>project.major.includes(t));if(pos<0)exclusions.push('未命中可接受的专业关键词');else preference=terms.length-pos;}
 const avoid=(settings.avoid||'').split(/[,，;；\n]/).map(s=>s.trim()).filter(Boolean);
 if(avoid.some(t=>(project.school+' '+project.major).includes(t)))exclusions.push('命中明确排除关键词');
 const rawBudget=settings.budget!==''&&settings.budget!==undefined?settings.budget:profile.budget,budget=Number(rawBudget);
 if(rawBudget!==''&&rawBudget!==undefined){if(project.tuition===null||project.tuition===undefined){pending.push('学费尚未核实');if(formal||!settings.allowUnknownCost)exclusions.push('无法验证学费预算');}else if(project.tuition>budget)exclusions.push('超过年学费预算');}
 if(profile.maxYears==='4'){if(project.years>4)exclusions.push('超过四年学制上限');else if(!project.years){pending.push('学制待核，尚不能判定满足四年上限');if(formal||!settings.allowUnknownCost)exclusions.push('无法验证学制上限');}}
 const h=historyFor(histIndex,project.school,project.major,profile.first,year);
 if(h.ambiguous.length)exclusions.push('历史同名项目存在多条记录，须人工对应');
 const risk=describeRisk(h.rows,Number(settings.rank||profile.rank));
 if(risk.band==='unknown')exclusions.push('不足连续三年且可换算位次的历史依据，不进入自动生成');
 const maxGap={cautious:1.05,balanced:1.20,explore:1.35}[settings.strategy]||1.20;
 if(risk.gap&&risk.gap>maxGap)exclusions.push('超出当前策略的历史位次探索范围');
 if(h.rows.some(r=>r.note))notes.push('历史记录有备注，请查看原表');
 if(settings.mode==='preview')notes.push('学校所在城市不是实际就读校区');
 return {...project,exclusions,pending,notes,history:h.rows,risk,preference};
}
export function makePreviewProjects(db,data,category){
 const projects=[],seen=new Set();
 db.records.forEach((r,index)=>{
  if(db.levels[r[3]]!=='本科')return;
  const school=db.schools[r[0]],major=r[2],req=db.requirements[r[4]],k=[school,major,req].join('|');
  if(seen.has(k))return;seen.add(k);
  const meta=data.schools[school]||data.schools[normalize(school)]||{};
  projects.push({id:'ref27-'+index,refIndex:index,school,major,category,requirement:req,schoolProvince:meta.province||'',city:meta.city||'',nature:meta.nature||'',years:null,tuition:null,source:db.meta.source,referenceCode:r[1],referenceSchoolCode:r[0],year:2027,campus:'',mode:'preview'});
 });return projects;
}
export function generatePlan({projects,profile,settings,histIndex,qualified={},locked=[],year=2027,dataVersion='unknown',revision=0}){
 const errors=[];
 if(!subjectSelectionValid(profile))errors.push('请先完成合法的首选和两门再选科目。');
 const rank=Number(settings.rank||profile.rank);
 if(!Number.isInteger(rank)||rank<1||rank>1000000)errors.push('请填写1—1000000之间的同类考生位次；预估位次只用于预选。');
 const count=Number(settings.count??96),cap=Number(settings.schoolCap??4);
 if(!Number.isInteger(count)||count<1||count>96)errors.push('生成数量须为1—96。');
 if(!Number.isInteger(cap)||cap<1||cap>96)errors.push('每校数量上限须为1—96。');
 const margin=Number(settings.marginCount??24);if(!Number.isInteger(margin)||margin<0||margin>count)errors.push('历史余量项目目标须为0—目标志愿数之间的整数。');
 const rawBudget=settings.budget!==''&&settings.budget!==undefined?settings.budget:profile.budget;
 if(rawBudget!==''&&rawBudget!==undefined&&(!Number.isInteger(Number(rawBudget))||Number(rawBudget)<0))errors.push('学费预算须为非负整数，0表示仅接受免费项目。');
 if(errors.length)return {errors,rows:[],excluded:[],gaps:[],stats:{}};
 const subjects=[profile.first,...profile.electives];
 const assessed=projects.map(p=>assessProject(p,{profile,settings,histIndex,subjects,qualified,year}));
 const lockedBad=locked.map(id=>assessed.find(r=>r.id===id)).filter(r=>!r||r.exclusions.length||(settings.mode==='formal'&&r.pending.length));
 if(lockedBad.length)return {errors:['有锁定项目不再满足条件或已失效。请先解除锁定或完成核验，系统不会静默保留。'],rows:[],excluded:assessed.filter(r=>r.exclusions.length),gaps:[],stats:{}};
 const valid=assessed.filter(r=>!r.exclusions.length&&(settings.mode!=='formal'||!r.pending.length));
 const order=(a,b)=>b.preference-a.preference||((settings.strategy==='cautious'?Math.abs(a.risk.gap-.75):Math.abs(a.risk.gap-.90))-(settings.strategy==='cautious'?Math.abs(b.risk.gap-.75):Math.abs(b.risk.gap-.90)))||a.school.localeCompare(b.school,'zh');
 valid.sort(order);
 const selected=[],schoolCounts=new Map(),identity=new Set(),lockedIds=new Set(locked);
 const append=r=>{const key=historyKey(r.school,r.major,r.category);if(identity.has(key)||(schoolCounts.get(r.school)||0)>=cap||selected.length>=count)return false;selected.push({...r,locked:lockedIds.has(r.id)});identity.add(key);schoolCounts.set(r.school,(schoolCounts.get(r.school)||0)+1);return true;};
 for(const id of locked){const r=valid.find(r=>r.id===id);if(!append(r))errors.push('锁定项目超过数量、同校上限，或存在同名重复。');}
 if(errors.length)return {errors,rows:[],excluded:[],gaps:[],stats:{}};
 const marginTarget=Math.min(count,Math.max(0,Number(settings.marginCount??24)));
 for(const r of valid.filter(r=>r.risk.band==='margin')){if(selected.filter(x=>x.risk.band==='margin').length>=marginTarget)break;append(r);}
 for(const r of valid)append(r);
 selected.sort(order);
 // 行顺序是可编辑的初稿，不声称按历史难度排序即为真实意愿。
 const schoolConcentration=Math.max(0,...schoolCounts.values()),majorCounts=collections(selected,r=>r.major);
 const bandCounts=collections(selected,r=>r.risk.band);
 const reasonCounts=collections(assessed.flatMap(r=>r.exclusions),x=>x);
 const gaps=[];if(selected.length<count)gaps.push(`仅找到${selected.length}项，距离目标${count}项还差${count-selected.length}项。未自动放宽任何条件。`);
 if(selected.length&&selected.filter(r=>r.risk.band==='margin').length<marginTarget)gaps.push(`历史余量较大项目仅${selected.filter(r=>r.risk.band==='margin').length}项，未达到你设置的${marginTarget}项目标。未自动放宽条件。`);
 if(selected.length&&Math.max(0,...Object.values(majorCounts))>selected.length*.6)gaps.push('超过60%的项目集中于同一专业名称，需注意专业方向集中。');
 if(settings.mode==='preview')gaps.push('所有项目均为预选草案，尚不能作为正式填报表。');
 if(selected.length)gaps.push('生成顺序需要由考生按真实就读意愿确认；任何历史余量都不保证录取。');
 return {errors:[],rows:selected,excluded:assessed.filter(r=>r.exclusions.length||settings.mode==='formal'&&r.pending.length),gaps,stats:{available:valid.length,examined:projects.length,selected:selected.length,schools:schoolCounts.size,schoolConcentration,bandCounts,reasonCounts},metadata:{engineVersion:PLANNER_VERSION,dataVersion,revision,year,created:new Date().toISOString(),mode:settings.mode,settings:structuredClone(settings),conditionsFingerprint:selectionFingerprint(profile,settings),rankBasis:settings.rankBasis?{...settings.rankBasis}:null,profile:{first:profile.first,electives:[...profile.electives],veto:[...(profile.veto||[])],rank,budget:rawBudget??'',maxYears:profile.maxYears}}};
}
function collections(rows,key){const r={};for(const x of rows){const k=key(x);r[k]=(r[k]||0)+1;}return r;}
const url=s=>/^https?:\/\/[^\s<>]+$/.test(s||'');
export function importPrograms(text){
 const rows=parseCSV(text),head=rows.shift()?.map(x=>x.trim()),required=['年份','科类','学校','专业','计划来源'];
 if(!head||required.some(x=>!head.includes(x)))throw Error('至少需要：年份、科类、学校、专业、计划来源。');
 if(rows.length>50000)throw Error('单次最多导入50000行。');const result=[],keys=new Set();
 const val=(r,k)=>r[k]?.trim()||'';const num=(r,k)=>val(r,k)===''?null:Number(val(r,k));
 rows.forEach((cells,i)=>{
  const r=Object.fromEntries(head.map((k,n)=>[k,cells[n]||'']));
  if(!/^20\d{2}$/.test(val(r,'年份'))||+r.年份<2024||+r.年份>2027||!['物理','历史'].includes(val(r,'科类'))||!val(r,'学校')||!val(r,'专业')||!url(val(r,'计划来源')))throw Error(`第${i+2}行：年份、科类、学校、专业或计划来源不合法。`);
  for(const k of ['招生人数','学制','年学费'])if(val(r,k)!==''&&(!Number.isInteger(num(r,k))||num(r,k)<0))throw Error(`第${i+2}行：${k}须为非负整数或留空，缺失不能填0。`);
  if(val(r,'章程来源')&&!url(val(r,'章程来源')))throw Error(`第${i+2}行：章程来源须为网址。`);
  for(const k of ['学校','专业','校区','语种要求','体检及单科要求'])if(val(r,k).length>1500)throw Error(`第${i+2}行：字段过长。`);
  const p={year:+r.年份,province:val(r,'生源省份')||'河北',category:val(r,'科类'),batch:val(r,'批次')||'本科批',planType:val(r,'计划性质')||'普通',school:val(r,'学校'),major:val(r,'专业'),schoolCode:val(r,'院校代号'),majorCode:val(r,'专业代号'),campus:val(r,'校区'),schoolProvince:val(r,'学校所在省'),city:val(r,'学校所在市'),nature:val(r,'办学性质'),seats:num(r,'招生人数'),years:num(r,'学制'),tuition:num(r,'年学费'),requirement:val(r,'选科要求'),language:val(r,'语种要求'),healthRule:val(r,'体检及单科要求'),source:val(r,'计划来源'),charter:val(r,'章程来源'),published:val(r,'公布日期'),planStatus:val(r,'计划状态'),reviewed:false,reviewRevision:0};
  if(p.published&&!/^\d{4}-\d{2}-\d{2}$/.test(p.published))throw Error(`第${i+2}行公布日期格式须为YYYY-MM-DD。`);
  const k=[p.year,p.province,p.category,p.batch,p.planType,p.school,p.major,p.campus,p.schoolCode,p.majorCode].join('|');if(keys.has(k))throw Error(`第${i+2}行存在重复项目，请区分校区、计划性质和年度代码。`);keys.add(k);
  p.id='import-'+encodeURIComponent(k);result.push(p);
 });if(!result.length)throw Error('没有数据行。');return result;
}
export function validateReview(r,reviewer,note){
 const errors=planMissing(r);if(!String(reviewer).trim())errors.push('复核人');if(String(note).trim().length<10)errors.push('不少于10字的来源核对说明');
 if(r.province!=='河北'||r.batch!=='本科批'||r.planType!=='普通')errors.push('当前只支持河北普通本科批普通计划');
 if(!/^\d{4}$/.test(r.schoolCode||'')||!/^\d{2,3}$/.test(r.majorCode||''))errors.push('年度填报代号格式');
 if(r.published){const t=new Date(r.published);if(!/^\d{4}-\d{2}-\d{2}$/.test(r.published)||!Number.isFinite(t.getTime())||t.toISOString().slice(0,10)!==r.published)errors.push('有效公布日期');else if(t.getTime()>Date.now())errors.push('公布日期不能在未来');}
 if(!url(r.source)||!url(r.charter))errors.push('有效来源网址');
 return [...new Set(errors)];
}
export function retrospectiveCheck(index,targets,targetYear){
 // 只用目标年前的数据形成区间，再看目标年实际结果；不把目标年结果放进预测输入。
 let examined=0,inside=0,outside=0,insufficient=0;
 for(const actual of targets.filter(r=>r.year===targetYear&&r.rankLow&&r.rankHigh)){
  const h=historyFor(index,actual.school,actual.major,actual.category,targetYear);
  if(h.rows.length<3||h.ambiguous.length||h.rows.some(r=>!r.rankLow||!r.rankHigh)){insufficient++;continue;}
  const low=Math.min(...h.rows.map(r=>r.rankLow)),high=Math.max(...h.rows.map(r=>r.rankHigh));examined++;
  if(actual.rankLow<=high&&actual.rankHigh>=low)inside++;else outside++;
 }return {targetYear,examined,inside,outside,insufficient,label:examined?'历史区间覆盖检查，不是个人录取准确率':'前置历史不足，未进行回测'};
}
