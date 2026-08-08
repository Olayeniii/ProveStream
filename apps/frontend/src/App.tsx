import { lazy, Suspense } from 'react';
import { Route, HashRouter as Router, Routes } from 'react-router-dom';
import styled, { ThemeProvider } from 'styled-components';

import { loadEnv } from './env.js';
import { createApiClient } from './lib/api.js';
import { LandingPage } from './pages/LandingPage.js';
import { GlobalStyle } from './styles/GlobalStyle.js';
import { theme } from './styles/theme.js';

// Lazy-loaded: LandingPage is the only route most visitors hit first, so it
// stays in the main bundle; everything else only downloads once navigated to,
// instead of all pages shipping in one ~1.5MB chunk.
const StreamsOverview = lazy(() =>
  import('./pages/StreamsOverview.js').then((m) => ({ default: m.StreamsOverview })),
);
const AuditorDashboard = lazy(() =>
  import('./pages/AuditorDashboard.js').then((m) => ({ default: m.AuditorDashboard })),
);
const SupplierDashboard = lazy(() =>
  import('./pages/SupplierDashboard.js').then((m) => ({ default: m.SupplierDashboard })),
);
const PoliciesPage = lazy(() =>
  import('./pages/PoliciesPage.js').then((m) => ({ default: m.PoliciesPage })),
);
const TreasuryPage = lazy(() =>
  import('./pages/TreasuryPage.js').then((m) => ({ default: m.TreasuryPage })),
);
const AnalyticsPage = lazy(() =>
  import('./pages/AnalyticsPage.js').then((m) => ({ default: m.AnalyticsPage })),
);
const AdminDashboard = lazy(() =>
  import('./pages/AdminDashboard.js').then((m) => ({ default: m.AdminDashboard })),
);
const HowItWorksPage = lazy(() =>
  import('./pages/HowItWorksPage.js').then((m) => ({ default: m.HowItWorksPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage.js').then((m) => ({ default: m.NotFoundPage })),
);

export function App() {
  const env = loadEnv();
  const api = createApiClient(env.backendUrl);

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <Router>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage env={env} api={api} />} />
            <Route path="/streams" element={<StreamsOverview env={env} api={api} />} />
            <Route path="/auditor" element={<AuditorDashboard env={env} api={api} />} />
            <Route path="/supplier" element={<SupplierDashboard env={env} api={api} />} />
            <Route path="/policies" element={<PoliciesPage env={env} api={api} />} />
            <Route path="/treasury" element={<TreasuryPage env={env} api={api} />} />
            <Route path="/analytics" element={<AnalyticsPage env={env} api={api} />} />
            <Route path="/admin" element={<AdminDashboard env={env} api={api} />} />
            <Route path="/how-it-works" element={<HowItWorksPage env={env} api={api} />} />
            <Route path="*" element={<NotFoundPage env={env} api={api} />} />
          </Routes>
        </Suspense>
      </Router>
    </ThemeProvider>
  );
}

const RouteFallback = styled.div`
  min-height: 100vh;
  background: ${(props) => props.theme.colors.background};
`;
