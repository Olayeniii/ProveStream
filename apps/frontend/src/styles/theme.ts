export const theme = {
  colors: {
    // Design-system palette (Documents/Provenance_Streams_Complete_Design_System.md #5)
    // `primary` is the real brand red (see the logo mark in assets/) — was a
    // generic blue; now the app's one accent matches the actual brand.
    primary: '#FF101A',
    mint: '#4ADE80',
    // "Active"/warning tone (status dots, risk-gauge mid scores) — a
    // separate role from `primary`, kept unchanged.
    gold: '#FBBF24',
    violet: '#8B5CF6',
    coral: '#F97316',
    slate: '#64748B',
    light: '#F7F9FC',
    dark: '#0E1117',

    // Semantic tokens the app renders with today (light theme).
    background: '#F7F9FC',
    surface: '#FFFFFF',
    surfaceMuted: '#F1F4F9',
    border: '#E2E8F0',
    text: '#0F172A',
    textMuted: '#64748B',
    primaryText: '#FFFFFF',
    success: '#4ADE80',
    // Design-language 1.3: Coral = attention, needs review, not failure.
    // A deep, muted wine red — reserved for genuine failures, kept distinct
    // from `primary` by darkness/saturation as well as hue, now that
    // `primary` is itself a bright red, so "failed" never reads as "the
    // usual accent."
    error: '#8B1220',

    // Readable text shades for status badges/labels rendered on a tinted tone
    // background (mint/gold/coral) — the base palette colors above are too
    // light on their own for text at small sizes.
    positiveText: '#166534',
    warningText: '#92400E',
    attentionText: '#9A3412',
  },

  /**
   * Semantic aliases for the Stream Orb's four layers (see "The Provenance
   * Book" / the provenance-streams-design skill), deliberately NOT reusing the
   * bright, separately-hued palette above — three saturated colors on one
   * small symbol reads as the generic "AI-colorful" default the design-taste-
   * frontend skill warns against. The rings are muted slate neutrals instead;
   * the brand red stays the single accent, carried only by reward/identity, so
   * the eye has exactly one thing to land on. Additive — existing components
   * keep referencing `colors.*` directly; only StreamOrb is written against these.
   */
  streamKit: {
    verification: '#1E293B', // slate-800, muted neutral — outer ring
    confidence: '#94A3B8', // slate-400, lighter neutral — inner ring
    reward: '#FF101A', // brand red — the one accent: core glow, bloom, identity dot
    identity: '#FF101A',
  },
  radius: {
    pill: '999px',
    card: '16px',
  },
  spacing: {
    unit: 8,
    cardPadding: '24px',
    sectionGap: '64px',
  },
  type: {
    display: '56px',
    h1: '48px',
    h2: '36px',
    h3: '28px',
    body: '16px',
    caption: '13px',
  },
  fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  monoFontFamily: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
  /**
   * Display voice for brand surfaces only (landing page, How It Works) — per
   * impeccable's operate.md, product/dashboard UI stays on a single family
   * (`fontFamily`); a display font in dashboard labels/buttons/data is a named
   * anti-pattern there. Never reference this outside LandingPage/HowItWorksPage.
   */
  displayFontFamily: "'Chakra Petch', 'Inter', system-ui, -apple-system, sans-serif",
  /**
   * Dark precision-tech palette for brand surfaces only (Landing, How It
   * Works) — the five dashboards stay on the light `colors.*` tokens above,
   * per impeccable's Restrained guidance for product UI. Never reference
   * this outside LandingPage/HowItWorksPage.
   */
  brand: {
    bg: '#0A0A0D',
    panel: '#131316',
    line: '#26262A',
    text: '#FFFFFF',
    textMuted: '#8C9099',
    textDim: '#575A60',
    accent: '#FF101A',
  },
} as const;

export type Theme = typeof theme;
