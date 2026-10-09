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
    // `hidden`, not `true`: the maps are still written, so a developer debugging the local
    // `dist` can load them by hand, but no `//# sourceMappingURL` comment is appended, so
    // nothing fetches them off the deployed site. They are 2.84 MB against a 1.4 MB gzip
    // budget for the whole product — 2.1x the entire budget — and `npm run build:pages`
    // moves them out of `dist/` altogether before the Pages artefact is uploaded.
    // The emitted JS is byte-identical either way; only the `.map` files and that one
    // comment differ.
    sourcemap: 'hidden',
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
  worker: { format: 'es' },
});
