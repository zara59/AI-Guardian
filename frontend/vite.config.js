/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  esbuild: { jsx: 'automatic' },
  server: {
    fs: {
      // Allow imports from the Phase 4 security-layer (sibling of frontend/).
      allow: ['..', path.resolve(__dirname, '..')],
    },
  },
  preview: {
    // Web-service deploys (Render) visit the site via a hostname that is not
    // known at build time, so allow any host.
    allowedHosts: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
  },
})

// The reference directive keeps TypeScript editors happy; vitest reads the
// `test` block from the Vite config at runtime.