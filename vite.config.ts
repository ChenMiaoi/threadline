import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { githubPreview } from './dev/github-preview.ts';

export default defineConfig({
  plugins: [react(), githubPreview()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: { target: 'es2022' },
});
