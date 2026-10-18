# SECURITY PROMPT — Top 3 vibe-coded app holes

## MASTER (fix all 3) — paste into any AI
You are a senior AppSec engineer. Audit and FIX these 3 critical vulnerabilities in my codebase. Do not just explain — fix the code.

### ISSUE 1 — File upload checks (block .jsp/.php)
- Find all file upload endpoints.
- Implement a WHITELIST, not a blacklist: only allow types the app really needs (jpg, jpeg, png, pdf, ...).
- Block executable extensions: .php, .jsp, .asp, .aspx, .exe, .sh, .js (also double extensions like `a.php.jpg`).
- Validate MIME type AND file signature / magic bytes, not just the extension.
- Rename files to a random UUID on upload; never use the user-provided filename.
- Store uploads outside the web root or in S3 (private bucket), never in an executable /uploads folder.
- Max file size 5MB.

### ISSUE 2 — Payment webhooks (fake PAID message)
- Find all Stripe / payment webhook handlers.
- MUST verify the signature with the Stripe SDK: `stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)` (use the RAW body).
- Fetch the event / object by ID from the Stripe API to confirm it is real and prevent replay.
- Check amount, currency and product/price ID match what we expect in our DB for that order.
- Use an idempotency key / store processed event IDs so the same event can't grant access twice.
- Webhook secret from ENV, never hardcoded.

### ISSUE 3 — XSS protection (comment → other users)
- Find every place user input (comment, username, bio, ...) is rendered.
- Sanitize on the backend, encode output on the frontend.
- Never use innerHTML / dangerouslySetInnerHTML with user data; use textContent. (React auto-escapes if you avoid dangerouslySetInnerHTML.)
- Enable auto-escaping in templates.
- Add a Content-Security-Policy header (no unsafe-inline for scripts where possible).
- Cookies: httpOnly, Secure, SameSite=Lax/Strict.

After fixing, show the files changed and a short test to verify each fix.

## SEPARATE SHORT PROMPTS
**File upload:** Fix my file upload. It currently has NO CHECKS and allows malicious files to take over the server. Implement whitelist validation, block .php/.jsp/.asp/.aspx/.exe/.sh/.js, validate file header (magic bytes) and MIME, rename to UUID, store outside web root, add 5MB size limit.

**Webhooks:** Fix my payment webhook. Currently I trust the PAID message without verifying it's from Stripe. Implement signature verification with STRIPE_WEBHOOK_SECRET via constructEvent, fetch the event from the Stripe API to confirm, verify amount/currency/product match the order before granting access, and add idempotency. Prevent fake free access.

**XSS:** Fix XSS in my app. A user can inject `<script>` via comment/username and it runs in other users' browsers stealing logins. Sanitize all user input, escape all output, remove innerHTML usage, add a CSP header, and set cookies httpOnly/Secure/SameSite.

## VERIFICATION TESTS
1. Upload: POST `shell.php`, `shell.php.jpg`, `x.jsp`, a `.png` whose bytes are PHP, and a 6MB jpg → all rejected (4xx). A real 100KB png → accepted, stored under UUID name, not reachable/executable at a web path.
2. Webhook: POST a JSON "paid" event with no/invalid `Stripe-Signature` → 400, no access granted. Valid signed event with wrong amount/currency → no access. Replay the same valid event ID twice → access granted once. `stripe trigger checkout.session.completed` with the CLI for the happy path.
3. XSS: submit `<img src=x onerror=alert(1)>` and `<script>alert(1)</script>` as comment/username → rendered as inert text, no alert. `curl -I` shows `Content-Security-Policy`; `Set-Cookie` shows HttpOnly; Secure; SameSite.
4. Run `node bin/audit.js --code <repo>` → exit 0 (no innerHTML/secret/webhook/upload findings).
