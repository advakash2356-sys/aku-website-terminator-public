# Security — Aku, the Website Terminator

Aku fetches arbitrary URLs with a real browser, so when it is hosted publicly it is an SSRF/abuse target. This document lists the threat model and what is enforced. Run `node bin/audit.js --code .` and `npm audit` before every release (see `SELF_AUDIT_REPORT.md`).

## Reporting
Open a private security advisory on the GitHub repo (Security → Report a vulnerability), or contact the owner directly. Please don't open public issues for vulnerabilities.

## Modes
| | Local (`AKU_PUBLIC=0`, `./start.sh`) | Public (default; `AKU_PUBLIC=1`) |
|---|---|---|
| Bind | 127.0.0.1 only; Host/Origin must be localhost | `0.0.0.0:$PORT`; Origin must match Host; optional `AKU_ALLOWED_HOSTS` |
| Targets | live URLs, `localhost` apps, GitHub repos (clone → code scan → run → audit) | public **HTTPS** sites only |
| Repo clone/run | on | **off** (server refuses; code-scan via CLI `--code` only, locally) |
| Memory / preferences | private file `memory/MEMORY.private.md` (git-ignored) else template; editable in UI | generic template (**read-only**) + each visitor's own preferences, kept in their browser (localStorage) and sent only with their own request |
| History / run files | kept in `memory/runs.json`, `out/` | no history API; results live under an unguessable id and are deleted after `AKU_OUT_TTL_MIN` (20) min |

## Why memory is split
`MEMORY.private.md` holds personal preferences and plans; it is injected into every generated prompt, so publishing it would publish them. `MEMORY.template.md` holds only generic design/security/pipeline rules and is the only memory a public deployment ever loads.

## Public-mode controls
- **SSRF**: scheme must be http/https (http upgraded to https); no credentials in URL; ports 80/443 only; hostnames like `localhost`, `*.local`, `*.internal`, `metadata.google.internal` rejected; every resolved A/AAAA must be public — blocks loopback, RFC1918, CGNAT 100.64/10, link-local 169.254/16 (cloud metadata), ULA fc00::/7, fe80::/10, multicast/reserved, IPv4-mapped IPv6 (unwrapped and re-checked), 6to4, NAT64; decimal/hex/octal IP tricks are normalised by the URL parser first.
- **Redirects and DNS rebinding**: Chromium is forced through an in-process forward proxy (`lib/netguard.js`) that re-resolves each hostname itself, rejects non-public IPs and connects to the *validated IP*. Every redirect hop, sub-resource, iframe and WebSocket goes through it, and loopback is not bypassed (`--proxy-bypass-list=<-loopback>`). Plain-HTTP proxying is not supported, so only HTTPS is reachable.
- **Abuse limits**: concurrency cap (`AKU_MAX_CONCURRENCY`, 2), per-IP audits (`AKU_RATE_AUDITS` per `AKU_RATE_WINDOW_MS`: 5 / 10 min), per-IP requests (120/min), body ≤ 4 KB, request/header timeouts, hard per-audit deadline (`AKU_JOB_TIMEOUT_MS`, 100 s, kills the browser), screenshot height capped at 8000 px.
- **Web hardening**: CSP `default-src 'none'; script-src 'self'; style-src 'self'; …; frame-ancestors 'none'` (no inline script/style), X-Frame-Options, nosniff, Referrer-Policy, COOP/CORP, Permissions-Policy, no-store, HSTS over HTTPS; JSON-only POST with Origin check; UI renders results with `textContent` only.
- **Files**: `/shots/*` and `/api/run` resolve + realpath-check under `out/`, `.png` only, NUL bytes rejected; job ids are 96-bit random.
- **No shell injection**: all child processes use `spawn` with argument arrays; repo URL must match a strict `github.com/owner/repo` pattern.

## Local-mode caveats (repo mode)
Repo mode runs `npm ci --ignore-scripts` and then **the repo's dev server**, i.e. that repo's code. Only audit repos you trust. Child processes get a minimal environment (no tokens), clone uses `core.symlinks=false`, no hooks, no global git config; the static server realpath-checks to avoid symlink escape. This is not a sandbox — never expose local mode to a network.

## Known limitations
- Audit output embeds text from the audited site (titles, selectors). The generated prompt is meant for a coding agent: treat it as untrusted input (prompt injection).
- The code scan is regex-based: misses and false positives are expected.
- Free hosts often block Chromium's sandbox; the Docker image sets `AKU_NO_SANDBOX=1` and relies on container isolation. Use a host that allows the sandbox if you can.
- Rate limiting is in-memory per instance (resets on restart, not shared across replicas). `AKU_TRUST_PROXY=1` must only be set behind a proxy that sets `X-Forwarded-For`.
- A public instance can be used to make your server fetch public sites; it still costs CPU and bandwidth. Put Cloudflare or similar in front for real traffic.

## Per-visitor preferences (public mode)
Visitors' preferences are never written to server files or shared state. The browser keeps them in `localStorage` and sends them (≤ 5000 chars, NULs stripped) in the body of that visitor's own `/api/audit` request; the server only inlines them into the prompt it returns. Because the audit result is returned to the same requester (unguessable job id on the Docker/Node server; direct response on Vercel), other visitors cannot read or overwrite them. Preferences are plain text inside a prompt the visitor pastes into their *own* agent; the UI renders everything with `textContent` (no HTML injection). Don't store secrets in preferences.

## Vercel (serverless) mode
`api/audit.js` runs the same SSRF guard (URL checks + a DNS-pinned guard proxy started inside the function, Chromium forced through it), same-origin check, size limits and per-IP limit. Caveat: serverless instances don't share memory, so the in-memory rate limit and concurrency cap are **per warm instance, best effort**. For hard limits enable Vercel Firewall rate limiting for `/api/audit`. We remove `@sparticuz/chromium`'s `--disable-web-security`, site-isolation and insecure-content flags.
