import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // The monorepo shares a single .env at the repo root across the contracts,
  // agent, and frontend, rather than duplicating VITE_* values here.
  envDir: '../../',
});
