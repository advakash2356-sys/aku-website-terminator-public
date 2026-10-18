const fs=require('fs'),path=require('path'),os=require('os'),net=require('net'),http=require('http');
const {spawn,execFile}=require('child_process');
const sh=(cmd,args,opts={})=>new Promise(res=>{const p=spawn(cmd,args,{...opts,stdio:['ignore','pipe','pipe']});let o='';
  p.stdout.on('data',d=>o+=d);p.stderr.on('data',d=>o+=d);const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}},opts.timeout||300000);
  p.on('close',c=>{clearTimeout(t);res({code:c,out:o.slice(-4000)})});p.on('error',e=>{clearTimeout(t);res({code:-1,out:String(e)})})});
const freePort=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})});
const waitUp=(port,ms)=>new Promise(res=>{const end=Date.now()+ms;(function t(){
  const q=http.get({host:'127.0.0.1',port,path:'/',timeout:2000},r=>{r.resume();res(true)});
  q.on('error',()=>{if(Date.now()>end)res(false);else setTimeout(t,1000)});q.on('timeout',()=>q.destroy())})()});
const GH=/^https:\/\/github\.com\/([A-Za-z0-9][\w-]{0,38})\/([A-Za-z0-9_][\w.-]{0,99}?)(\.git)?\/?$/;
// minimal environment for untrusted repo processes: no tokens/secrets from the parent process
const cleanEnv=(extra={})=>({PATH:process.env.PATH,HOME:os.tmpdir(),TMPDIR:os.tmpdir(),LANG:'C.UTF-8',npm_config_ignore_scripts:'true',...extra});
function detect(dir){
  const pj=path.join(dir,'package.json');
  if(fs.existsSync(pj)){const j=JSON.parse(fs.readFileSync(pj,'utf8'));const d={...j.dependencies,...j.devDependencies};const s=j.scripts||{};
    let fw='node';
    if(d.next)fw='next';else if(d.nuxt)fw='nuxt';else if(d.astro)fw='astro';else if(d['@sveltejs/kit'])fw='sveltekit';else if(d.vite)fw='vite';else if(d['react-scripts'])fw='cra';
    return{fw,hasPkg:true,scripts:s}}
  if(fs.existsSync(path.join(dir,'index.html')))return{fw:'static',hasPkg:false};
  return{fw:'unknown',hasPkg:false};
}
function startCmd(info,port){
  const env={...cleanEnv(),PORT:String(port),BROWSER:'none',HOST:'127.0.0.1',NEXT_TELEMETRY_DISABLED:'1',CI:'1'};
  switch(info.fw){
    case'next':return{cmd:'npx',args:['next','dev','-p',port,'-H','127.0.0.1'],env};
    case'vite':case'sveltekit':return{cmd:'npx',args:['vite','--port',port,'--host','127.0.0.1','--strictPort'],env};
    case'astro':return{cmd:'npx',args:['astro','dev','--port',port,'--host','127.0.0.1'],env};
    case'nuxt':return{cmd:'npx',args:['nuxt','dev','--port',port,'--host','127.0.0.1'],env};
    case'cra':return{cmd:'npm',args:['start'],env};
    default:return info.scripts&&(info.scripts.dev||info.scripts.start)?{cmd:'npm',args:['run',info.scripts.dev?'dev':'start'],env}:null;}
}
function staticServer(dir,port){
  const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};
  const s=http.createServer((q,r)=>{let p;try{p=decodeURIComponent(q.url.split('?')[0])}catch{r.writeHead(400);return r.end()}
    if(p.includes('\0')){r.writeHead(400);return r.end()}
    let f;try{f=path.join(dir,p);if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');f=fs.realpathSync(f)}catch{r.writeHead(404);return r.end('not found')}
    const root=fs.realpathSync(dir);if(f!==root&&!f.startsWith(root+path.sep)){r.writeHead(403);return r.end()}
    r.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)});
  return new Promise(res=>s.listen(port,'127.0.0.1',()=>res(s)));
}
// log(msg) callback; returns {url, codeFindings, codeMd, warnings, cleanup}
async function prepareRepo(repoUrl,log,{devTimeoutMs=120000}={}){
  if(require('./config').PUBLIC)throw new Error('Repo clone/run mode is disabled in public mode');
  const m=GH.exec(repoUrl.trim());if(!m)throw new Error('Not a github.com/owner/repo URL');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'aku-'));const dir=path.join(tmp,'repo');
  const state={tmp,dir,warnings:[],proc:null,srv:null};
  state.cleanup=async()=>{try{if(state.proc)process.kill(-state.proc.pid,'SIGKILL')}catch{};try{state.srv&&state.srv.close()}catch{};fs.rmSync(tmp,{recursive:true,force:true});log('Cleaned up temp files')};
  try{
    log('Shallow cloning '+repoUrl);
    const c=await sh('git',['clone','--depth','1','--no-tags','--config','core.symlinks=false','--config','core.hooksPath=/dev/null','--',`https://github.com/${m[1]}/${m[2]}.git`,dir],{timeout:120000,env:cleanEnv({GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'})});
    if(c.code!==0)throw new Error('git clone failed: '+c.out);
    const cs=require('./codescan');const f=cs.scan(dir);state.codeFindings=f;state.codeMd=cs.md(f,repoUrl);
    log(`Code scan: ${f.length} finding(s)`);
    const info=detect(dir);state.info=info;log('Detected framework: '+info.fw);
    const port=await freePort();
    if(info.fw==='static'){state.srv=await staticServer(dir,port);state.url=`http://127.0.0.1:${port}`;log('Serving static site on '+state.url);return state}
    if(info.fw==='unknown'){state.warnings.push('No package.json or index.html: only code scan done');return state}
    log('npm ci --ignore-scripts');
    let i=fs.existsSync(path.join(dir,'package-lock.json'))?await sh('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:dir,timeout:300000}):{code:1,out:'no lockfile'};
    if(i.code!==0){state.warnings.push('npm ci failed ('+i.out.slice(-200).trim()+'); fell back to npm install --ignore-scripts');log('WARN: fallback npm install --ignore-scripts');
      i=await sh('npm',['install','--ignore-scripts','--no-audit','--no-fund','--legacy-peer-deps'],{cwd:dir,timeout:300000});
      if(i.code!==0){state.warnings.push('npm install failed: '+i.out.slice(-300));return state}}
    const sc=startCmd(info,port);if(!sc){state.warnings.push('No dev/start script found');return state}
    log(`Starting dev server on port ${port}: ${sc.cmd} ${sc.args.join(' ')}`);
    state.proc=spawn(sc.cmd,sc.args,{cwd:dir,env:sc.env,detached:true,stdio:['ignore','pipe','pipe']});
    let dl='';state.proc.stdout.on('data',d=>dl+=d);state.proc.stderr.on('data',d=>dl+=d);
    const up=await waitUp(port,devTimeoutMs);
    if(!up){state.warnings.push('Dev server did not come up within timeout. Log tail: '+dl.slice(-400));return state}
    state.url=`http://127.0.0.1:${port}`;log('Dev server up at '+state.url);return state;
  }catch(e){await state.cleanup();throw e}
}
module.exports={prepareRepo,GH};
