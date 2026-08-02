import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    // @circle-fin/w3s-pw-web-sdk depends on jsonwebtoken (for its social-login
    // code path, which this app doesn't use), which in turn expects Node's
    // buffer/crypto/stream/util to exist. This polyfills just enough of them
    // for the SDK's module graph to load in the browser.
    nodePolyfills({ include: ['buffer', 'crypto', 'stream', 'util'] }),
  ],
  // The monorepo shares a single .env at the repo root across the contracts,
  // agent, and frontend, rather than duplicating VITE_* values here.
  envDir: '../../',
});
