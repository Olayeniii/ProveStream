import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Repository tests share one real Postgres instance and truncate
    // tables between tests — running test files in parallel (vitest's
    // default) races those truncations against each other across files.
    fileParallelism: false,
  },
});
