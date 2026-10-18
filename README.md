# Aku, the Website Terminator — PUBLIC VERSION

**Mission: terminate malware, loopholes, vulnerabilities and bad design — then redesign and fine-tune.**

Paste a live URL; Aku audits it with a real browser (Playwright + axe-core): desktop and mobile screenshots, console errors, overflow, tap targets, keyboard focus, accessibility/contrast, security headers. It then writes a ready-to-paste **improvement prompt** (5-stage design pipeline + security fixes + motion playbook + references + *your own preferences* + that site's findings) for any coding agent (Grok, Claude, Codex, Gemini, Cursor).

## Public vs private version
| | **PUBLIC VERSION** (this repo: `aku-website-terminator-public`) | **PRIVATE VERSION** (`aku-website-terminator-private`, owner only) |
|---|---|---|
| Purpose | Shareable, deployable on Vercel / Docker; anyone can use it | The owner's personal edition |
| Memory | Generic template only (`memory/MEMORY.template.md`), read-only | Owner's personal instructions committed in `memory/MEMORY.md` |
| Your preferences | Each visitor's own, stored **in their browser** (Preferences page) | Saved to the memory file on the owner's machine |
| Mode | Hardened public mode by default (`AKU_PUBLIC=1`) | Local mode, full features (GitHub repo audits, history) |
| Personal data in repo | None (scanned with gitleaks + manual grep before publishing) | Yes — must never be made public |

## Add your own preferences (visitors)
Open the **Preferences** tab, write your standing instructions (brand colours, motion budget, audience, stack, tone…), press **Save in this browser**. They are stored in your browser's `localStorage` only, sent with your own audit requests, and injected into the improvement prompt under "VISITOR PREFERENCES". They are never stored on the server, so nobody else can read or overwrite them. **Export to file** / **Import from file** move them between browsers or back them up (max 5000 characters; no secrets please).

## Deploy on Vercel (one click)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fadvakash2356-sys%2Faku-website-terminator-public)

Or: Vercel dashboard → **Add New → Project → Import Git Repository** → pick this repo → keep defaults (`vercel.json` configures everything: static UI from `public/`, serverless functions in `api/`) → Deploy. No env vars are required.

How it works on Vercel: the static UI (`public/`) calls `POST /api/audit`, a Node serverless function that launches Chromium via `@sparticuz/chromium` + `playwright-core`, runs the audit synchronously and returns the report, prompt and the two above-the-fold screenshots.

**Honest limits on Vercel**
- Each audit must finish inside the function time limit (`maxDuration` 60 s in `vercel.json`; the audit self-aborts at ~48 s). Heavy or slow sites may time out; the full-page screenshots and some slow checks are best on the local/Docker path. Your plan's maximum duration and memory (`memory: 1769` MB requested) apply — Hobby plans may cap these lower; adjust `vercel.json` if the deploy rejects them.
- Cold starts add several seconds (Chromium is unpacked on first use).
- Rate limits and concurrency caps are in-memory **per warm instance** (serverless instances don't share memory), so they are best-effort. For a hard limit turn on Vercel Firewall rate limiting for `/api/audit`.
- SSRF protections still apply (public HTTPS only, DNS-pinned guard proxy for every browser request); see [SECURITY.md](SECURITY.md).
- GitHub-repo cloning/running is disabled on the hosted version.
- Written/tested against a simulated handler locally with the same Chromium package; **not yet verified on a live Vercel deployment**. If Chromium crashes there, set env `AKU_SINGLE_PROCESS=1` and redeploy.

## Run locally (full features) 
1. Node 20+ (`brew install node`), then `git clone` this repo, `cd` into it.
2. `npm install && ./start.sh` → open **http://127.0.0.1:4000** (local mode: `AKU_PUBLIC=0`, localhost only, GitHub-repo audits, history, local memory file `memory/MEMORY.private.md`, git-ignored).
3. Public mode locally: `npm run public` (same hardening as the hosted site).

## Docker (fallback for hosting a full server)
```
docker build -t aku .
docker run --rm -p 4000:4000 --init --ipc=host aku
```
Runs the Node server in public mode as non-root `pwuser` (Playwright base image with Chromium; no 60 s function limit). Works on Render, Fly, Cloud Run, your own VPS. (Image build not verified on the build box: no Docker there.)

## UI (local mode; the public UI has Audit, Default rules and Preferences tabs)
- **Audit**: live URL → desktop+mobile audit, screenshots, findings, `audit.md`, copy-ready prompt. GitHub repo URL → shallow clone to temp, code scan, framework detect, `npm ci --ignore-scripts` (falls back to `npm install --ignore-scripts` with a warning), dev server on a free port with timeout, audit localhost, cleanup.
- **History**: every run with View / Copy-prompt buttons.
- **Memory**: view and append standing instructions. Saved to your private, git-ignored `memory/MEMORY.private.md` (created from the template on first save) and injected into every generated prompt. If no private file exists, the generic `memory/MEMORY.template.md` is used. `memory/runs.json` (git-ignored) keeps run history and per-site notes.

## CLI
```
node bin/audit.js <url|urls.txt> [--out dir] [--code <dir>]
```
Per site (folder `out/YYYY-MM-DD_site/`): `audit.md`, `audit.json`, desktop/mobile fold+full screenshots, `IMPROVE_PROMPT.md`; plus `summary.json`. Checks: console errors, failed requests, horizontal overflow, tap targets, alt/lang/meta, fonts/colours, keyboard focus indicators, axe violations, security headers.
`--code <dir>`: (honours a `.akuignore` of path prefixes, and `aku-ignore` on a line) regex scan for innerHTML/dangerouslySetInnerHTML, hardcoded secrets, webhooks without signature verification, uploads without checks → `code-scan.md/json`, **exit code 1 on findings**. It is a pattern scan: expect misses and false alarms.

## Prompts and playbooks
`MASTER_PROMPT.md` (Taste → DESIGN.md → Image-to-code → Vercel guidelines → Playwright proof; dials 6/3/4), `SECURITY_PROMPT.md`, `MOTION_PLAYBOOK.md`, `references/REFERENCES.md` (+ `references.json`, live-verified, link only).

## Bundled skills (`skills/`)
| Folder | Source | License |
|---|---|---|
| taste-skill/ (design-taste-frontend, image-to-code) | Leonxlnx/taste-skill | MIT (LICENSE kept) |
| design-md-samples/ (vercel, linear.app, stripe) | VoltAgent/awesome-design-md | MIT (LICENSE kept) |
| ecc/ (frontend-design-direction, design-system, frontend-a11y, e2e-testing, security-review) | affaan-m/ECC | MIT (LICENSE + NOTICE) |
| vercel-web-design-guidelines | vercel-labs/agent-skills | **Not bundled** (no upstream license); MASTER_PROMPT links to it instead |

ECC: only 5 single skills are copied. Do NOT do a full ECC install (~54 hooks with broad file access).

## Memory model
- `memory/MEMORY.template.md` — generic design/security/pipeline rules; always loaded; the only memory a public deployment uses.
- Visitor preferences — browser-only (see above).
- Local mode only: the UI Memory page appends to git-ignored `memory/MEMORY.private.md`, loaded instead of the template.

## Public mode env (Node server / Docker)
`AKU_MAX_CONCURRENCY` (2), `AKU_RATE_AUDITS` (5) / `AKU_RATE_WINDOW_MS` (600000), `AKU_RATE_REQS` (120/min), `AKU_JOB_TIMEOUT_MS` (100000), `AKU_OUT_TTL_MIN` (20), `AKU_ALLOWED_HOSTS`, `AKU_TRUST_PROXY=1` (behind a trusted proxy), `AKU_NO_SANDBOX=1`. Self-audit: [SELF_AUDIT_REPORT.md](SELF_AUDIT_REPORT.md).

License: MIT. Bundled third-party skills keep their own licenses (see `skills/*/LICENSE`).
