// Brand constants — confirmed from tailwind.config.js + index.css
// Slide framework — confirmed from NEW.png (Carousel Framework screenshot)

export const BRAND = {
  colors: {
    bg: '#0f172a',
    bgCard: '#1e293b',
    bgMuted: '#162032',
    text: '#f8fafc',
    textMuted: '#94a3b8',
    accent: '#06b6d4',
    accentLight: '#22d3ee',
    accentGlow: 'rgba(6, 182, 212, 0.18)',
    gradientStart: '#06b6d4',
    gradientMid: '#3b82f6',
    gradientEnd: '#8b5cf6',
    divider: 'rgba(6, 182, 212, 0.35)',
  },

  fonts: {
    headline: 'Poppins',
    body: 'Poppins',
  },

  // Slide canvas — Rule 1: ALWAYS 1080×1440 (3:4). Never 1080×1080.
  canvas: {
    width: 1080,
    height: 1440,
  },

  // Safe zone — Rule 2
  safe: {
    top: 180,
    bottom: 180,
    left: 50,
    right: 120,
  },
} as const;

// Derived helpers
export const SAFE_WIDTH = BRAND.canvas.width - BRAND.safe.left - BRAND.safe.right;
export const SAFE_HEIGHT = BRAND.canvas.height - BRAND.safe.top - BRAND.safe.bottom;

/**
 * 10-slide framework phases (NEW.png — Carousel Framework):
 *
 * Phase 1 — HOOK       (slide 1)    Stop the scroll and hook them in
 * Phase 2 — EXAMPLE    (slides 2-3) Build interest with an example
 * Phase 3 — DIAGRAM    (slides 4-5) Retain attention with diagrams
 * Phase 4 — PRACTICAL  (slides 6-9) Practical information + recap bridge
 * Phase 5 — CTA        (slide 10)   Simple CTA — exactly 1 action, never multiple
 */
export type SlideType = 'hook' | 'example' | 'diagram' | 'practical' | 'cta';

export interface SlideData {
  type: SlideType;
  position: number;       // 1–10
  headline: string;       // ≤8 words
  subtext?: string;       // hook only — ≤15 words
  body?: string;          // ≤25 words
  visual_hint?: string;   // kept for backward compat — no longer rendered
  action?: string;        // cta only
  bullets?: string[];     // example/practical — 2–4 concise bullet points
  steps?: string[];       // diagram — 3–4 numbered process steps
  stats?: Array<{ value: string; label: string }>; // diagram — 2–4 metric callouts
  image_query?: string;   // Pexels search query for background image (hook/example)
  // Rule 8 — @marketingharry virality fields
  hook_stat?: string;          // hook slide: giant accent number (e.g. "73%", "10x") above headline
  swipe_invite?: string;       // hook slide: contextual swipe invite (e.g. "Swipe to see how 👉", "in 2025 👇")
  teaser?: string;             // practical slides: italic teaser line above footer (e.g. "No code needed")
  cta_comment_prompt?: string; // cta slide: KEYWORD ONLY, ALL CAPS, ≤8 chars (e.g. "AUTOMATE", "GUIDE", "BUILD")
  highlight_word?: string;     // one key word to accent in cyan (e.g. "automate", "manual", "73%")
}

export interface CarouselInput {
  format: 'comparison' | 'tutorial' | 'native' | 'compilation' | 'story';
  caption: string;
  slides: SlideData[];   // always exactly 10
}
