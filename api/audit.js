// Vercel serverless function: POST /api/audit {target, prefs} -> runs the audit synchronously and returns the report.
// All public-mode protections apply: SSRF guard (URL check + DNS-pinned guard proxy for every browser request),
// public HTTPS only, body/prefs size limits, same-origin check, best-effort rate limiting, hard timeout.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
process.env.AKU_PUBLIC='1';
const cfg=require('../lib/config');
const {assertPublicUrl}=require('../lib/netguard');
const {auditUrl}=require('../lib/audit');
const {build,cleanPrefs}=require('../lib/prompt');
const launchOpts=require('../lib/vercel-launch');

// NOTE: in-memory limits are per warm function instance only (serverless instances don't share memory), so this is
// best-effort abuse damping, not a guarantee. For a hard limit use Vercel Firewall rate limiting / Vercel KV (see README).
const hits=new Map();let busy=0;
const MAX_INSTANCE_CONCURRENCY=1,DEADLINE_MS=+process.env.AKU_JOB_TIMEOUT_MS||48000;
const clientIp=req=>String(req.headers['x-vercel-forwarded-for']||req.headers['x-real-ip']||String(req.headers['x-forwarded-for']||'').split(',')[0]||'?').trim();
function limited(key){const n=Date.now(),a=(hits.get(key)||[]).filter(t=>n-t<cfg.RATE_WINDOW_MS);
  if(a.length>=cfg.RATE_AUDITS){hits.set(key,a);return true}a.push(n);hits.set(key,a);if(hits.size>5000)for(const [k,v] of hits)if(!v.some(t=>n-t<cfg.RATE_WINDOW_MS))hits.delete(k);return false}
const sec=res=>{res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer')};
const fail=(res,c,m)=>{sec(res);res.status(c).json({error:m})};

module.exports=async(req,res)=>{
  if(req.method!=='POST')return fail(res,405,'POST only');
  if(!/^application\/json/.test(req.headers['content-type']||''))return fail(res,415,'json only');
  const o=req.headers.origin;if(o){try{if(new URL(o).host.toLowerCase()!==String(req.headers.host).toLowerCase())return fail(res,403,'bad origin')}catch{return fail(res,403,'bad origin')}}
  let b=req.body;if(typeof b==='string'){try{b=JSON.parse(b)}catch{return fail(res,400,'Invalid JSON')}}
  if(!b||typeof b!=='object'||JSON.stringify(b).length>cfg.MAX_BODY)return fail(res,413,'Request too large');
  let t=String(b.target||'').trim();if(!t||t.length>2048)return fail(res,400,'target required (<2048 chars)');
  if(/^https?:\/\/github\.com\//i.test(t))return fail(res,403,'GitHub repo mode is disabled in the hosted version. Audit the live URL, or run Aku locally for repo audits.');
  t=t.replace(/^http:/i,'https:');
  if(!/^https:\/\//i.test(t)){if(/^[a-z][a-z0-9+.-]*:/i.test(t)&&!/^[^/]+:\d+/.test(t))return fail(res,400,'Only http(s) URLs are allowed');t='https://'+t}
  try{await assertPublicUrl(t)}catch(e){return fail(res,400,e.message)}
  if(limited(clientIp(req)))return fail(res,429,`Rate limit: ${cfg.RATE_AUDITS} audits per ${Math.round(cfg.RATE_WINDOW_MS/60000)} min. Try later.`);
  if(busy>=MAX_INSTANCE_CONCURRENCY)return fail(res,503,'Aku is busy with another audit. Try again shortly.');
  busy++;const dir=path.join(os.tmpdir(),'aku-'+crypto.randomBytes(8).toString('hex'));
  try{
    fs.mkdirSync(dir,{recursive:true});
    const r=await auditUrl(t,dir,{timeoutMs:DEADLINE_MS,launchOptions:await launchOpts()});
    const prompt=build({url:r.url,findings:r.findings,prefs:cleanPrefs(b.prefs)});
    const shots=[];let bytes=0;
    for(const f of ['desktop-fold.png','mobile-fold.png']){const p=path.join(r.dir,f);if(fs.existsSync(p)){const buf=fs.readFileSync(p);if(bytes+buf.length<2.2e6){bytes+=buf.length;shots.push({name:f,data:buf.toString('base64')})}}}
    sec(res);res.status(200).json({target:t,kind:'live',counts:r.counts,findings:r.findings,auditMd:fs.readFileSync(path.join(r.dir,'audit.md'),'utf8'),prompt,shots});
  }catch(e){
    const m=String(e&&e.message||'failed');
    fail(res,500,/timed out/i.test(m)?'Audit timed out (hosted limit ~50 s). Try a lighter page, or run Aku locally.':'Audit failed: '+m.split('\n')[0].slice(0,160));
  }finally{busy--;fs.rmSync(dir,{recursive:true,force:true})}
};
