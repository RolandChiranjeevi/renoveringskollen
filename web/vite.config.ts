/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    // API_URL används av E2E-testerna för att peka mot en separat testserver.
    proxy: { '/api': process.env.API_URL ?? 'http://127.0.0.1:3100' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
