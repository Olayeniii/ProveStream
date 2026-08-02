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
    error: '#F97316',
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
} as const;

export type Theme = typeof theme;
