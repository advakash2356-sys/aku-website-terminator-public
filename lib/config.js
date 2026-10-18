// Central config. AKU_PUBLIC=1 enables hardened public hosted mode.
const int=(n,d)=>{const v=parseInt(process.env[n],10);return Number.isFinite(v)&&v>0?v:d};
// The PUBLIC edition defaults to hardened public mode; set AKU_PUBLIC=0 to run locally with full features.
const PUBLIC=process.env.AKU_PUBLIC!=='0';
module.exports={
  PUBLIC,
  PORT:int('PORT',int('AKU_PORT',4000)),
  HOST:process.env.AKU_HOST||(PUBLIC?'0.0.0.0':'127.0.0.1'),
  TRUST_PROXY:process.env.AKU_TRUST_PROXY==='1',          // read client IP from X-Forwarded-For (set only behind a trusted proxy)
  MAX_CONCURRENCY:PUBLIC?int('AKU_MAX_CONCURRENCY',2):1,
  JOB_TIMEOUT_MS:int('AKU_JOB_TIMEOUT_MS',PUBLIC?100000:600000),
  MAX_BODY:PUBLIC?16384:200000,
  RATE_AUDITS:int('AKU_RATE_AUDITS',5),                     // audits per IP per window
  RATE_WINDOW_MS:int('AKU_RATE_WINDOW_MS',600000),
  RATE_REQS:int('AKU_RATE_REQS',120),                       // any request per IP per minute
  OUT_TTL_MS:int('AKU_OUT_TTL_MIN',PUBLIC?20:0)*60000,      // 0 = keep forever (local)
  ALLOWED_HOSTS:(process.env.AKU_ALLOWED_HOSTS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean),
};
