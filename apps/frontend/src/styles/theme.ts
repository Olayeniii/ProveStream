export const theme = {
  colors: {
    background: '#0b0f14',
    surface: '#141a22',
    border: '#26303c',
    text: '#e6edf3',
    textMuted: '#8b98a5',
    primary: '#4f9cff',
    primaryText: '#03101f',
    success: '#3fb950',
    error: '#f85149',
  },
  radius: '10px',
  fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
} as const;

export type Theme = typeof theme;
