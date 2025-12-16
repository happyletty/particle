import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANT: This ensures assets are loaded relatively (e.g., "assets/index.js")
  // instead of absolutely (e.g., "/assets/index.js"), which fixes 404s on GitHub Pages.
  base: './', 
})