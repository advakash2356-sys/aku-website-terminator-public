const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const cfg=require('../lib/config');
const {ROOT,today,slug,BANNER,read}=require('../lib/util');
const mem=require('../lib/memory'),{build}=require('../lib/prompt');
const OUT=path.join(ROOT,'out'),{PUBLIC}=cfg;
const jobs=new Map();let active=0;
const hits=new Map(),audits=new Map();           // rate-limit buckets by client IP
const PUB=path.join(ROOT,'public');
const ASSETS={'/app.js':['app.js','text/javascript'],'/app.css':['app.css','text/css']};
const CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";

function hdrs(q,type,extra={}){
  const h={'content-type':type,'x-content-type-options':'nosniff','content-security-policy':CSP,'x-frame-options':'DENY','referrer-policy':'no-referrer',
    'cross-origin-opener-policy':'same-origin','cross-origin-resource-policy':'same-origin','permissions-policy':'camera=(),microphone=(),geolocation=(),payment=(),usb=()','cache-control':'no-store',...extra};
  if(PUBLIC&&(q.headers['x-forwarded-proto']==='https'||q.socket.encrypted))h['strict-transport-security']='max-age=31536000; includeSubDomains';
  return h;
}
const send=(q,r,c,b,t='application/json')=>{r.writeHead(c,hdrs(q,t+'; charset=utf-8'));r.end(typeof b==='string'?b:JSON.stringify(b))};
const ip=q=>{if(cfg.TRUST_PROXY){const x=String(q.headers['x-forwarded-for']||'').split(',').map(s=>s.trim()).filter(Boolean);if(x.length)return x[x.length-1]}return q.socket.remoteAddress||'?'};
function limited(map,key,max,win){const n=Date.now();const a=(map.get(key)||[]).filter(t=>n-t<win);if(a.length>=max){map.set(key,a);return true}a.push(n);map.set(key,a);return false}
const body=q=>new Promise((res,rej)=>{let d='',n=0;q.on('data',c=>{n+=c.length;if(n>cfg.MAX_BODY){rej(Object.assign(new Error('Request too large'),{code:413}));q.destroy();return}d+=c});
  q.on('end',()=>{try{res(JSON.parse(d||'{}'))}catch{rej(Object.assign(new Error('Invalid JSON'),{code:400}))}});q.on('error',()=>rej(Object.assign(new Error('read error'),{code:400})))});
const safeDir=d=>{if(PUBLIC||typeof d!=='string'||d.includes('\0'))return null;const p=path.resolve(OUT,d);return p.startsWith(OUT+path.sep)&&fs.existsSync(p)&&fs.statSync(p).isDirectory()?p:null};
const pngs=d=>fs.readdirSync(d).filter(f=>f.endsWith('.png'));
const hostOk=h=>{h=(h||'').toLowerCase();if(!PUBLIC)return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h);return cfg.ALLOWED_HOSTS.length?cfg.ALLOWED_HOSTS.includes(h.split(':')[0]):true};
const originOk=(o,h)=>{if(!o)return true;try{const u=new URL(o);return PUBLIC?u.host.toLowerCase()===String(h).toLowerCase():/^(127\.0\.0\.1|localhost)$/.test(u.hostname)}catch{return false}};

function cleanup(){ // output + job auto-cleanup (public mode)
  if(!cfg.OUT_TTL_MS)return;const now=Date.now();
  for(const [id,j] of jobs)if(now-j.created>cfg.OUT_TTL_MS)jobs.delete(id);
  try{for(const d of fs.readdirSync(OUT)){if(d==='.gitkeep')continue;const p=path.join(OUT,d);if(now-fs.statSync(p).mtimeMs>cfg.OUT_TTL_MS)fs.rmSync(p,{recursive:true,force:true})}}catch{}
  for(const m of [hits,audits])for(const [k,a] of m)if(!a.some(t=>now-t<cfg.RATE_WINDOW_MS))m.delete(k);
}
if(cfg.OUT_TTL_MS){fs.mkdirSync(OUT,{recursive:true});cleanup();setInterval(cleanup,60000).unref()}

async function runJob(id,target,kind,prefs){
  const j=jobs.get(id);const log=m=>{if(j.log.length<200)j.log.push(new Date().toTimeString().slice(0,8)+' '+m)};
  let repo=null;
  try{
    const {auditUrl}=require('../lib/audit');
    let url=target,codeMd='',codeCount=null,warnings=[];
    const outRoot=PUBLIC?path.join(OUT,id):OUT;
    if(kind==='repo'){
      const {prepareRepo}=require('../lib/repo');repo=await prepareRepo(target,log);
      codeMd=repo.codeMd;codeCount=repo.codeFindings.length;warnings=repo.warnings;url=repo.url;
      if(!url){j.result={target,kind,warnings,codeCount,codeMd,note:'Site could not be run locally; code scan only.'};
        const d=path.join(OUT,`${today()}_code-${slug(target)}`);fs.mkdirSync(d,{recursive:true});
        fs.writeFileSync(path.join(d,'code-scan.md'),codeMd);fs.writeFileSync(path.join(d,'code-scan.json'),JSON.stringify(repo.codeFindings,null,2));
        const prompt=build({url:target,findings:[],codeScanMd:codeMd,prefs});fs.writeFileSync(path.join(d,'IMPROVE_PROMPT.md'),prompt);
        mem.addRun({date:today(),target,dir:path.relative(OUT,d),counts:{critical:0,high:0,medium:0,low:0},codeFindings:codeCount,source:'ui-repo',warnings});
        j.result.dir=path.relative(OUT,d);j.result.prompt=prompt;j.status='done';return}
    }
    log('Auditing '+url+' (desktop + mobile, axe, focus, screenshots)…');
    const r=await auditUrl(url,outRoot,{name:kind==='repo'?slug(target):undefined});
    const notes=(mem.runs().siteNotes[target]||{}).learned;
    const prompt=build({url:kind==='repo'?`${target} (served locally at ${url})`:r.url,findings:r.findings,codeScanMd:codeMd,siteNotes:notes,prefs});
    fs.writeFileSync(path.join(r.dir,'IMPROVE_PROMPT.md'),prompt);
    if(codeMd){fs.writeFileSync(path.join(r.dir,'code-scan.md'),codeMd);fs.writeFileSync(path.join(r.dir,'code-scan.json'),JSON.stringify(repo.codeFindings,null,2))}
    const rel=path.relative(OUT,r.dir);
    mem.addRun({date:r.date,target,dir:rel,counts:r.counts,codeFindings:codeCount,source:'ui-'+kind,warnings,learned:[]});
    j.result={target,kind,dir:rel,counts:r.counts,codeCount,warnings,findings:r.findings,auditMd:read(path.join(r.dir,'audit.md')),codeMd,prompt,shots:pngs(r.dir)};
    j.status='done';log('Done');
  }catch(e){j.status='error';j.error=PUBLIC?String(e.message||'failed').slice(0,200):e.message;log('ERROR '+j.error)}
  finally{if(repo)await repo.cleanup().catch(()=>{});active--}
}
const srv=http.createServer(async(q,r)=>{
  try{
    if(!hostOk(q.headers.host))return send(q,r,403,{error:'bad host'});
    if(limited(hits,ip(q),cfg.RATE_REQS,60000))return send(q,r,429,{error:'Too many requests'});
    const u=new URL(q.url,'http://x');const p=u.pathname;
    if(q.method!=='GET'&&q.method!=='POST'&&q.method!=='HEAD')return send(q,r,405,{error:'method not allowed'});
    if(q.method==='POST'){
      if(!originOk(q.headers.origin,q.headers.host))return send(q,r,403,{error:'bad origin'});
      if(!/^application\/json/.test(q.headers['content-type']||''))return send(q,r,415,{error:'json only'});}
    if(p==='/')return send(q,r,200,read(path.join(PUB,'index.html')),'text/html');
    if(ASSETS[p])return send(q,r,200,read(path.join(PUB,ASSETS[p][0])),ASSETS[p][1]);
    if(p==='/api/config')return send(q,r,200,{public:PUBLIC});
    if(p==='/healthz')return send(q,r,200,{ok:true});
    if(p==='/api/audit'&&q.method==='POST'){
      if(+q.headers['content-length']>cfg.MAX_BODY)return send(q,r,413,{error:'Request too large'});
      const b=await body(q);const t=String(b.target||'').trim();if(!t||t.length>2048)return send(q,r,400,{error:'target required (<2048 chars)'});
      const {GH}=require('../lib/repo');const kind=GH.test(t)?'repo':'live';
      if(kind==='repo'&&PUBLIC)return send(q,r,403,{error:'GitHub repo mode is disabled in public mode. Audit the live URL, or run Aku locally for repo audits.'});
      if(kind==='live'&&/^https?:\/\/github\.com\//i.test(t))return send(q,r,400,{error:'Use https://github.com/owner/repo for repos'});
      let tt=t;if(kind==='live'){if(PUBLIC)tt=tt.replace(/^http:/i,'https:');if(!/^https?:\/\//i.test(tt)){if(/^[a-z][a-z0-9+.-]*:/i.test(tt)&&!/^[^/]+:\d+/.test(tt))return send(q,r,400,{error:'Only http(s) URLs are allowed'});tt='https://'+tt}
        try{new URL(tt)}catch{return send(q,r,400,{error:'invalid URL'})}
        if(PUBLIC){try{await require('../lib/netguard').assertPublicUrl(tt)}catch(e){return send(q,r,400,{error:e.message})}}}
      if(PUBLIC&&limited(audits,ip(q),cfg.RATE_AUDITS,cfg.RATE_WINDOW_MS))return send(q,r,429,{error:`Rate limit: ${cfg.RATE_AUDITS} audits per ${Math.round(cfg.RATE_WINDOW_MS/60000)} min. Try later.`});
      if(active>=cfg.MAX_CONCURRENCY)return send(q,r,503,{error:'Aku is busy with other audits. Try again shortly.'});
      active++;const id=crypto.randomBytes(12).toString('hex');
      jobs.set(id,{status:'running',log:['Queued '+kind+' audit: '+tt],kind,created:Date.now()});runJob(id,tt,kind,PUBLIC?String(b.prefs||'').slice(0,5000):'');return send(q,r,200,{id,kind})}
    if(p==='/api/job'){const id=u.searchParams.get('id');const j=/^[a-f0-9]{24}$/.test(id||'')&&jobs.get(id);return j?send(q,r,200,j):send(q,r,404,{error:'no job'})}
    if(p==='/api/runs')return PUBLIC?send(q,r,404,{error:'disabled'}):send(q,r,200,mem.runs());
    if(p==='/api/run'){const d=safeDir(u.searchParams.get('dir'));if(!d)return send(q,r,404,{error:'not found'});
      return send(q,r,200,{auditMd:read(path.join(d,'audit.md')),codeMd:read(path.join(d,'code-scan.md')),prompt:read(path.join(d,'IMPROVE_PROMPT.md')),shots:pngs(d)})}
    if(p==='/api/memory'&&q.method==='GET')return send(q,r,200,{memory:mem.load(),source:mem.source(),readOnly:PUBLIC});
    if(p==='/api/memory'&&q.method==='POST'){if(PUBLIC)return send(q,r,403,{error:'Memory is read-only in public mode'});
      const b=await body(q);const t=String(b.text||'').trim();if(!t||t.length>5000)return send(q,r,400,{error:'text required (<5000 chars)'});mem.append(t);return send(q,r,200,{memory:mem.load(),source:mem.source()})}
    if(p==='/api/note'&&q.method==='POST'){if(PUBLIC)return send(q,r,403,{error:'read-only in public mode'});
      const b=await body(q);if(!b.target||!b.note)return send(q,r,400,{error:'target+note'});mem.addSiteNote(String(b.target).slice(0,300),String(b.note).slice(0,1000));return send(q,r,200,{ok:true})}
    if(p.startsWith('/shots/')){let rel;try{rel=decodeURIComponent(p.slice(7))}catch{return send(q,r,400,{error:'bad path'})}
      if(rel.includes('\0'))return send(q,r,400,{error:'bad path'});
      let f=path.resolve(OUT,rel);if(!f.startsWith(OUT+path.sep)||!f.endsWith('.png')||!fs.existsSync(f))return send(q,r,404,{error:'nf'});
      f=fs.realpathSync(f);if(!f.startsWith(fs.realpathSync(OUT)+path.sep))return send(q,r,404,{error:'nf'});
      r.writeHead(200,hdrs(q,'image/png'));return fs.createReadStream(f).pipe(r)}
    send(q,r,404,{error:'not found'});
  }catch(e){if(e.code===413||e.code===400)return send(q,r,e.code,{error:e.message});send(q,r,500,{error:PUBLIC?'internal error':e.message})}
});
srv.requestTimeout=30000;srv.headersTimeout=10000;srv.keepAliveTimeout=5000;srv.maxHeadersCount=50;srv.maxRequestsPerSocket=100;
srv.on('clientError',(e,s)=>{try{s.end('HTTP/1.1 400 Bad Request\r\n\r\n')}catch{}});
srv.listen(cfg.PORT,cfg.HOST,()=>{console.log(BANNER);console.log(`\n  Aku UI → http://${cfg.HOST}:${cfg.PORT}  (${PUBLIC?'PUBLIC hardened mode':'local mode, localhost only'})\n`)});
