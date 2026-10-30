import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildHistoricalIndex,makePreviewProjects,generatePlan,importPrograms,validateReview,programFingerprint,historyFor,retrospectiveCheck,assessProject} from '../dist/planner-engine.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/planning-data.json',import.meta.url)));data.cutoffs=data.cutoffFiles.flatMap(file=>JSON.parse(fs.readFileSync(new URL('../dist/'+file,import.meta.url))));const db=JSON.parse(fs.readFileSync(new URL('../dist/requirements.json',import.meta.url))),index=buildHistoricalIndex(data);
const p={first:'物理',electives:['化学','生物'],maxYears:'any',budget:'',rank:'50000'};
const settings={mode:'preview',count:96,schoolCap:4,marginCount:24,strategy:'balanced',provinces:[],majors:'',avoid:'',allowPrivate:true,allowCooperation:false,allowUnknownCost:true,rank:'50000',budget:''};
test('用真实数据生成96项，项目不重复、每校上限有效、三年依据完整',()=>{
 const projects=makePreviewProjects(db,data,p.first),r=generatePlan({projects,profile:p,settings,histIndex:index});
 assert.deepEqual(r.errors,[]);assert.equal(r.rows.length,96);assert.equal(new Set(r.rows.map(x=>x.school+'|'+x.major)).size,96);assert.ok(r.stats.schoolConcentration<=4);
 assert.ok(r.rows.every(x=>x.history.length===3&&x.history.every(h=>h.year>=2024&&h.year<=2026&&h.rankLow&&h.rankHigh)));assert.ok(r.rows.every(x=>x.pending.length>0));
 assert.equal(r.rows.filter(x=>x.risk.band==='margin').length>=24,true);
});
test('河北历史组合也能生成，且改变关键词与省份确实收窄范围',()=>{
 const pp={...p,first:'历史',electives:['思想政治','地理'],rank:'12000'};
 const rr=generatePlan({projects:makePreviewProjects(db,data,'历史'),profile:pp,settings:{...settings,rank:'12000',majors:'法学，汉语言文学',provinces:['河北省'],schoolCap:8},histIndex:index});
 assert.deepEqual(rr.errors,[]);assert.ok(rr.rows.length>0);assert.ok(rr.rows.every(x=>x.schoolProvince==='河北省'&&(/法学|汉语言文学/.test(x.major))&&x.category==='历史'));
 assert.ok(rr.rows.length<96);assert.ok(rr.gaps.some(x=>x.includes('未自动放宽')));
});
test('未来选科表不能进入正式方案；来源与本人资格未核时生成空缺',()=>{
 const r=generatePlan({projects:makePreviewProjects(db,data,p.first),profile:p,settings:{...settings,mode:'formal'},histIndex:index});assert.equal(r.rows.length,0);
 const csv='年份,科类,学校,专业,计划来源\n2027,物理,测试大学,测试专业,https://example.org/plan';const rows=importPrograms(csv);assert.equal(rows[0].reviewed,false);assert.ok(validateReview(rows[0],'测试复核人','已核对当年正式计划来源及所有条件').length>0);
 assert.throws(()=>importPrograms('年份,科类,学校,专业,计划来源\n2027,物理,测试大学,测试专业,javascript:alert(1)'));
});
test('严格隔离目标年；回测不使用目标年结果形成历史区间',()=>{
 const fake=[];for(let y=2023;y<=2026;y++)fake.push({year:y,category:'物理',school:'测试大学',major:'测试专业',score:600,rankLow:y===2026?99999:10000,rankHigh:y===2026?100100:11000});
 const ix=buildHistoricalIndex({cutoffs:fake}),h=historyFor(ix,'测试大学','测试专业','物理',2026);assert.deepEqual(h.rows.map(x=>x.year),[2023,2024,2025]);assert.equal(retrospectiveCheck(ix,fake,2026).outside,1);
});
test('数据或底线变化使锁定项目失效时，不静默保留；0元预算不当作无限制',()=>{
 const projects=makePreviewProjects(db,data,'物理'),base=generatePlan({projects,profile:p,settings,histIndex:index});const locked=[base.rows[0].id];
 const rr=generatePlan({projects,profile:p,settings:{...settings,avoid:base.rows[0].school},histIndex:index,locked});assert.ok(rr.errors.length);
 const r=generatePlan({projects,profile:p,settings:{...settings,budget:'0',allowUnknownCost:false},histIndex:index});assert.equal(r.rows.length,0);assert.ok(r.stats.reasonCounts['无法验证学费预算']>0);
 const before={year:2027,province:'河北',category:'物理',batch:'本科批',planType:'普通',schoolCode:'0001',majorCode:'01',campus:'A',seats:10,years:4,tuition:0,requirement:'不提科目要求',language:'不限',healthRule:'按章程',source:'https://example.org/a',charter:'https://example.org/b',reviewRevision:1};assert.notEqual(programFingerprint(before),programFingerprint({...before,tuition:20000}));
});
test('完整年度项目须经过数据复核和本人资格确认两道检查；撤销确认即失效',()=>{
 const fake=[2023,2024,2025].map(year=>({year,category:'物理',school:'测试大学',major:'测试专业',score:600,rankLow:60000,rankHigh:61000}));
 const ix=buildHistoricalIndex({cutoffs:fake}),project={id:'test-1',year:2026,province:'河北',category:'物理',batch:'本科批',planType:'普通',school:'测试大学',major:'测试专业',schoolCode:'0001',majorCode:'01',campus:'主校区',schoolProvince:'河北省',nature:'公办',seats:5,years:4,tuition:5000,requirement:'物理,化学',language:'不限',healthRule:'按招生章程逐项核对',source:'https://example.org/plan',charter:'https://example.org/charter',published:'2026-06-01',planStatus:'正式',reviewed:true,reviewRevision:1};
 assert.deepEqual(validateReview(project,'复核人','已对照正式河北计划及章程所有条件'),[]);
 const s={...settings,mode:'formal',count:1,marginCount:0,budget:'6000'};
 const args={projects:[project],profile:p,settings:s,histIndex:ix,year:2026};
 assert.equal(generatePlan(args).rows.length,0);
 assert.equal(generatePlan({...args,qualified:{'test-1':programFingerprint(project)}}).rows.length,1);
 assert.equal(generatePlan({...args,projects:[{...project,tuition:7000}],qualified:{'test-1':programFingerprint(project)}}).rows.length,0);
 assert.equal(generatePlan({...args,projects:[{...project,reviewed:false}],qualified:{'test-1':programFingerprint(project)}}).rows.length,0);
});
test('真实2026留出年度检验确实有前置样本，不把2026放入输入',()=>{
 const report=retrospectiveCheck(index,data.cutoffs,2026);assert.ok(report.examined>1000);assert.equal(report.examined,report.inside+report.outside);
 for(const r of data.cutoffs.filter(x=>x.year===2026).slice(0,200))assert.ok(historyFor(index,r.school,r.major,r.category,2026).rows.every(h=>h.year<2026));
});
