import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {majors,dimensions} from '../dist/majors.js';
import {checkRequirement,subjectSelectionValid,buildIndex,rankMajors,filterRecords,validateHistory,compareRank,csvCell} from '../dist/engine.js';
const db=JSON.parse(fs.readFileSync(new URL('../dist/requirements.json',import.meta.url))),index=buildIndex(db);
const profile=()=>({first:'物理',electives:['化学','生物'],maxYears:'any',grad:'yes',health:'unknown',interests:Object.fromEntries(dimensions.map(([id])=>[id,1])),strengths:[],goals:[],veto:[]});
test('官方记录完整，21类选科原文可识别，12种合法组合逐一检查',()=>{
 assert.equal(db.records.length,91789);assert.equal(Object.keys(db.schools).length,2449);assert.equal(db.requirements.length,21);
 const electives=['化学','生物','思想政治','地理'];let count=0;
 for(const first of ['物理','历史'])for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){
  const p={first,electives:[electives[a],electives[b]]};assert.ok(subjectSelectionValid(p));count++;
  for(const req of db.requirements){const selected=[first,...p.electives];const specified=['物理','历史','化学','生物','思想政治','地理'].filter(s=>req.includes(s));assert.equal(checkRequirement(req,selected),req==='不提科目要求'||specified.every(s=>selected.includes(s)));}
 }assert.equal(count,12);assert.equal(checkRequirement('未知的新要求',[]),null);assert.equal(subjectSelectionValid({first:'历史',electives:['物理','化学']}),false);
});
test('换兴趣会改变专业排序，历史组合的计算机不能混入本科推荐',()=>{
 const p=profile();p.interests.logic=4;p.interests.code=4;p.strengths=['math'];p.goals=['industry'];
 const tech=rankMajors(p,db,index).filter(m=>!m.hard.length&&m.hasSignal);assert.ok(['cs','software','data'].includes(tech[0].id));
 const h=profile();h.first='历史';h.electives=['思想政治','地理'];h.interests.text=4;h.interests.teach=4;h.strengths=['language','social'];h.goals=['teacher','public'];
 const human=rankMajors(h,db,index);assert.ok(['chinese','primary'].includes(human.find(m=>!m.hard.length).id));assert.ok(human.find(m=>m.id==='cs').hard.length);assert.notEqual(tech[0].id,human.find(m=>!m.hard.length).id);
});
test('明确底线和四年学制有实际排除作用，未知兴趣不产生推荐',()=>{
 const p=profile();p.veto=['code'];p.maxYears='4';p.interests.code=4;
 const r=rankMajors(p,db,index);assert.ok(r.find(m=>m.id==='cs').hard.some(t=>t.includes('编程')));assert.ok(r.find(m=>m.id==='clinical').hard.some(t=>t.includes('4年')));
 p.interests=Object.fromEntries(dimensions.map(([k])=>[k,null]));assert.equal(rankMajors(p,db,index).filter(m=>!m.hard.length&&m.hasSignal&&m.coverage>=50&&m.score>=45).length,0);
});
test('本科就业偏好降低部分岗位深造依赖样本优先度，但不直接否定本科出口',()=>{
 const p=profile();p.interests.logic=4;const before=rankMajors(p,db,index).find(m=>m.id==='math');p.grad='no';const after=rankMajors(p,db,index).find(m=>m.id==='math');assert.equal(before.score-after.score,10);assert.equal(after.hard.length,0);assert.ok(after.warnings.some(x=>x.includes('本科出口')));
});
test('官方院校专业筛选返回正确名称和全部必选科目，数据索引只计本科',()=>{
 const p=profile(),rows=filterRecords(db,p,{school:'河北大学',major:'计算机',level:'本科',onlyEligible:true});assert.ok(rows.length>0);
 for(const {r} of rows){assert.ok(db.schools[r[0]].includes('河北大学'));assert.ok(r[2].includes('计算机'));assert.equal(db.levels[r[3]],'本科');assert.equal(checkRequirement(db.requirements[r[4]],[p.first,...p.electives]),true);}
 for(const id of index.get('小学教育')||[])assert.equal(db.levels[db.records[id][3]],'本科');
});
test('历史位次校验拒绝混科类、缺来源、重复项目与不完整三年数据',()=>{
 const text='学校,专业,年份,科类,最低位次,来源\n测试大学,测试专业,2026,物理,30000,测试资料\n测试大学,测试专业,2025,物理,35000,测试资料\n测试大学,测试专业,2024,物理,32000,测试资料';
 const rows=validateHistory(text),p={...profile(),rank:'31000'};assert.equal(compareRank(rows,'测试大学','测试专业',p).label,'你的位次处于近三年线波动区');assert.equal(compareRank(rows,'测试大学','测试专业',{...p,first:'历史'}).label,'未接入该专业历史位次');
 assert.equal(compareRank(rows.slice(1),'测试大学','测试专业',p).label,'历史样本不足3年');assert.throws(()=>validateHistory(text+'\n测试大学,测试专业,2026,物理,30001,测试资料'));assert.throws(()=>validateHistory(text.replace('2026','2027')));assert.throws(()=>validateHistory(text.replace('测试资料','')));
 assert.equal(csvCell('=1+2'),'"\'=1+2"');
});
console.log('专业同名覆盖',majors.map(m=>[m.name,(index.get(m.name)||[]).length]));
