import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, /api and /uploads are proxied to the Express server.
export default defineConfig({
  plugins: [react()],
  // UI integration tests render the real app against a running, seeded API (see src/__tests__).
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.js',
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['src/__tests__/**/*.test.jsx'],
    env: { VITE_API_URL: process.env.VITE_API_URL || 'http://127.0.0.1:5055/api' },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
    },
  },
});
