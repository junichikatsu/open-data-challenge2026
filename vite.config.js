import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages（https://junichikatsu.github.io/open-data-challenge2026/）とローカル開発の両方に対応
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: false,
  },
});
