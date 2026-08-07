import type { Theme } from '../styles/theme.js';
import type { StreamTone } from './streams.js';

/**
 * Text/background colors for a `StreamTone`, on the theme's tinted-badge
 * pattern (mint/gold/coral background at 20% opacity, a darker readable text
 * shade). Centralizes the mapping that status badges across the dashboards
 * (stream cards, risk gauge, payment status, health, fraud alerts) each used
 * to reimplement independently.
 */
export function getToneColor(theme: Theme, tone: StreamTone): { text: string; background: string } {
  switch (tone) {
    case 'positive':
      return { text: theme.colors.positiveText, background: `${theme.colors.mint}33` };
    case 'warning':
      return { text: theme.colors.warningText, background: `${theme.colors.gold}33` };
    case 'attention':
      return { text: theme.colors.attentionText, background: `${theme.colors.coral}33` };
    case 'negative':
      return { text: theme.colors.error, background: `${theme.colors.error}1a` };
    case 'neutral':
      return { text: theme.colors.textMuted, background: theme.colors.surfaceMuted };
  }
}
