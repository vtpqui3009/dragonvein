import { defineConfig } from 'vite';

// base must match the GitHub Pages sub-path or every asset 404s in production.
export default defineConfig({
  base: process.env.PAGES_BASE ?? '/dragonvein/',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
  worker: { format: 'es' },
});
