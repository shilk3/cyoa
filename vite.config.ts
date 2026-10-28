/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the built app works from any path (GitHub Pages, a subfolder, file hosting).
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
  },
})
