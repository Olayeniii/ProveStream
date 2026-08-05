import { Route, HashRouter as Router, Routes } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';

import { loadEnv } from './env.js';
import { createApiClient } from './lib/api.js';
import { AdminDashboard } from './pages/AdminDashboard.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { AuditorDashboard } from './pages/AuditorDashboard.js';
import { HowItWorksPage } from './pages/HowItWorksPage.js';
import { LandingPage } from './pages/LandingPage.js';
import { PoliciesPage } from './pages/PoliciesPage.js';
import { StreamsOverview } from './pages/StreamsOverview.js';
import { SupplierDashboard } from './pages/SupplierDashboard.js';
import { TreasuryPage } from './pages/TreasuryPage.js';
import { GlobalStyle } from './styles/GlobalStyle.js';
import { theme } from './styles/theme.js';

export function App() {
  const env = loadEnv();
  const api = createApiClient(env.backendUrl);

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/streams" element={<StreamsOverview env={env} api={api} />} />
          <Route path="/auditor" element={<AuditorDashboard env={env} api={api} />} />
          <Route path="/supplier" element={<SupplierDashboard env={env} api={api} />} />
          <Route path="/policies" element={<PoliciesPage env={env} api={api} />} />
          <Route path="/treasury" element={<TreasuryPage env={env} api={api} />} />
          <Route path="/analytics" element={<AnalyticsPage env={env} api={api} />} />
          <Route path="/admin" element={<AdminDashboard env={env} api={api} />} />
          <Route path="/how-it-works" element={<HowItWorksPage env={env} api={api} />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}
