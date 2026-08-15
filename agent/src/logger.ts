// Moved to `@provenance-streams/logger` so `apps/backend` can share the same
// implementation instead of using raw `console.*` — re-exported here so
// existing imports (`./logger.js` from `agent/src/index.ts`) keep working.
export { createLogger, type Logger } from '@provenance-streams/logger';
