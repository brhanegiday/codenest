import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Outputs to <extension-root>/out/webview/threadPanel/assets/
// The extension host generates HTML that loads these via webview.asWebviewUri().
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../../out/webview/threadPanel',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Deterministic names — no content hashes — so threadPanel.ts can
        // reference them by a fixed path without knowing the build hash.
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/chunk-[name].js',
        assetFileNames: 'assets/index[extname]',
      },
    },
  },
  base: './',
});
