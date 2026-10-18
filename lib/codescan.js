const fs=require('fs'),path=require('path');
const SKIP=new Set(['node_modules','.git','.next','dist','build','out','coverage','.vercel','.turbo']);
const EXT=/\.(js|jsx|ts|tsx|mjs|cjs|html|htm|vue|svelte|php|py|rb|java|go)$/i;
const LINE_RULES=[
 {id:'xss-innerHTML',sev:'high',re:/\.(innerHTML|outerHTML)\s*(\+?=)(?!=)|insertAdjacentHTML\s*\(|document\.write\s*\(/,msg:'innerHTML/outerHTML/document.write — use textContent or sanitize (SECURITY_PROMPT #3)'},
 {id:'xss-dangerouslySetInnerHTML',sev:'high',re:/dangerouslySetInnerHTML|v-html\s*=|\{@html\s/,msg:'Raw HTML rendering — never with user data; sanitize (DOMPurify) and add CSP'},
 {id:'secret-hardcoded',sev:'critical',re:/(sk_live_[0-9a-zA-Z]{10,}|whsec_[0-9a-zA-Z]{10,}|AKIA[0-9A-Z]{16}|ghp_[0-9A-Za-z]{30,}|AIza[0-9A-Za-z_\-]{30,}|-----BEGIN (RSA |EC )?PRIVATE KEY-----)/,msg:'Hardcoded secret/token — rotate it and move to ENV'},
 {id:'secret-assign',sev:'high',re:/(api[_-]?key|secret|passwd|password|token|webhook[_-]?secret)\s*[:=]\s*['"][A-Za-z0-9_\-\/+=]{16,}['"]/i,msg:'Possible hardcoded credential — use process.env'},
 {id:'cookie-flags',sev:'medium',re:/document\.cookie\s*=/,msg:'Client-set cookie — cannot be httpOnly; set cookies server-side with httpOnly/Secure/SameSite'},
 {id:'cmd-injection',sev:'high',re:/\b(exec|execSync)\s*\(\s*(`[^`]*\$\{|[^)]*\+\s*\w)/,msg:'Shell command built from variables — use execFile/spawn with an argument array and validate input'},
 {id:'eval',sev:'high',re:/\beval\s*\(|new Function\s*\(/,msg:'eval/new Function — remove'},
];
function* walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(SKIP.has(e.name))continue;const p=path.join(d,e.name);
  if(e.isDirectory())yield*walk(p);else if(EXT.test(e.name)&&fs.statSync(p).size<1e6)yield p}}
function scan(dir){
  const f=[];
  // .akuignore: one path prefix per line (# comments); inline `aku-ignore` on a line suppresses line rules for it
  let ign=[];try{ign=fs.readFileSync(path.join(dir,'.akuignore'),'utf8').split('\n').map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'))}catch{}
  for(const p of walk(dir)){
    const rel=path.relative(dir,p);if(ign.some(x=>rel===x||rel.startsWith(x.endsWith('/')?x:x+'/')))continue;
    let src;try{if(fs.statSync(p).size>1500000)continue;src=fs.readFileSync(p,'utf8')}catch{continue}const lines=src.split('\n');
    lines.forEach((l,i)=>{ if(l.length>2000||l.includes('aku-ignore'))return; for(const r of LINE_RULES) if(r.re.test(l)) f.push({rule:r.id,severity:r.sev,file:rel,line:i+1,message:r.msg,snippet:l.trim().slice(0,160)})});
    const wh=/webhook/i.test(rel)||/(stripe|webhook)/i.test(src)&&/(req|request)\.(body|json|text)|event\.type|checkout\.session|payment_intent/i.test(src)&&/webhook/i.test(src);
    if(wh&&/stripe|payment_intent|checkout\.session|paid|webhook/i.test(src)&&!/constructEvent|constructEventAsync|verifyHeader|svix|verify[_-]?signature|crypto\.timingSafeEqual/i.test(src)){
      const i=lines.findIndex(l=>/webhook|payment_intent|checkout\.session|paid/i.test(l));
      f.push({rule:'webhook-no-signature',severity:'critical',file:rel,line:i+1,message:'Payment webhook handler with no signature verification (stripe.webhooks.constructEvent). Attackers can fake PAID events',snippet:(lines[i]||'').trim().slice(0,160)})}
    const up=/(multer|formidable|busboy|multiparty|req\.files|request\.files|FormData|upload(ed)?File|\$_FILES|file\.(mv|mimetype)|input[^>]*type=["']?file)/i.test(src)&&(/(multer|formidable|busboy|req\.files|\$_FILES|request\.files|\.mv\()/i.test(src));
    if(up&&!/(magic|file-type|fileTypeFromBuffer|mimetype|fileFilter|allowedTypes|allowedExt|ALLOWED_)/i.test(src)){
      const i=lines.findIndex(l=>/(multer|formidable|busboy|req\.files|\$_FILES|request\.files|\.mv\()/i.test(l));
      f.push({rule:'upload-no-checks',severity:'high',file:rel,line:i+1,message:'File upload handler without visible type whitelist / MIME / magic-byte checks',snippet:(lines[i]||'').trim().slice(0,160)})}
    if(up&&!/(limits|fileSize|maxFileSize|MAX_FILE|maxSize)/i.test(src)){
      const i=lines.findIndex(l=>/(multer|formidable|busboy|req\.files|\$_FILES|request\.files|\.mv\()/i.test(l));
      f.push({rule:'upload-no-size-limit',severity:'medium',file:rel,line:i+1,message:'File upload without size limit (use 5MB max)',snippet:(lines[i]||'').trim().slice(0,160)})}
  }
  return f;
}
function md(findings,dir){
  const by={critical:[],high:[],medium:[],low:[]};findings.forEach(x=>(by[x.severity]=by[x.severity]||[]).push(x));
  let o=`# Code scan — ${dir}\n\nFindings: **${findings.length}** (pattern scan: may miss issues or give false alarms; review each).\n\n`;
  if(!findings.length)o+='No findings.\n';
  for(const s of ['critical','high','medium','low'])if(by[s].length){o+=`## ${s.toUpperCase()} (${by[s].length})\n`;
    by[s].forEach(x=>o+=`- \`${x.file}:${x.line}\` [${x.rule}] ${x.message}\n  \`${x.snippet.replace(/`/g,"'")}\`\n`);o+='\n'}
  return o;
}
module.exports={scan,md};
