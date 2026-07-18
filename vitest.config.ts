import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
    environmentMatchGlobs: [
      ['lib/page-translate.test.ts', 'happy-dom'],
      ['lib/caption-ui.test.ts', 'happy-dom'],
    ],
  },
});
