import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The teacher console's web app. The teacher server (server/index.ts) serves
// the build from dist-teacher/; in development, /api goes to that server.
export default defineConfig({
  root: here('.'),
  base: '/',
  envDir: here('..'),
  publicDir: here('../public'),
  plugins: [react()],
  build: {
    outDir: here('../dist-teacher'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5174,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
