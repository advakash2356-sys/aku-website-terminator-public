const fs=require('fs'),path=require('path');
const {ROOT}=require('./util');const cfg=require('./config');
const DIR=path.join(ROOT,'memory');
const PRIVATE=path.join(DIR,'MEMORY.private.md'),TEMPLATE=path.join(DIR,'MEMORY.template.md'),RUNS=path.join(DIR,'runs.json');
const rd=f=>fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';
// Public mode always uses the generic template; local mode prefers the private file.
const load=()=>(!cfg.PUBLIC&&fs.existsSync(PRIVATE))?rd(PRIVATE):rd(TEMPLATE);
const source=()=>(!cfg.PUBLIC&&fs.existsSync(PRIVATE))?'private':'template';
function append(text){
  if(cfg.PUBLIC)throw new Error('Memory is read-only in public mode');
  if(!fs.existsSync(PRIVATE))fs.writeFileSync(PRIVATE,rd(TEMPLATE),{mode:0o600});
  const d=new Date().toISOString().slice(0,10);
  fs.appendFileSync(PRIVATE,`\n- [${d}] ${String(text).trim().replace(/\n+/g,'\n  ')}\n`);}
const empty=()=>({runs:[],siteNotes:{}});
function runs(){if(cfg.PUBLIC)return empty();try{return JSON.parse(fs.readFileSync(RUNS,'utf8'))}catch{return empty()}}
function saveRuns(r){if(cfg.PUBLIC)return;fs.writeFileSync(RUNS,JSON.stringify(r,null,2),{mode:0o600})}
function addRun(run){if(cfg.PUBLIC)return;const r=runs();r.runs.unshift(run);r.runs=r.runs.slice(0,200);
  const k=run.target;r.siteNotes[k]=r.siteNotes[k]||{};
  r.siteNotes[k].lastAudit=run.date;r.siteNotes[k].lastCounts=run.counts;
  r.siteNotes[k].learned=(r.siteNotes[k].learned||[]);
  (run.learned||[]).forEach(n=>{if(!r.siteNotes[k].learned.includes(n))r.siteNotes[k].learned.push(n)});
  saveRuns(r);}
function addSiteNote(target,note){if(cfg.PUBLIC)throw new Error('read-only in public mode');const r=runs();r.siteNotes[target]=r.siteNotes[target]||{learned:[]};
  r.siteNotes[target].learned=r.siteNotes[target].learned||[];r.siteNotes[target].learned.push(note);saveRuns(r)}
module.exports={load,source,append,runs,addRun,addSiteNote,PRIVATE,TEMPLATE,RUNS};
