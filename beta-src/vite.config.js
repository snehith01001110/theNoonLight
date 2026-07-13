import { defineConfig } from 'vite';

// Builds the /beta experience into ../beta so the existing GitHub Pages repo
// serves it at thenoonlight.com/beta. The root site (../index.html) is untouched.
export default defineConfig({
  base: '/beta/',
  build: {
    outDir: '../beta',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
