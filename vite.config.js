/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: false,
  },
  esbuild: {
    // Strip debug logging from production builds (keep warnings/errors).
    drop: ['debugger'],
    pure: ['console.log', 'console.debug'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'ui-vendor': ['framer-motion', 'lucide-react'],
          'charts-vendor': ['recharts'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'i18n-vendor': ['i18next', 'react-i18next'],
        },
      },
    },
  },
})
