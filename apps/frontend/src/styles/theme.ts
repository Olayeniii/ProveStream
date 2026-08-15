export const theme = {
  colors: {
    // Official named palette: Obsidian / Arc Red / USDC Teal / Steel / Paper.
    // `primary` is the real brand red (see the logo mark in assets/) — was a
    // generic blue; now the app's one accent matches the actual brand.
    primary: '#FF101A', // Arc Red
    // USDC Teal, not a generic "mint green" — this app settles USDC, so its
    // positive/success color is the actual stablecoin's brand hue.
    mint: '#14BBA6',
    // "Active"/warning tone (status dots, risk-gauge mid scores) — a
    // separate role from `primary`, kept unchanged.
    gold: '#FBBF24',
    violet: '#8B5CF6',
    coral: '#F97316',
    slate: '#A1A1AA', // Steel — the app's one canonical muted neutral
    light: '#F7F9FC',
    dark: '#0E1117',

    // Semantic tokens the app renders with today — the whole app (dashboards
    // included) runs on the same dark precision-tech ground as the brand
    // surfaces now, matching the `brand.*` values below by design. Each step
    // is Obsidian mixed with an increasing amount of Steel (8/15/20/28%) —
    // pure Obsidian at full-page coverage vibrates against white text and
    // barely separates from `surface`, so the ladder is derived from the two
    // named neutrals rather than an arbitrary new hex.
    background: '#161617', // Obsidian + 8% Steel
    surface: '#212122', // Obsidian + 15% Steel
    surfaceMuted: '#28282A', // Obsidian + 20% Steel
    border: '#343437', // Obsidian + 28% Steel
    text: '#FFFFFF', // Paper
    textMuted: '#A1A1AA', // Steel
    primaryText: '#FFFFFF', // Paper
    success: '#14BBA6', // USDC Teal
    // Design-language 1.3: Coral = attention, needs review, not failure.
    // Brightened for the dark ground — kept distinct from `primary` by being
    // softer/less saturated, so "failed" never reads as "the usual accent."
    error: '#F87171',

    // Readable text shades for status badges/labels rendered on a tinted tone
    // background (`tone.ts`'s `${mint}33`-style pattern — the base hue at
    // low opacity over the page background). On a dark ground that tint
    // reads as a dark chip, so the readable text is the bright base hue
    // itself, not a darker shade of it.
    positiveText: '#14BBA6', // USDC Teal
    warningText: '#FBBF24',
    attentionText: '#F97316',
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
    // Same Obsidian+Steel ladder as `colors.*` above, not a separate scale —
    // the two were already numerically identical for panel/line before this.
    bg: '#161617', // Obsidian + 8% Steel
    panel: '#212122', // Obsidian + 15% Steel
    line: '#343437', // Obsidian + 28% Steel
    text: '#FFFFFF',
    textMuted: '#8C9099',
    textDim: '#575A60',
    accent: '#FF101A',
  },
} as const;

export type Theme = typeof theme;
