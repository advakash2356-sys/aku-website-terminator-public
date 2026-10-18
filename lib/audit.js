const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const AxeBuilder=require('@axe-core/playwright').default||require('@axe-core/playwright');
const VPS={desktop:{viewport:{width:1440,height:900}},mobile:{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'}};

async function inPage(page,isMobile){
  return page.evaluate((isMobile)=>{
    const vw=document.documentElement.clientWidth;
    const sel=e=>{let s=e.tagName.toLowerCase();if(e.id)s+='#'+e.id;else if(e.className&&typeof e.className==='string')s+='.'+e.className.trim().split(/\s+/).slice(0,2).join('.');return s};
    const overflowEls=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>vw+1)&&getComputedStyle(e).position!=='fixed'}).slice(0,10).map(e=>({el:sel(e),right:Math.round(e.getBoundingClientRect().right)}));
    const hOverflow=document.documentElement.scrollWidth>vw+1;
    const min=isMobile?44:24;
    const taps=[...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[onclick]')].filter(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&(r.width<min||r.height<min)}).slice(0,40).map(e=>{const r=e.getBoundingClientRect();return{el:sel(e),w:Math.round(r.width),h:Math.round(r.height),text:(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,30)}});
    const imgs=[...document.images];
    const noAlt=imgs.filter(i=>!i.hasAttribute('alt')).map(i=>(i.currentSrc||i.src).slice(0,100)).slice(0,20);
    const meta=n=>document.querySelector(`meta[name="${n}"]`)?.content||'';
    const og=p=>document.querySelector(`meta[property="${p}"]`)?.content||'';
    const fonts={},colors={},bgs={};
    document.querySelectorAll('body *').forEach(e=>{if(!(e.innerText||'').trim())return;const cs=getComputedStyle(e);
      const f=cs.fontFamily.split(',')[0].replace(/["']/g,'').trim();fonts[f]=(fonts[f]||0)+1;colors[cs.color]=(colors[cs.color]||0)+1;
      if(cs.backgroundColor!=='rgba(0, 0, 0, 0)')bgs[cs.backgroundColor]=(bgs[cs.backgroundColor]||0)+1});
    const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const h1=document.querySelectorAll('h1').length;
    const btnNoName=[...document.querySelectorAll('button,a[href]')].filter(e=>!(e.innerText||'').trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('title')&&!e.querySelector('img[alt]:not([alt=""])')).length;
    const inputsNoLabel=[...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea')].filter(i=>!i.getAttribute('aria-label')&&!i.getAttribute('aria-labelledby')&&!(i.id&&document.querySelector(`label[for="${i.id}"]`))&&!i.closest('label')).length;
    return{hOverflow,scrollWidth:document.documentElement.scrollWidth,vw,overflowEls,taps,noAlt,imgCount:imgs.length,
      lang:document.documentElement.lang||'',title:document.title,description:meta('description'),viewportMeta:meta('viewport'),canonical:document.querySelector('link[rel=canonical]')?.href||'',ogTitle:og('og:title'),ogImage:og('og:image'),themeColor:meta('theme-color'),
      h1,fonts:top(fonts),colors:top(colors),bgs:top(bgs),btnNoName,inputsNoLabel,bodyFont:getComputedStyle(document.body).fontSize,
      reducedMotionCss:[...document.styleSheets].some(s=>{try{return [...s.cssRules].some(r=>r.conditionText&&/prefers-reduced-motion/.test(r.conditionText))}catch{return false}})};
  },isMobile);
}
async function focusCheck(page){
  await page.evaluate(()=>window.scrollTo(0,0));
  const res=[];let noIndicator=0;
  for(let i=0;i<12;i++){
    await page.keyboard.press('Tab');
    const r=await page.evaluate(()=>{const e=document.activeElement;if(!e||e===document.body)return null;const cs=getComputedStyle(e);
      const ow=parseFloat(cs.outlineWidth)||0;const vis=(cs.outlineStyle!=='none'&&ow>0)||(cs.boxShadow&&cs.boxShadow!=='none');
      return{el:e.tagName.toLowerCase()+(e.id?'#'+e.id:''),text:(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,30),indicator:!!vis,outline:cs.outline.slice(0,50)}}).catch(()=>null);
    if(!r)break;res.push(r);if(!r.indicator)noIndicator++;
  }
  return{tabbed:res.length,noIndicator,items:res.filter(x=>!x.indicator).slice(0,10)};
}
async function auditViewport(browser,url,name,dir){
  const ctx=await browser.newContext({...VPS[name],ignoreHTTPSErrors:true});const page=await ctx.newPage();
  const consoleErrors=[],failed=[],bad=[];
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text().slice(0,300))});
  page.on('pageerror',e=>consoleErrors.push('pageerror: '+String(e.message).slice(0,300)));
  page.on('requestfailed',r=>failed.push({url:r.url().slice(0,150),error:r.failure()?.errorText}));
  page.on('response',r=>{if(r.status()>=400)bad.push({url:r.url().slice(0,150),status:r.status()})});
  const t0=Date.now();let resp;
  try{resp=await page.goto(url,{waitUntil:'load',timeout:45000});await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{})}
  catch(e){await ctx.close();return{viewport:name,error:'Navigation failed: '+e.message.split('\n')[0]}}
  const loadMs=Date.now()-t0;
  await page.screenshot({path:path.join(dir,`${name}-fold.png`)});
  // scroll to trigger lazy content
  await page.evaluate(async()=>{await new Promise(r=>{let y=0;const t=setInterval(()=>{window.scrollBy(0,600);y+=600;if(y>=document.body.scrollHeight||y>20000){clearInterval(t);r()}},80)});window.scrollTo(0,0)});
  await page.waitForTimeout(400);
  const sh=await page.evaluate(()=>Math.min(document.documentElement.scrollHeight,8000)).catch(()=>900);
  await page.screenshot({path:path.join(dir,`${name}-full.png`),clip:{x:0,y:0,width:VPS[name].viewport.width,height:Math.max(sh,100)},fullPage:true}).catch(()=>{});
  const dom=await inPage(page,name==='mobile');
  const focus=await focusCheck(page);
  let axe={violations:[]};
  try{const a=await new AxeBuilder({page}).analyze();axe.violations=a.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.length,sample:v.nodes.slice(0,3).map(n=>n.target.join(' ')+' :: '+(n.html||'').slice(0,100))}))}catch(e){axe.error=e.message}
  const perf=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return{domContentLoaded:n&&Math.round(n.domContentLoadedEventEnd),transferKB:Math.round(performance.getEntriesByType('resource').reduce((a,r)=>a+(r.transferSize||0),0)/1024)}}).catch(()=>({}));
  const headers=resp?resp.headers():{};
  await ctx.close();
  return{viewport:name,status:resp&&resp.status(),loadMs,consoleErrors:[...new Set(consoleErrors)],failedRequests:failed,badResponses:bad,dom,focus,axe,perf,
    securityHeaders:{csp:!!headers['content-security-policy'],hsts:!!headers['strict-transport-security'],xContentType:!!headers['x-content-type-options'],frame:!!(headers['x-frame-options']||/frame-ancestors/.test(headers['content-security-policy']||'')),referrer:!!headers['referrer-policy']}};
}
function findings(r){
  const f=[];const add=(sev,area,msg,fix)=>f.push({severity:sev,area,message:msg,fix});
  for(const v of r.viewports){if(v.error){add('critical','load',`${v.viewport}: ${v.error}`,'Make sure the URL is live and reachable');continue}
    const p=v.viewport,d=v.dom;
    if(v.status>=400)add('critical','load',`${p}: HTTP ${v.status}`,'Fix server response');
    if(v.consoleErrors.length)add('high','console',`${p}: ${v.consoleErrors.length} console error(s): ${v.consoleErrors[0].slice(0,120)}`,'Fix JS errors; check Playwright console output');
    if(v.failedRequests.length||v.badResponses.length)add('medium','network',`${p}: ${v.failedRequests.length} failed + ${v.badResponses.length} 4xx/5xx requests (e.g. ${(v.badResponses[0]||v.failedRequests[0]).url})`,'Remove/repair broken assets, links, API calls');
    if(d.hOverflow)add('high','layout',`${p}: horizontal overflow (page ${d.scrollWidth}px > viewport ${d.vw}px); offenders: ${d.overflowEls.slice(0,3).map(o=>o.el).join(', ')}`,'Constrain widths, use max-w-full, fix fixed-width elements');
    if(d.taps.length)add(p==='mobile'?'medium':'low','tap-targets',`${p}: ${d.taps.length} interactive elements smaller than ${p==='mobile'?44:24}px (e.g. ${d.taps.slice(0,3).map(t=>`${t.el} ${t.w}x${t.h}`).join('; ')})`,'Min 44x44 hit area on mobile (padding, not just font)');
    if(d.noAlt.length)add('medium','a11y',`${p}: ${d.noAlt.length} image(s) without alt attribute`,'Add descriptive alt (alt="" if decorative)');
    if(!d.lang)add('medium','a11y','Missing <html lang>','Set lang="en" (or proper locale)');
    if(!d.title)add('high','seo','Missing <title>','Add unique title (<60 chars)');
    if(!d.description)add('medium','seo','Missing meta description','Add benefit-led description (~150 chars)');
    if(!d.viewportMeta)add('high','mobile','Missing viewport meta','Add width=device-width, initial-scale=1');
    if(!d.ogImage)add('low','seo','Missing og:image / social card','Add og:title, og:description, og:image');
    if(d.h1!==1)add('low','seo',`${d.h1} <h1> elements (expected 1)`,'Use exactly one h1 with the core promise');
    if(d.btnNoName)add('medium','a11y',`${p}: ${d.btnNoName} buttons/links without accessible name`,'Add text or aria-label');
    if(d.inputsNoLabel)add('medium','a11y',`${p}: ${d.inputsNoLabel} form fields without label`,'Associate <label for> or aria-label');
    if(v.focus.noIndicator)add('high','keyboard',`${p}: ${v.focus.noIndicator}/${v.focus.tabbed} tabbed elements have no visible focus indicator (e.g. ${v.focus.items.slice(0,3).map(i=>i.el).join(', ')})`,'Add :focus-visible outline 2px with 3:1 contrast');
    if(d.fonts.length>3)add('low','design',`${d.fonts.length} font families in use: ${d.fonts.map(x=>x[0]).join(', ')}`,'Limit to 1–2 families (DESIGN.md type scale)');
    for(const a of v.axe.violations)add(a.impact==='critical'||a.impact==='serious'?'high':'medium','axe',`${p}: ${a.id} (${a.impact}) x${a.nodes} — ${a.help}`,a.helpUrl);
    if(parseFloat(d.bodyFont)<15)add('low','design',`Body font ${d.bodyFont} (readability)`,'Use 16px+ body for eye-soothing readability');
    if(p==='desktop'){const s=v.securityHeaders;const miss=Object.entries(s).filter(([,x])=>!x).map(([k])=>k);if(miss.length)add('medium','security',`Missing security headers: ${miss.join(', ')}`,'Add via vercel.json/next.config headers (CSP, HSTS, X-Content-Type-Options, frame-ancestors, Referrer-Policy)')}
    if(v.perf.transferKB>3000)add('medium','perf',`${p}: ${v.perf.transferKB} KB transferred`,'Compress images, lazy-load, trim JS (LCP/CLS budget)');
  }
  const seen=new Set();return f.filter(x=>{const k=x.area+x.message;if(seen.has(k))return false;seen.add(k);return true});
}
function toMd(r,fs_){
  const order=['critical','high','medium','low'];
  let o=`# Aku audit — ${r.url}\n\nDate: ${r.date} · Findings: ${fs_.length}\n\n`;
  const c=r.counts;o+=`| critical | high | medium | low |\n|---|---|---|---|\n| ${c.critical} | ${c.high} | ${c.medium} | ${c.low} |\n\n`;
  for(const s of order){const l=fs_.filter(x=>x.severity===s);if(!l.length)continue;o+=`## ${s.toUpperCase()}\n`;l.forEach(x=>o+=`- **[${x.area}]** ${x.message}\n  - Fix: ${x.fix}\n`);o+='\n'}
  for(const v of r.viewports){if(v.error)continue;const d=v.dom;o+=`## ${v.viewport} details\n- HTTP ${v.status}, load ${v.loadMs} ms, ${v.perf.transferKB||'?'} KB\n- Title: ${d.title||'—'}\n- Fonts: ${d.fonts.map(x=>x[0]+'×'+x[1]).join(', ')}\n- Text colours: ${d.colors.slice(0,5).map(x=>x[0]).join(' | ')}\n- Backgrounds: ${d.bgs.slice(0,5).map(x=>x[0]).join(' | ')}\n- Reduced-motion CSS: ${d.reducedMotionCss?'yes':'not found'}\n- Screenshots: ${v.viewport}-fold.png, ${v.viewport}-full.png\n\n`}
  return o;
}
async function auditUrl(url,outRoot,opts={}){
  const {today,slug}=require('./util');const cfg=require('./config');
  if(!/^https?:\/\//i.test(url))url='https://'+url;
  let proxy=null;
  if(cfg.PUBLIC){url=url.replace(/^http:/i,'https:');const g=require('./netguard');await g.assertPublicUrl(url);proxy=await g.startGuardProxy()}
  const date=today(),dir=path.join(outRoot,`${date}_${opts.name||slug(url)}`);fs.mkdirSync(dir,{recursive:true});
  const launch={args:[]};
  if(process.env.AKU_NO_SANDBOX==='1')launch.args.push('--no-sandbox');
  if(proxy){launch.proxy={server:`http://127.0.0.1:${proxy.port}`};launch.args.push('--proxy-bypass-list=<-loopback>','--disable-dev-shm-usage')}
  if(opts.launchOptions)Object.assign(launch,opts.launchOptions,{args:[...(opts.launchOptions.args||[]),...launch.args]});
  const browser=await chromium.launch(launch);
  let timedOut=false;const deadline=setTimeout(()=>{timedOut=true;browser.close().catch(()=>{})},opts.timeoutMs||cfg.JOB_TIMEOUT_MS);
  const viewports=[];
  try{for(const n of ['desktop','mobile'])viewports.push(await auditViewport(browser,url,n,dir))}
  catch(e){if(timedOut)throw new Error('Audit timed out');throw e}
  finally{clearTimeout(deadline);await browser.close().catch(()=>{});if(proxy)proxy.close()}
  if(timedOut)throw new Error('Audit timed out');
  const r={url,date,viewports};
  const fl=findings(r);r.counts={critical:0,high:0,medium:0,low:0};fl.forEach(x=>r.counts[x.severity]++);r.findings=fl;
  fs.writeFileSync(path.join(dir,'audit.json'),JSON.stringify(r,null,2));
  fs.writeFileSync(path.join(dir,'audit.md'),toMd(r,fl));
  r.dir=dir;return r;
}
module.exports={auditUrl};
