# AKU MEMORY TEMPLATE — generic standing rules (loaded into EVERY generated per-site prompt)

This is the shared, public-safe default. On the hosted/public site, add your own standing instructions on the **Preferences** page (stored only in your browser). When running locally (`AKU_PUBLIC=0`), the Memory page saves them to the git-ignored `memory/MEMORY.private.md`, which is loaded instead of this template. Never put personal or business information in this template.

Product: **Aku, the Website Terminator.** Mission: terminate malware, loopholes, vulnerabilities and bad design, then redesign and fine-tune.

## 2. Design pipeline (don't skip steps)
Taste → DESIGN.md → Image-to-code → Vercel web-design-guidelines audit → Playwright proof. (direction > system > implementation > review > proof.)
- Stage 1 Taste (Leonxlnx/taste-skill design-taste-frontend): state visual direction + design-system family before coding.
- **Dials: design variance 6/10, motion 3/10, visual density 4/10** unless told otherwise.
- Stage 2 DESIGN.md: fetch one from awesome-design-md / getdesign.md; read before changing UI; adapt to product, don't copy brand literally; afterwards record only adopted decisions (semantic colours, type scale, spacing, radii, button hierarchy, card treatment, responsive behaviour, motion limits).
- Stage 3 Image-to-code: inspect codebase/stack, analyse reference (grid, hierarchy, type, colours, spacing, imagery, components, states, responsive), map to components + DESIGN.md, no logos/trademarks, compare rendered vs reference.
- Stage 4 Vercel guidelines: report file:line by severity; keyboard, focus, labels, contrast, target size, responsive, reduced motion, loading/error states.
- Stage 5 Playwright: desktop + mobile, keyboard + pointer journey, nav/forms/validation/loading/empty/error/success, screenshots, console errors, overflow, clipped content, focus problems.
- One clear job per stage; don't activate everything in every prompt.

## 3. Reuse rule
- Prefer free, actively maintained open-source tools and skills (taste-skill, awesome-design-md, vercel-labs/agent-skills, playwright, axe-core) over reinventing.

## 4. Skill hygiene
- Bundle single skills only; never run a full install of large agent-harness packages (they add many hooks with broad file access). Never `curl | sh` installers.
- Keep prompts minimal: one clear job per stage, don't activate everything at once.

## 5. Security fixes (every audit must flag these) — full lists
1. **File upload:** find all upload endpoints; WHITELIST only needed types (jpg/jpeg/png/pdf…); block .php .jsp .asp .aspx .exe .sh .js; validate MIME AND magic bytes; rename to random UUID; store outside web root / S3; max 5MB.
2. **Payment webhooks (Stripe):** verify signature with stripe.webhooks.constructEvent (raw body); fetch event from Stripe API (anti-replay); check amount, currency, product ID vs DB; idempotency key / processed-event store so access can't be granted twice; secret from ENV not hardcoded.
3. **XSS:** find every place user input (comment, username, bio) renders; sanitize on backend, encode on frontend; never innerHTML/dangerouslySetInnerHTML with user data (use textContent); auto-escaping templates; Content-Security-Policy header; cookies httpOnly + Secure + SameSite.
After fixing: show changed files + a short test per fix. (See SECURITY_PROMPT.md.)

## 6. Motion playbook
- Scroll-based animated sites: Next.js + Tailwind + Framer Motion + GSAP ScrollTrigger + Lenis; sticky-scroll hero where product stays pinned and rotates/scales; entrance animation per section; responsive and performant.
- Libraries: Animmaster Lib (300+ components), Aceternity UI (Chromatic Image, Cloud Shader, Squiggly Text), Skiper UI (Image Reveal, Dynamic Island, Apple-like blocks).
- Guardrails: reduced-motion support, motion budget 3/10, CLS < 0.1, LCP < 2.5s, transform/opacity only. (See MOTION_PLAYBOOK.md.)

## 7. Defaults
- Readable, high-contrast, calm visuals. Honest persuasion only (never fake scarcity). One clear primary CTA per view.
- Free tools only unless told otherwise.
- Concise outputs.

## 8. Appended instructions (newest last)
