import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND = process.env.ANNOTATOR_BACKEND ?? 'http://127.0.0.1:8077';

export default defineConfig({
  server: {
    port: 3000,
    host: '127.0.0.1',
    proxy: {
      // The Python backend owns every /api route, including image bytes.
      '/api': { target: BACKEND, changeOrigin: true },
    },
  },
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
