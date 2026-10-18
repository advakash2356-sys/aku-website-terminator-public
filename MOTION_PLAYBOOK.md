# MOTION PLAYBOOK — scroll-based animated sites

## MASTER PROMPT (Renaissance / agentic sticky-scroll style)
You are a senior frontend engineer expert in scroll-based animations.
GOAL: Build a scrolling animated website like the reference — 3D objects / product visuals rotate, stick and animate on scroll.
STACK: Next.js + Tailwind CSS + Framer Motion + GSAP (ScrollTrigger) + Lenis. Component libraries (pick by need): Animmaster Lib (animmasterlib.dev), Aceternity UI (ui.aceternity.com), Skiper UI (skiper-ui).
REQUIREMENTS:
- Hero with sticky scroll: product/image stays pinned and rotates/scales as the user scrolls.
- Use GSAP ScrollTrigger or Framer Motion `useScroll` for scroll logic.
- Each section: entrance animation (fade, parallax or 3D transform).
- Responsive, performance-optimised; Lenis smooth scroll.
- Install: `npm install framer-motion gsap lenis` (Lenis was `@studio-freight/lenis`; now `lenis`).
WORKFLOW: setup structure → install deps → build components section by section → add scroll logic → test.
Give full copy-pasteable code for the main `page.tsx`.

## Per-library prompts
**Animmaster Lib (animmasterlib.dev) — 300+ components:** Build my website using Animmaster Lib. I want pro-level scroll animations, mouse effects, page transitions, sliders and hover effects. Show how to install it and use 3–4 components (Scroll Animation, Slider, Grid Animation) in my Next.js app.

**Aceternity UI (ui.aceternity.com):** Build using Aceternity UI. Use ready components like Chromatic Image, Cloud Shader and Squiggly Text, copied from their docs. Set up Next.js + Tailwind, then give me a hero with a squiggly-text effect.

**Skiper UI (skiper-ui):** Build using Skiper UI (uncommon shadcn components). I want Image Reveal, Dynamic Island and Projects Showcase. Show shadcn installation and how to use skiper-ui components. Build a portfolio section.

## GUARDRAILS (non-negotiable)
- **Motion budget 3/10** by default: one hero moment + subtle section reveals. No scroll-jacking that blocks reading.
- `prefers-reduced-motion: reduce` → disable parallax/pinning/auto-play, show static content; also pause Lenis.
- **CLS < 0.1:** reserve space for media, no layout-shifting animations (animate transform/opacity only).
- **LCP < 2.5s:** hero image priority/preload, no heavy WebGL before first paint, lazy-load 3D, compress assets, cap total JS.
- Mobile: simplify or disable pinned/3D scenes under 768px; keep 44px tap targets and visible focus.
- Keep light, readable, eye-soothing; the content and ONE CTA must remain obvious through the animation.
- Verify with Playwright: screenshots at 1440 & 390, console clean, Lighthouse/CLS check, reduced-motion emulation.
