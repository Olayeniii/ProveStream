import { ThemeProvider } from 'styled-components';

import { loadEnv } from './env.js';
import { Home } from './pages/Home.js';
import { GlobalStyle } from './styles/GlobalStyle.js';
import { theme } from './styles/theme.js';

export function App() {
  const env = loadEnv();

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <Home env={env} />
    </ThemeProvider>
  );
}
