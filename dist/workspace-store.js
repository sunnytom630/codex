import {compactPlanResult} from './planning-helpers.js';
const NAME='hebei-compass-workspace-v2';
let database;
export function initialState(){return {schema:2,revision:0,programs:[],qualified:{},versions:[],selectedVersion:'',audit:[],settings:{mode:'preview',year:2027,rank:'',scoreYear:2026,scoreInput:'',rankBasis:null,budget:'',count:96,schoolCap:4,marginCount:24,strategy:'balanced',majors:'',avoid:'',provinces:[],allowPrivate:true,allowCooperation:false,allowUnknownCost:true,allowUnknownTasks:false},notes:'',revisionDate:''};}
async function open(){if(database)return database;database=await new Promise((resolve,reject)=>{const r=indexedDB.open(NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore('workspace');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return database;}
export async function loadWorkspace(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readonly'),r=tx.objectStore('workspace').get('current');r.onsuccess=()=>{const state=r.result||initialState();state.versions=(state.versions||[]).map(v=>({...v,result:compactPlanResult(v.result)}));resolve(state);};r.onerror=()=>reject(r.error);});}
let queue=Promise.resolve();
export function saveWorkspace(state){const snapshot=structuredClone(state);queue=queue.catch(()=>{}).then(async()=>{const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put(snapshot,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});});return queue;}
export function audit(state,event,detail){state.audit.unshift({at:new Date().toISOString(),event,detail});state.audit=state.audit.slice(0,150);}
