import {majors, tasks} from './majors.js';

// Excluded candidates are diagnostic working data, not part of saved plans.
// Reason counts already explain exclusions without duplicating the whole library.
export function compactPlanResult(result) {
 const {excluded,...snapshot}=result;
 return snapshot;
}

// Only match complete sample names; similar names and major groups need review.
export function explorationConstraint(major, profile) {
 const sample=majors.find(m=>m.name===String(major).trim());
 const veto=profile.veto||[];
 if(!sample)return {excluded:[],pending:veto.length?['专业任务尚未映射，须核对是否触及你的学习底线']:[]};
 return {excluded:sample.core.filter(task=>veto.includes(task)).map(task=>`专业探索底线冲突：${tasks[task]}`),pending:[]};
}

export function scoreToHistoricalRank(data, year, category, score) {
 if(!['物理','历史'].includes(category))throw Error('请先设置首选科目，再换算历史参考位次。');
 if(![2023,2024,2025,2026].includes(Number(year)))throw Error('请选择已接入的历史年份。');
 if(score===''||score==null||!Number.isInteger(Number(score))||Number(score)<0||Number(score)>750)throw Error('请输入0—750之间的整数分数。');
 const row=data.scoreTables[`${year}-${category}`]?.[String(Number(score))];
 if(!row||row.topBucket||!Number.isInteger(row.low)||!Number.isInteger(row.high)||row.low<1||row.high<row.low||row.high-row.low+1!==row.count)throw Error('该分数没有可用的已校验精确分数档，请改用其他分数或手动填写参考位次；不会插值补齐。');
 return {year:Number(year),category,score:Number(score),low:row.low,high:row.high,rank:row.high};
}

export function selectionFingerprint(profile, settings) {
 return JSON.stringify({first:profile.first,electives:[...(profile.electives||[])].sort(),veto:[...(profile.veto||[])].sort(),maxYears:profile.maxYears,
  rank:Number(settings.rank||profile.rank),budget:settings.budget!==''&&settings.budget!==undefined?settings.budget:profile.budget,
  mode:settings.mode,year:settings.year,count:Number(settings.count??96),schoolCap:Number(settings.schoolCap??4),marginCount:Number(settings.marginCount??24),
  majors:settings.majors||'',avoid:settings.avoid||'',provinces:[...(settings.provinces||[])].sort(),strategy:settings.strategy,
  allowPrivate:!!settings.allowPrivate,allowCooperation:!!settings.allowCooperation,allowUnknownCost:!!settings.allowUnknownCost,allowUnknownTasks:!!settings.allowUnknownTasks});
}
