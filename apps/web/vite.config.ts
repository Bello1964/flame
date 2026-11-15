/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        /*
         * Libraries get their own long-lived files, so after a deploy browsers re-download
         * only the app code that changed. Pages are already split by route (lazy-pages.ts).
         * Radix is left to automatic splitting so dialog and select code stays out of the
         * shell's first download.
         */
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
              priority: 30,
            },
            { name: 'query', test: /node_modules[\\/]@tanstack[\\/]/, priority: 20 },
            {
              // Only downloaded once a form is shown (sign-in or a record dialog).
              name: 'forms',
              test: /node_modules[\\/](zod|react-hook-form|@hookform)[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Same-origin API calls in development so session cookies work without CORS.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
