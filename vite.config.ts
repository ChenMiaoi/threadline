import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { githubPreview } from './dev/github-preview.ts';

export default defineConfig({
  plugins: [react(), githubPreview()],
  clearScreen: false,
  // Keep asynchronous UI imports responsive while isolated test workers share the CPU.
  test: { maxWorkers: Math.min(4, availableParallelism()) },
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: { target: 'es2022' },
});
