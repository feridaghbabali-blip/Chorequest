// Builds ChoreQuest as a single claude.ai artifact page (no server needed).
// Run: npm run build:artifact  ->  dist-artifact/chorequest.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'web',
  define: { 'import.meta.env.VITE_TARGET': JSON.stringify('artifact') },
  resolve: {
    alias: [{ find: /^\.\/fonts\.js$/, replacement: path.resolve('web/src/fonts.artifact.js') }],
  },
  build: { outDir: '../dist-artifact', emptyOutDir: true, assetsInlineLimit: 100000000, cssCodeSplit: false, modulePreload: false },
  plugins: [react()],
});
