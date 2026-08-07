export const theme = {
  colors: {
    // Design-system palette (Documents/Provenance_Streams_Complete_Design_System.md #5)
    primary: '#3B82F6',
    mint: '#4ADE80',
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
    // Red is reserved for genuine failures only — kept distinct from coral.
    error: '#EF4444',

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
   * gold stays the single accent, carried only by reward/identity, so the eye
   * has exactly one thing to land on. Additive — existing components keep
   * referencing `colors.*` directly; only StreamOrb is written against these.
   */
  streamKit: {
    verification: '#1E293B', // slate-800, muted neutral — outer ring
    confidence: '#94A3B8', // slate-400, lighter neutral — inner ring
    reward: '#FBBF24', // gold — the one accent: core glow, bloom, identity dot
    identity: '#FBBF24',
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
  displayFontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
} as const;

export type Theme = typeof theme;
