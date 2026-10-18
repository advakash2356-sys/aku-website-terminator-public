// Chromium launch options for serverless (Vercel/AWS Lambda) via @sparticuz/chromium.
// We drop its security-weakening flags: Aku audits untrusted sites, so keep web security + site isolation ON.
const DROP=/^--(disable-web-security|disable-site-isolation-trials|allow-running-insecure-content|disable-setuid-sandbox|disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process)$/;
module.exports=async()=>{
  const m=require('@sparticuz/chromium');const sp=m.default||m;
  return{executablePath:await sp.executablePath(),args:sp.args.filter(a=>!DROP.test(a)&&!(a==='--single-process'&&process.env.AKU_SINGLE_PROCESS!=='1')),headless:true};
// If Chromium crashes on the real platform, set AKU_SINGLE_PROCESS=1 in Vercel env to restore sparticuz's --single-process.
};
