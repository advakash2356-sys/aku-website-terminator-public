# Aku self-audit report — 2026-10-18

Aku audited itself before any public release. Everything below was re-run after the fixes.

## Scans run
| Scan | Result before | Result after |
|---|---|---|
| `node bin/audit.js --code .` (Aku's own code scan) | 13 high: 1 false positive (rule definitions in `lib/codescan.js`), 12 in vendored `skills/taste-skill` (a helper named `eval()`, harness `innerHTML` with its own data — dev-time files, never loaded by the server) | 0 (via `.akuignore`, reasons documented in that file) |
| Aku's browser audit of its own UI (desktop + mobile, axe, focus, headers) | 0 critical/high, 5 medium, 1 low: no meta description, no landmark (`nav role=tablist` overrode the nav landmark), tap targets 43.x px, missing HSTS | 1 medium + 1 low left, both accepted: HSTS cannot apply to `http://127.0.0.1` (public mode sends it over HTTPS); no `og:image` for a local tool |
| `npm audit` | 0 vulnerabilities | 0 |
| gitleaks 8 (working tree, 2 MB) | no leaks | no leaks |
| Git history | `node_modules/` (2 MB) and personal memory were tracked | history re-created from a clean orphan commit (single clean root commit; old commits discarded) |

## Real problems found and fixed
1. **Personal memory was committed** (`memory/MEMORY.md`) → split into git-ignored `MEMORY.private.md` + generic `MEMORY.template.md`; history rewritten.
2. **`node_modules` committed** → untracked, ignored.
3. **Inline script/style needed `'unsafe-inline'` in the CSP** → moved to `app.js`/`app.css`; CSP now `script-src 'self'; style-src 'self'`, plus frame-ancestors, base-uri, form-action, object-src.
4. **Missing headers** (X-Frame-Options, Referrer-Policy, COOP/CORP, Permissions-Policy, no-store) added.
5. **Static server for cloned repos**: `startsWith(dir)` prefix check (`/tmp/x/repo` vs `/tmp/x/repo-evil`) and symlink escape → realpath check against the root with separator; clone now uses `core.symlinks=false`, no hooks, no global git config.
6. **Untrusted repo processes inherited the parent's full environment** (tokens, secrets) → minimal env.
7. **Repo URL regex** allowed owner/repo starting with `.` or `-` → tightened; `--` passed to `git clone`.
8. **Request body limit destroyed the socket** silently → explicit 413 via Content-Length check (stream cap kept as backstop).
9. **No limits at all** (single global `busy` flag only) → rate limits, concurrency cap, timeouts, deadline that kills the browser.
10. **Job ids were `Date.now()` base36** (guessable) → 96-bit random.
11. **Screenshots of very tall pages** unbounded → capped at 8000 px.
12. **Scan gaps**: added `cmd-injection` rule (`exec(` with interpolation/concatenation); scan skips files >1.5 MB and unreadable files.

## Public-mode test log (run on the build box)
Box DNS maps every name to 198.18.0.0/15, so a test-only preload (outside the repo) let that range through to exercise the happy path; all other checks used real rules.
- Blocked at API with correct errors: `127.0.0.1`, `localhost`, `foo.localhost`, `169.254.169.254`, `metadata.google.internal`, `[::1]`, `[::ffff:127.0.0.1]`, `2130706433`, `0x7f.1`, `127.1`, `file://`, `javascript:`, `ftp://`, credentials in URL, port 22, GitHub repo URL.
- IP classifier unit checks: mapped IPv6 (`::ffff:7f00:1`, `::ffff:a00:1`), 6to4 `2002:7f00:1::`, NAT64 `64:ff9b::7f00:1`, CGNAT, link-local, ULA → blocked; `8.8.8.8`, `::ffff:8.8.8.8`, `2606:4700::1111` → allowed.
- Guard proxy: `CONNECT` to `127.0.0.1:80`, `localhost:443`, `169.254.169.254:80`, `[::1]:443`, `10.0.0.1:443`, `example.com:22` → 403; allowed host → 200.
- Real Chromium through the proxy: `https://127.0.0.1:4000` → `ERR_TUNNEL_CONNECTION_FAILED`; `http://127.0.0.1:4000` and `http://localhost:4000` → refused by the proxy (405), never reach the local server (proves loopback is not bypassed).
- Full public-mode audit of an allowed HTTPS site: completes through the proxy.
- Memory POST → 403; `/api/runs` → 404; `/api/run?dir=..` → 404; `/shots/..%2f..` and `%2e%2e` traversal → 404; bad Origin → 403; oversize body → rejected; per-IP audit limit → 429; second concurrent audit with cap 1 → 503; request flood (125 req/min) → 429 after 120.
- Security headers present on all responses.

## Not tested / residual risk
- True DNS-rebinding attack against a live attacker-controlled resolver (design covers it because the proxy connects to the IP it validated; verified by construction and proxy tests, not by an attacker DNS server).
- Docker image build/run (no Docker on the build box) and a real deployment.
- Load/DoS behaviour beyond the configured caps; Chromium memory use on 512 MB hosts.
- Regex code scan limits (see SECURITY.md).
