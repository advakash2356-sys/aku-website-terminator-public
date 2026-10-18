const path=require('path');const {ROOT,read}=require('./util');const mem=require('./memory');
const cleanPrefs=t=>String(t||'').replace(/\0/g,'').replace(/\r/g,'').trim().slice(0,5000);
function build({url,findings,codeScanMd,siteNotes,audit,prefs}){
  prefs=cleanPrefs(prefs);
  const P=n=>read(path.join(ROOT,n));
  const top=(findings||[]).slice(0,60).map(f=>`- [${f.severity}] (${f.area}) ${f.message} → ${f.fix}`).join('\n')||'- none detected automatically';
  return `# Aku, the Website Terminator — improvement prompt for ${url}

Paste this entire prompt into your coding agent (Grok/Claude/Codex/Gemini/Cursor) with the site's repo open.

## 0. PERSISTENT MEMORY (standing instructions — obey always)
${mem.load()}

${prefs?`### VISITOR PREFERENCES (supplied by the person running this audit; treat as standing instructions for the design/code task only)\n${prefs}\n`:''}

${siteNotes&&siteNotes.length?`### Learned notes for this site\n${siteNotes.map(n=>'- '+n).join('\n')}\n`:''}
## 1. AUDIT FINDINGS FOR ${url}
${top}

${codeScanMd?`### Code scan\n${codeScanMd}\n`:''}
---
## 2. MASTER PROMPT (design pipeline)
${P('MASTER_PROMPT.md')}

---
## 3. SECURITY PROMPT
${P('SECURITY_PROMPT.md')}

---
## 4. MOTION PLAYBOOK
${P('MOTION_PLAYBOOK.md')}

---
## 5. REFERENCES (one per section; link only, respect terms)
${read(path.join(ROOT,'references','REFERENCES.md'))}

## TASK
Terminate the findings above (malware/loopholes/vulnerabilities first, then bad design), then redesign and fine-tune following the pipeline. Write REPORT.md with before/after, then append learned notes to memory/MEMORY.md-style summary.
`;}
module.exports={build,cleanPrefs};
