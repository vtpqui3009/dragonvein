import { defineConfig } from 'vite';
import { BASE_PATH, BUILD_VERSION } from './tools/site-config.mjs';

// base must match the GitHub Pages sub-path or every asset 404s in production.
// It is imported, not retyped, so the URL the gates poll (tools/preview-server.mjs)
// cannot drift away from the path the bundle was built for.
export default defineConfig({
  base: BASE_PATH,
  // The overlay prints this, so a screenshot says which build it came from.
  define: { __BUILD_VERSION__: JSON.stringify(BUILD_VERSION) },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
  worker: { format: 'es' },
});
