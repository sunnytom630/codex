import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scoreToHistoricalRank,explorationConstraint,selectionFingerprint,compactPlanResult} from '../dist/planning-helpers.js';
import {buildHistoricalIndex,makePreviewProjects,generatePlan} from '../dist/planner-engine.js';

const dir=new URL('../dist/',import.meta.url);
const data=JSON.parse(fs.readFileSync(new URL('planning-data.json',dir)));
data.cutoffs=data.cutoffFiles.flatMap(file=>JSON.parse(fs.readFileSync(new URL(file,dir))));
const db=JSON.parse(fs.readFileSync(new URL('requirements.json',dir)));
const index=buildHistoricalIndex(data);
const profile={first:'物理',electives:['化学','生物'],maxYears:'any',budget:'',rank:'50000',veto:[]};
const settings={mode:'preview',year:2027,count:96,schoolCap:4,marginCount:24,strategy:'balanced',provinces:[],majors:'',avoid:'',allowPrivate:true,allowCooperation:false,allowUnknownCost:true,rank:'50000',budget:''};

test('历史分数换算区分年份和科类，并使用真实表的同分段末位',()=>{
 for(const year of [2023,2024,2025,2026])for(const category of ['物理','历史']){
  const result=scoreToHistoricalRank(data,year,category,530);
  const row=data.scoreTables[`${year}-${category}`]['530'];
  assert.equal(result.rank,row.high);assert.equal(result.low,row.low);assert.equal(result.category,category);assert.equal(result.year,year);
 }
});

test('缺失分数档、汇总档和非法输入均不能伪造位次',()=>{
 for(const [year,category,score] of [[2027,'物理',530],[2026,'',530],[2026,'物理',''],[2026,'物理',null],[2026,'物理',530.5],[2026,'物理',751]])assert.throws(()=>scoreToHistoricalRank(data,year,category,score));
 const fake={scoreTables:{'2026-物理':{'700':{low:1,high:50,count:50,topBucket:true},'530':{low:100,high:200,count:2}}}};
 assert.throws(()=>scoreToHistoricalRank(fake,2026,'物理',700));
 assert.throws(()=>scoreToHistoricalRank(fake,2026,'物理',529));
 assert.throws(()=>scoreToHistoricalRank(fake,2026,'物理',530));
});

test('学习底线只对完全同名样本执行，不把未知方向当成已检查',()=>{
 assert.ok(explorationConstraint('软件工程',{veto:['code']}).excluded.some(s=>s.includes('不接受编程')));
 assert.equal(explorationConstraint('软件工程',{veto:[]}).excluded.length,0);
 assert.equal(explorationConstraint('软件工程（特殊方向）',{veto:['code']}).excluded.length,0);
 assert.ok(explorationConstraint('软件工程（特殊方向）',{veto:['code']}).pending.length);
});

test('真实96项生成流程排除与底线冲突的专业，并为未映射专业保留待核提示',()=>{
 const p={...profile,veto:['code']};
 const result=generatePlan({projects:makePreviewProjects(db,data,'物理'),profile:p,settings,histIndex:index});
 assert.deepEqual(result.errors,[]);assert.equal(result.rows.length,96);
 assert.ok(result.excluded.some(r=>r.major==='软件工程'&&r.exclusions.some(x=>x.includes('底线冲突'))));
 assert.ok(result.rows.every(r=>!explorationConstraint(r.major,p).excluded.length));
 assert.ok(result.rows.every(r=>!explorationConstraint(r.major,p).pending.length));
 const allowed=generatePlan({projects:makePreviewProjects(db,data,'物理'),profile:p,settings:{...settings,allowUnknownTasks:true},histIndex:index});
 assert.ok(allowed.rows.some(r=>r.pending.some(x=>x.includes('专业任务尚未映射'))));
 assert.ok(allowed.rows.every(r=>!explorationConstraint(r.major,p).excluded.length));
});

test('条件指纹跟踪选科、底线、预算及筛选，忽略多选项顺序',()=>{
 const base=selectionFingerprint(profile,settings);
 assert.equal(base,selectionFingerprint({...profile,electives:['生物','化学']},settings));
 for(const p of [{...profile,veto:['code']},{...profile,first:'历史'},{...profile,maxYears:'4'}])assert.notEqual(base,selectionFingerprint(p,settings));
 for(const s of [{...settings,rank:'60000'},{...settings,budget:'0'},{...settings,majors:'软件'},{...settings,allowPrivate:false},{...settings,count:48}])assert.notEqual(base,selectionFingerprint(profile,s));
});

test('快照保留历史位次来源和零预算，后续修改条件不会篡改快照',()=>{
 const basis=scoreToHistoricalRank(data,2026,'物理',530);
 const s={...settings,budget:'0',rank:String(basis.rank),rankBasis:basis};
 const result=generatePlan({projects:makePreviewProjects(db,data,'物理'),profile:{...profile,budget:'10000'},settings:s,histIndex:index});
 assert.deepEqual(result.errors,[]);assert.equal(result.metadata.profile.budget,'0');
 assert.equal(result.metadata.rankBasis.score,530);assert.equal(result.metadata.profile.rank,basis.rank);
 assert.equal(result.metadata.conditionsFingerprint,selectionFingerprint({...profile,budget:'10000'},s));
 s.rankBasis.score=600;assert.equal(result.metadata.settings.rankBasis.score,530);assert.equal(result.metadata.rankBasis.score,530);
});

test('方案快照保留入选项目与排除统计，避免复制整库候选挤满本机存储',()=>{
 const result=generatePlan({projects:makePreviewProjects(db,data,'物理'),profile,settings,histIndex:index});
 assert.ok(result.excluded.length>1000);
 const compact=compactPlanResult(result);
 assert.equal(compact.rows.length,96);assert.ok(!('excluded' in compact));
 assert.deepEqual(compact.stats.reasonCounts,result.stats.reasonCounts);
 assert.deepEqual(compact.metadata,result.metadata);
 assert.ok(Buffer.byteLength(JSON.stringify(compact))<1024*1024);
 assert.ok(Buffer.byteLength(JSON.stringify(compact))<Buffer.byteLength(JSON.stringify(result))/10);
});
