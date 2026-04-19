/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['mupdf'],
  },
  assetsInclude: ['**/*.wasm'],
  worker: {
    // ES module format is required for code-splitting in workers that
    // dynamic-import further modules (e.g. mupdf's WASM glue).
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
