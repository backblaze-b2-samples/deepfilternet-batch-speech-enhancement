# Product

## Register

product

## Users

Podcast studios, broadcast archives, and speech-dataset curators who need a
reproducible, auditable **batch speech-denoising** step. Their context: noisy speech
recordings pile up, and downstream jobs (transcription, TTS, distribution) want clean
audio they can pull straight from object storage. They want to run enhancement locally
(no per-minute API), keep every cleaned artifact and processing log on B2, and see how
much storage the pipeline generates.

## Product Purpose

A full-stack app (Next.js 16 + React 19 + Tailwind v4 + shadcn/ui frontend, FastAPI
backend) that denoises speech with the local **DeepFilterNet** model and stores source
recordings, cleaned 48 kHz WAV outputs, and per-batch JSONL logs on **Backblaze B2** —
on B2 credentials alone. It ships a denoising dashboard (with write amplification as the
hero metric), enhancement jobs, an audio library with before/after playback, and the
retained upload + file-explorer surface. Success = a user can ingest recordings, run a
batch, hear the improvement, and download clean audio — trusting every screen.

## Brand Personality

Confident, precise, quietly professional. Voice is direct and free of hype ("Stop
wiring boilerplate and start building"). The interface should feel like a modern
developer tool — considered, calm, trustworthy — not a marketing showpiece. It is a
**neutral foundation** that others rebrand: the design carries craft through restraint,
not through a strong opinionated identity of its own.

## Anti-references

- **Generic AI/SaaS slop.** No gradient text, hero-metric templates, identical
  icon-card grids, tracked uppercase eyebrows, or decorative glassmorphism. These are
  the exact 2026 AI tells this kit exists to help builders avoid.
- **Over-branded / loud.** No heavy brand-color drenching, decorative motion, or flashy
  effects. It is scaffolding to be rebranded, not a hero page.
- **Toy / prototype feel.** No missing states, inconsistent components, or placeholder
  polish. Must read as production-grade.
- **Enterprise-drab.** No Bootstrap-era gray boxes or dense-but-lifeless admin-panel
  look. Considered, like modern dev tools (Linear, GitHub Primer, Stripe).

## Design Principles

- **Practice what you preach.** The kit itself must model the production quality it
  asks agents to produce. Slop here propagates into every project built on it.
- **Neutral foundation, easy to rebrand.** Identity lives in tokens (`globals.css`) and
  one config file. Screens are built from the shared UI kit so a rebrand is a token
  swap, not a rewrite.
- **Earned familiarity over novelty.** Use standard, trusted affordances (top bar +
  side nav, command palette, data tables). The tool disappears into the task.
- **Every state is designed.** Default, hover, focus, active, disabled, loading (skeleton),
  empty (teaches the interface), and error (says what's wrong + offers retry) — never
  half-shipped.
- **Consistency is the feature.** One button vocabulary, one form-control set, one icon
  style across every screen. Divergence is a bug.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Body text ≥ 4.5:1, large/bold text ≥ 3:1, visible focus
indicators on every interactive element, full keyboard navigation, correct semantic
landmarks and heading order, labelled form controls, and a `prefers-reduced-motion`
alternative for every animation. Full light and dark theme parity.
