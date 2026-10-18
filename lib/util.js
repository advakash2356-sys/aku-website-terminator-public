const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const today=()=>new Date().toISOString().slice(0,10);
const slug=u=>u.replace(/^https?:\/\//,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase().slice(0,60)||'site';
const BANNER=`
  ╔══════════════════════════════════════════════╗
  ║  AKU, THE WEBSITE TERMINATOR                 ║
  ║  malware · loopholes · vulnerabilities · ugly ║
  ║  → terminate, then redesign & fine-tune       ║
  ╚══════════════════════════════════════════════╝`;
const read=f=>fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';
module.exports={ROOT,today,slug,BANNER,read};
