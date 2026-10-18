#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const {BANNER,ROOT,today,slug}=require('../lib/util');
const args=process.argv.slice(2);
const opt=n=>{const i=args.indexOf(n);if(i<0)return null;const v=args[i+1];args.splice(i,2);return v};
const out=path.resolve(opt('--out')||path.join(ROOT,'out'));
const code=opt('--code');
const target=args[0];
console.log(BANNER);
if(!target&&!code){console.log('\nUsage: node bin/audit.js <url|urls.txt> [--out dir] [--code <dir>]');process.exit(2)}
(async()=>{
  let exit=0;const summary=[];fs.mkdirSync(out,{recursive:true});
  if(code){const cs=require('../lib/codescan');const f=cs.scan(path.resolve(code));
    const d=path.join(out,`${today()}_code-${slug(path.basename(path.resolve(code)))}`);fs.mkdirSync(d,{recursive:true});
    fs.writeFileSync(path.join(d,'code-scan.json'),JSON.stringify(f,null,2));fs.writeFileSync(path.join(d,'code-scan.md'),cs.md(f,code));
    console.log(`Code scan: ${f.length} finding(s) → ${d}`);if(f.length)exit=1;summary.push({code:code,findings:f.length,dir:d})}
  if(target){
    const {auditUrl}=require('../lib/audit');const mem=require('../lib/memory');const {build}=require('../lib/prompt');
    const urls=fs.existsSync(target)?fs.readFileSync(target,'utf8').split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')):[target];
    for(const u of urls){console.log('Auditing',u,'...');
      const r=await auditUrl(u,out);
      const notes=(mem.runs().siteNotes[r.url]||{}).learned;
      fs.writeFileSync(path.join(r.dir,'IMPROVE_PROMPT.md'),build({url:r.url,findings:r.findings,siteNotes:notes}));
      mem.addRun({date:r.date,target:r.url,dir:r.dir,counts:r.counts,source:'cli'});
      console.log(`  ${r.counts.critical} critical, ${r.counts.high} high, ${r.counts.medium} medium, ${r.counts.low} low → ${r.dir}`);
      summary.push({url:r.url,counts:r.counts,dir:r.dir})}
  }
  fs.writeFileSync(path.join(out,`summary-${today()}.json`),JSON.stringify(summary,null,2));
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
  process.exit(exit);
})().catch(e=>{console.error(e);process.exit(2)});
