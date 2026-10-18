let CFG={};
const $=s=>document.querySelector(s),el=(t,p={},...k)=>{const e=document.createElement(t);Object.assign(e,p);k.forEach(x=>e.append(x));return e};
const api=(u,b)=>fetch(u,b?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}:{}).then(r=>r.json());
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button').forEach(x=>x.setAttribute('aria-selected',x===b));document.querySelectorAll('section').forEach(s=>s.classList.toggle('on',s.id===b.dataset.t));if(b.dataset.t==='history')loadHist();if(b.dataset.t==='memory')loadMem();if(b.dataset.t==='prefs')loadPrefs()});
function copyBtn(getText){const b=el('button',{className:'s',textContent:'Copy prompt'});b.onclick=async()=>{await navigator.clipboard.writeText(await getText());b.textContent='Copied ✓';setTimeout(()=>b.textContent='Copy prompt',1500)};return b}
function render(host,d){host.replaceChildren();
 const c=d.counts;if(c)host.append(el('div',{className:'card'},el('span',{className:'badge crit',textContent:'critical '+c.critical}),el('span',{className:'badge',textContent:'high '+c.high}),el('span',{className:'badge',textContent:'medium '+c.medium}),el('span',{className:'badge',textContent:'low '+c.low}),d.codeCount!=null?el('span',{className:'badge',textContent:'code-scan '+d.codeCount}):''));
 (d.warnings||[]).forEach(w=>host.append(el('div',{className:'card',textContent:'⚠ '+w})));if(d.note)host.append(el('div',{className:'card',textContent:d.note}));
 host.append(el('div',{className:'card'},el('h2',{textContent:'Ready-to-copy improvement prompt'}),el('p',{className:'mut',textContent:'MASTER + SECURITY + MOTION + MEMORY + this site\'s findings'}),copyBtn(async()=>d.prompt),el('pre',{textContent:(d.prompt||'').slice(0,3000)+((d.prompt||'').length>3000?'\n… (copy for full text)':'')})));
 if(d.shots&&d.shots.length)host.append(el('div',{className:'card'},el('h2',{textContent:'Screenshots'}),el('div',{className:'shots'},...d.shots.map(s=>typeof s==='object'?el('div',{},el('img',{className:'shot',src:'data:image/png;base64,'+s.data,alt:s.name}),el('div',{className:'mut',textContent:s.name})):el('a',{href:'/shots/'+encodeURI(d.dir+'/'+s),target:'_blank'},el('img',{className:'shot',src:'/shots/'+encodeURI(d.dir+'/'+s),alt:s,loading:'lazy'}),el('div',{className:'mut',textContent:s}))))));
 if(d.auditMd)host.append(el('div',{className:'card'},el('h2',{textContent:'audit.md'}),el('pre',{textContent:d.auditMd})));
 if(d.codeMd)host.append(el('div',{className:'card'},el('h2',{textContent:'code-scan.md'}),el('pre',{textContent:d.codeMd})));}
$('#go').onclick=async()=>{const t=$('#target').value.trim();if(!t)return;$('#go').disabled=true;$('#result').replaceChildren();$('#status').hidden=false;$('#st').textContent='Running… (desktop + mobile audit, can take up to a minute)';$('#log').textContent='';
 const r=await api('/api/audit',{target:t,prefs:CFG.public?getPrefs():''});if(r.error){$('#st').textContent='⚠ '+r.error;$('#go').disabled=false;return}
 if(r.prompt){$('#go').disabled=false;$('#st').textContent='Done ✓';render($('#result'),r);return}
 const iv=setInterval(async()=>{const j=await api('/api/job?id='+r.id);if(j.error&&!j.log){clearInterval(iv);$('#go').disabled=false;$('#st').textContent='Error: '+j.error;return}$('#log').textContent=j.log.join('\n');
  if(j.status!=='running'){clearInterval(iv);$('#go').disabled=false;$('#st').textContent=j.status==='done'?'Done ✓':'Error: '+j.error;if(j.result)render($('#result'),j.result)}},1500)};
$('#target').addEventListener('keydown',e=>{if(e.key==='Enter')$('#go').click()});
async function loadHist(){const d=await api('/api/runs');const h=$('#hist');h.replaceChildren();
 if(!d.runs.length){h.textContent='No runs yet.';return}
 const t=el('table',{},el('tr',{},...['Date','Target','crit/high/med/low','Source',''].map(x=>el('th',{textContent:x}))));
 d.runs.forEach(r=>{const c=r.counts||{};const b=el('button',{className:'s',textContent:'View'});b.onclick=async()=>{const x=await api('/api/run?dir='+encodeURIComponent(r.dir));x.dir=r.dir;x.counts=r.counts;render($('#hres'),x);$('#hres').scrollIntoView()};
  const cp=copyBtn(async()=>(await api('/api/run?dir='+encodeURIComponent(r.dir))).prompt);
  t.append(el('tr',{},el('td',{textContent:r.date}),el('td',{textContent:r.target}),el('td',{textContent:[c.critical,c.high,c.medium,c.low].join(' / ')}),el('td',{textContent:r.source||''}),el('td',{},b,' ',cp)))});h.append(t)}
async function loadMem(){const d=await api('/api/memory');$('#mem').textContent=d.memory;$('#memsrc').textContent=d.readOnly?'Read-only generic rules (public mode).':(d.source==='private'?'Your private memory (memory/MEMORY.private.md, git-ignored).':'Generic template — your first saved instruction creates your private memory file.');if(d.readOnly)$('#addcard').hidden=true}
api('/api/config').then(c=>{CFG=c;if(c.public){document.querySelector('[data-t=memory]').hidden=false;document.querySelector('[data-t=prefs]').hidden=false;document.querySelector('[data-t=memory]').textContent='Default rules';document.querySelector('[data-t=history]').hidden=true;$('#target').placeholder='https://my-site.example.com';document.querySelector('#audit .mut').textContent='Public mode: public HTTPS sites only. Repo mode is disabled. Results are deleted after ~20 minutes.'}});
$('#addm').onclick=async()=>{const t=$('#newm').value.trim();if(!t)return;const r=await api('/api/memory',{text:t});if(r.error){$('#mm').textContent=r.error;return}$('#newm').value='';$('#mem').textContent=r.memory;$('#mm').textContent='Saved ✓'};

// ---- Per-visitor preferences: localStorage only, never written server-side ----
const PK='aku.prefs.v1',PMAX=5000;
function getPrefs(){try{return (localStorage.getItem(PK)||'').slice(0,PMAX)}catch{return ''}}
const pmsg=t=>{$('#prefsMsg').textContent=t};
const pcount=()=>{$('#prefsCount').textContent=$('#prefsText').value.length+' / '+PMAX};
function loadPrefs(){$('#prefsText').value=getPrefs();pcount()}
$('#prefsText').addEventListener('input',pcount);
$('#prefsSave').onclick=()=>{try{localStorage.setItem(PK,$('#prefsText').value.slice(0,PMAX));pmsg('Saved in this browser ✓')}catch{pmsg('Could not save (storage blocked).')}};
$('#prefsClear').onclick=()=>{try{localStorage.removeItem(PK)}catch{}$('#prefsText').value='';pcount();pmsg('Cleared.')};
$('#prefsExport').onclick=()=>{const blob=new Blob([$('#prefsText').value],{type:'text/markdown'});const a=el('a',{href:URL.createObjectURL(blob),download:'aku-preferences.md'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
$('#prefsImport').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(f.size>20000){pmsg('File too large (max 20 KB).');return}
 let t=await f.text();try{const j=JSON.parse(t);if(j&&typeof j.preferences==='string')t=j.preferences}catch{}
 t=t.replace(/\0/g,'');$('#prefsText').value=t.slice(0,PMAX);pcount();pmsg(t.length>PMAX?'Imported (truncated to 5000 chars). Press Save.':'Imported. Press Save to keep it.')};
