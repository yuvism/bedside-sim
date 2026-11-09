import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from https://<user>.github.io/bedside-sim/
export default defineConfig({
  base: '/bedside-sim/',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // The lazy 3D chunk (three.js) is ~585 kB raw but ~147 kB gzipped. The
    // project's real budget is 200 kB gzipped per dependency (see PROMPT.md).
    chunkSizeWarningLimit: 600,
  },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Case tests run hundreds of simulated minutes across many seeds.
    testTimeout: 60_000,
  },
});
